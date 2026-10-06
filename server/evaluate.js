// Pipeline de avaliação: passos persistidos e retomáveis (passos concluídos são pulados).
import * as store from './store.js';
import * as ai from './ai.js';
import { config as cfg } from './config.js';
import { contarLinhas, contarPalavras } from './util.js';
import { estimar } from './tri.js';
import { AREAS_CURTAS, ORDEM_AREAS } from './taxonomy.js';
import {
  COMPETENCIAS, PROPOSTA_FIXA,
  SCHEMA_COMENTARIOS, promptComentarios, validarComentarios,
  SCHEMA_CORRECAO, promptCorretor, validarCorrecao,
  SCHEMA_PARECER, promptParecer, validarParecer,
  SCHEMA_DIAGNOSTICO, promptDiagnostico, validarDiagnostico,
} from './prompts.js';
import { montarRelatorio } from './report.js';

export const PASSOS = [
  { id: 'objetiva', titulo: 'Corrigindo questões objetivas e estimando notas (TRI)' },
  { id: 'comentarios', titulo: 'Comentando questões erradas e em branco' },
  { id: 'corretor_1', titulo: 'Redação — corretor 1' },
  { id: 'corretor_2', titulo: 'Redação — corretor 2' },
  { id: 'corretor_3', titulo: 'Redação — corretor 3 (se houver discrepância)' },
  { id: 'parecer', titulo: 'Parecer final da redação' },
  { id: 'diagnostico', titulo: 'Diagnóstico e plano de estudos' },
  { id: 'relatorio', titulo: 'Montando o relatório' },
];

const TAM_LOTE_COMENTARIOS = 6;
export const LINHAS_MINIMAS = 8; // ≤ 7 linhas = texto insuficiente

export function passosIniciais() {
  return PASSOS.map((p) => ({ ...p, estado: 'pendente' }));
}

function setPasso(id, passoId, estado) {
  store.updateMeta(id, (m) => {
    m.avaliacao = m.avaliacao || { passos: passosIniciais() };
    const p = m.avaliacao.passos.find((x) => x.id === passoId);
    if (p) p.estado = estado;
  });
}

function estadoPasso(id, passoId) {
  return store.getMeta(id).avaliacao?.passos?.find((x) => x.id === passoId)?.estado;
}

function salvarDado(id, chave, valor) {
  store.update(id, 'avaliacao', (a) => {
    a.dados = a.dados || {};
    a.dados[chave] = valor;
  }, { dados: {} });
}

function dados(id) {
  return store.read(id, 'avaliacao', { dados: {} }).dados || {};
}

async function passo(id, passoId, fn) {
  const est = estadoPasso(id, passoId);
  if (est === 'ok' || est === 'pulado') return dados(id)[passoId];
  setPasso(id, passoId, 'andando');
  const r = await fn();
  if (r === PULAR) {
    setPasso(id, passoId, 'pulado');
    return undefined;
  }
  salvarDado(id, passoId, r);
  setPasso(id, passoId, 'ok');
  return r;
}
const PULAR = Symbol('pular');

// ───────────── 1. Objetiva ─────────────

export function corrigirObjetiva(questoes, respostas) {
  const itens = questoes.map((q) => {
    const marcada = respostas?.[q.id] || null;
    const status = q.anulada ? 'anulada' : !marcada ? 'branco' : marcada === q.gabarito ? 'certa' : 'errada';
    return { qid: q.id, n: q.n, area: q.area, disciplina: q.disciplina, assunto: q.assunto, dificuldade: q.dificuldade, marcada, gabarito: q.gabarito, status };
  });
  const agg = (key) => {
    const m = {};
    for (const it of itens) {
      if (it.status === 'anulada') continue;
      const k = key(it);
      m[k] = m[k] || { acertos: 0, total: 0, brancos: 0 };
      m[k].total++;
      if (it.status === 'certa') m[k].acertos++;
      if (it.status === 'branco') m[k].brancos++;
    }
    return m;
  };
  const porArea = {};
  for (const area of ORDEM_AREAS) {
    const doArea = itens.filter((it) => it.area === area);
    if (!doArea.length) continue;
    const validos = doArea.filter((it) => it.status !== 'anulada');
    const est = estimar(validos.map((it) => ({ id: it.qid, dificuldade: it.dificuldade, acertou: it.status === 'certa' })));
    porArea[area] = {
      nome: AREAS_CURTAS[area],
      acertos: validos.filter((it) => it.status === 'certa').length,
      brancos: validos.filter((it) => it.status === 'branco').length,
      total: validos.length,
      anuladas: doArea.length - validos.length,
      nota: est ? est.nota : null,
      margem: est ? est.margem : null,
    };
  }
  return {
    itens,
    porArea,
    porDisciplina: agg((it) => `${it.area}|${it.disciplina}`),
    porDificuldade: agg((it) => it.dificuldade),
    porAssunto: agg((it) => `${it.disciplina}|${it.assunto}`),
    acertos: itens.filter((it) => it.status === 'certa').length,
    brancos: itens.filter((it) => it.status === 'branco').length,
    anuladas: itens.filter((it) => it.status === 'anulada').length,
    total: itens.filter((it) => it.status !== 'anulada').length,
  };
}

// ───────────── 3–4. Redação ─────────────

const totalDe = (c) => c.competencias.reduce((s, x) => s + x.nota, 0);
const notasDe = (c) => (c.anulacao?.anulada ? COMPETENCIAS.map(() => 0) : COMPETENCIAS.map((id) => c.competencias.find((x) => x.id === id)?.nota ?? 0));

export function discrepantes(a, b) {
  const na = notasDe(a), nb = notasDe(b);
  const ta = na.reduce((s, x) => s + x, 0), tb = nb.reduce((s, x) => s + x, 0);
  return Math.abs(ta - tb) > 100 || na.some((x, i) => Math.abs(x - nb[i]) > 80);
}

/** Aplica as regras do Enem para chegar à nota final da redação. */
export function notaFinalRedacao(c1, c2, c3) {
  const n1 = notasDe(c1), n2 = notasDe(c2);
  const sum = (v) => v.reduce((s, x) => s + x, 0);
  if (!discrepantes(c1, c2)) {
    const comp = COMPETENCIAS.map((id, i) => ({ id, nota: (n1[i] + n2[i]) / 2 }));
    return { competencias: comp, total: sum(comp.map((c) => c.nota)), regra: 'media', discrepancia: false, banca: false, maisProximo: null };
  }
  if (!c3) return null; // precisa do 3º corretor
  const n3 = notasDe(c3);
  const t1 = sum(n1), t2 = sum(n2), t3 = sum(n3);
  const maisProximo = Math.abs(t3 - t1) <= Math.abs(t3 - t2) ? 1 : 2;
  const nx = maisProximo === 1 ? n1 : n2;
  const comp = COMPETENCIAS.map((id, i) => ({ id, nota: (n3[i] + nx[i]) / 2 }));
  const banca = discrepantes(c3, c1) && discrepantes(c3, c2);
  return { competencias: comp, total: sum(comp.map((c) => c.nota)), regra: 'terceiro', discrepancia: true, banca, maisProximo };
}

export function redacaoInsuficiente(texto) {
  const linhas = contarLinhas(texto);
  return { insuficiente: linhas < LINHAS_MINIMAS, branco: !String(texto || '').trim(), linhas };
}

function parecerEstatico(info) {
  const motivo = info.branco ? 'a folha de redação foi entregue em branco' : `o texto tem cerca de ${info.linhas} linha(s), abaixo do mínimo de 8 linhas`;
  return {
    resumo: `A redação recebeu nota 0 por texto insuficiente: ${motivo}. No Enem, textos com até 7 linhas são considerados insuficientes e não são avaliados nas competências.`,
    porCompetencia: COMPETENCIAS.map((id) => ({ id, comentario: 'Não avaliada (texto insuficiente).', comoSubir: 'Escreva um texto completo, entre 20 e 30 linhas, com introdução, desenvolvimento e conclusão.' })),
    desviosPrincipais: [],
    exemploPropostaIntervencao: '',
    planoDeTreino: [
      'Treine o planejamento em 10 minutos: tese, dois argumentos e proposta de intervenção.',
      'Escreva redações completas cronometradas (cerca de 60 minutos) toda semana.',
      'Reserve tempo da prova para a redação: comece por ela ou defina um horário-limite para as questões.',
    ],
    estatico: true,
  };
}

async function corretor(id, papel, red, texto, linhas) {
  const p = promptCorretor({ tema: red.tema, textos: red.textos, redacao: texto, linhas, papel });
  return ai.json({
    kind: 'corretor',
    input: { redacao: texto, papel, tema: red.tema },
    model: cfg.modelAvaliacao,
    system: p.system,
    user: p.user,
    schema: SCHEMA_CORRECAO,
    validate: validarCorrecao,
    maxTokens: 12000,
    toolName: 'entregar_correcao',
  });
}

// ───────────── Pipeline ─────────────

export async function runAvaliacao(id) {
  const meta = store.getMeta(id);
  if (!meta) return;
  if (!meta.avaliacao?.passos) store.updateMeta(id, (m) => { m.avaliacao = { passos: passosIniciais() }; });
  // passos que ficaram "andando" numa execução interrompida voltam a pendente
  store.updateMeta(id, (m) => { m.avaliacao.passos.forEach((p) => { if (p.estado === 'andando' || p.estado === 'erro') p.estado = 'pendente'; }); });

  const conteudo = store.read(id, 'conteudo');
  const sessao = store.read(id, 'sessao', { respostas: {}, marcadas: [], redacaoTexto: '' });
  const questoes = conteudo.questoes || [];
  const red = conteudo.redacao || null;
  const texto = String(sessao.redacaoTexto || '');

  // 1. objetiva
  const obj = await passo(id, 'objetiva', async () => corrigirObjetiva(questoes, sessao.respostas));

  // 2. comentários (lotes de 6, salvos incrementalmente)
  await passo(id, 'comentarios', async () => {
    const errados = obj.itens.filter((it) => it.status === 'errada' || it.status === 'branco');
    if (!errados.length) return {};
    const jaFeitos = { ...(dados(id).comentarios_parcial || {}) };
    const pend = errados.filter((it) => !jaFeitos[it.qid]);
    const porId = new Map(questoes.map((q) => [q.id, q]));
    const grupos = [];
    for (let i = 0; i < pend.length; i += TAM_LOTE_COMENTARIOS) grupos.push(pend.slice(i, i + TAM_LOTE_COMENTARIOS));
    const rs = await Promise.allSettled(grupos.map(async (g) => {
      const itens = g.map((it) => ({ qid: it.qid, marcada: it.marcada, assunto: it.assunto, questao: porId.get(it.qid) }));
      const p = promptComentarios(itens);
      const out = await ai.json({
        kind: 'comentarios',
        input: { itens: itens.map(({ qid, marcada, assunto }) => ({ qid, marcada, assunto })) },
        model: cfg.modelAvaliacao,
        system: p.system,
        user: p.user,
        schema: SCHEMA_COMENTARIOS,
        validate: validarComentarios(g.map((it) => it.qid)),
        maxTokens: 6000,
        toolName: 'entregar_comentarios',
      });
      store.update(id, 'avaliacao', (a) => {
        a.dados = a.dados || {};
        a.dados.comentarios_parcial = a.dados.comentarios_parcial || {};
        for (const c of out.comentarios) if (g.some((it) => it.qid === c.qid)) a.dados.comentarios_parcial[c.qid] = { porQueAtrai: c.porQueAtrai, conceitoChave: c.conceitoChave, dica: c.dica };
      }, { dados: {} });
    }));
    const falha = rs.find((r) => r.status === 'rejected');
    if (falha) throw falha.reason;
    return dados(id).comentarios_parcial || {};
  });

  // 3–5. redação
  let redacaoFinal = null;
  if (!red) {
    for (const p of ['corretor_1', 'corretor_2', 'corretor_3', 'parecer']) await passo(id, p, async () => PULAR);
  } else {
    const info = redacaoInsuficiente(texto);
    const palavras = contarPalavras(texto);
    if (info.insuficiente) {
      for (const p of ['corretor_1', 'corretor_2', 'corretor_3']) await passo(id, p, async () => PULAR);
      redacaoFinal = {
        competencias: COMPETENCIAS.map((cid) => ({ id: cid, nota: 0 })),
        total: 0, regra: 'insuficiente', discrepancia: false, banca: false, maisProximo: null,
        insuficiente: true, branco: info.branco, anulada: true,
        motivo: info.branco ? 'Redação em branco' : 'Texto insuficiente (até 7 linhas)',
        linhas: info.linhas, palavras,
      };
      salvarDado(id, 'redacaoFinal', redacaoFinal);
      await passo(id, 'parecer', async () => parecerEstatico(info));
    } else {
      const [c1, c2] = await Promise.all([
        passo(id, 'corretor_1', () => corretor(id, 1, red, texto, info.linhas)),
        passo(id, 'corretor_2', () => corretor(id, 2, red, texto, info.linhas)),
      ]);
      const c3 = await passo(id, 'corretor_3', async () => (discrepantes(c1, c2) ? corretor(id, 3, red, texto, info.linhas) : PULAR));
      const f = notaFinalRedacao(c1, c2, c3 || null);
      const anulada = [c1, c2, c3].filter(Boolean).every((c) => c.anulacao?.anulada) || f.total === 0;
      const motivoAnul = [c1, c2, c3].find((c) => c?.anulacao?.anulada)?.anulacao?.motivo || '';
      redacaoFinal = { ...f, insuficiente: false, branco: false, anulada, motivo: anulada ? motivoAnul : '', linhas: info.linhas, palavras };
      salvarDado(id, 'redacaoFinal', redacaoFinal);
      const regraTxt = f.regra === 'media'
        ? 'média simples dos dois corretores (sem discrepância)'
        : `discrepância entre os corretores 1 e 2; nota final = média entre o corretor 3 e o corretor ${f.maisProximo} (mais próximo)${f.banca ? '; o 3º corretor também divergiu de ambos — no Enem real a redação iria para banca presencial' : ''}`;
      await passo(id, 'parecer', async () => {
        const corretores = [c1 && { papel: 1, dados: c1 }, c2 && { papel: 2, dados: c2 }, c3 && { papel: 3, dados: c3 }].filter(Boolean);
        const p = promptParecer({ tema: red.tema, redacao: texto, notasFinais: f.competencias, corretores, regra: regraTxt });
        return ai.json({
          kind: 'parecer',
          input: { notasFinais: f.competencias, tema: red.tema },
          model: cfg.modelAvaliacao,
          system: p.system,
          user: p.user,
          schema: SCHEMA_PARECER,
          validate: validarParecer,
          maxTokens: 8000,
          toolName: 'entregar_parecer',
        });
      });
    }
  }

  // 6. diagnóstico
  await passo(id, 'diagnostico', async () => {
    const estatisticas = {
      porArea: Object.fromEntries(Object.entries(obj.porArea).map(([k, v]) => [v.nome, `${v.acertos}/${v.total} (nota estimada ${v.nota})`])),
      porDisciplina: Object.fromEntries(Object.entries(obj.porDisciplina).map(([k, v]) => [k.split('|')[1], `${v.acertos}/${v.total}`])),
      porDificuldade: Object.fromEntries(Object.entries(obj.porDificuldade).map(([k, v]) => [k, `${v.acertos}/${v.total}`])),
      porAssunto: Object.fromEntries(Object.entries(obj.porAssunto).filter(([, v]) => v.acertos < v.total).map(([k, v]) => [k.replace('|', ' — '), `${v.acertos}/${v.total}`])),
    };
    const erros = obj.itens.filter((it) => it.status === 'errada' || it.status === 'branco');
    const redacao = redacaoFinal || dados(id).redacaoFinal || null;
    const p = promptDiagnostico({ estatisticas, erros, redacao });
    return ai.json({
      kind: 'diagnostico',
      input: { erros, estatisticas },
      model: cfg.modelAvaliacao,
      system: p.system,
      user: p.user,
      schema: SCHEMA_DIAGNOSTICO,
      validate: validarDiagnostico,
      maxTokens: 8000,
      toolName: 'entregar_diagnostico',
    });
  });

  // 7. relatório
  await passo(id, 'relatorio', async () => {
    const m = store.getMeta(id);
    const d = dados(id);
    const { md, resumo } = montarRelatorio({ meta: m, conteudo, sessao, dados: d });
    store.writeText(id, 'relatorio.md', md);
    store.updateMeta(id, (mm) => { mm.resumo = resumo; });
    return { geradoEm: new Date().toISOString() };
  });

  store.updateMeta(id, (m) => {
    m.status = 'concluida';
    m.erro = null;
  });
  console.log(`[avaliar ${id}] concluída`);
}


