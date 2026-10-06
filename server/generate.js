// Pipeline de geração: proposta de redação → plano determinístico → questões em lotes
// (com resolução independente e regeneração) → prova pronta. Retomável a qualquer momento.
import * as store from './store.js';
import * as ai from './ai.js';
import { config as cfg } from './config.js';
import { rng, shuffle, distribuir, letrasBalanceadas } from './util.js';
import { ORDEM_AREAS, PESOS, ASSUNTOS, LINGUA_ESTRANGEIRA, GENEROS_LE, DIFICULDADE_PROP } from './taxonomy.js';
import {
  PROPOSTA_FIXA, SCHEMA_PROPOSTA, promptProposta, validarProposta,
  SCHEMA_QUESTOES, promptQuestoes, validarLoteQuestoes,
  SCHEMA_RESOLUCAO, promptResolucao, validarResolucao,
} from './prompts.js';

const TAM_LOTE = 5;
const MAX_REGENERACOES = 3;

// ───────────── Planejamento (sem IA) ─────────────

export function planejar(seed, config) {
  const r = rng(`plano:${seed}`);
  const temTema = !!config.redacao;
  const plano = [];
  let n = 1;
  for (const area of ORDEM_AREAS) {
    const total = config.contagens[area] || 0;
    if (!total) continue;
    let disciplinas = [];
    let nLE = 0;
    if (area === 'LC') {
      nLE = Math.min(total, Math.round((total * 5) / 45));
      const resto = distribuir(total - nLE, PESOS.LC);
      for (const [d, k] of Object.entries(resto)) for (let i = 0; i < k; i++) disciplinas.push(d);
      disciplinas = [...Array(nLE).fill(LINGUA_ESTRANGEIRA), ...shuffle(disciplinas, r)];
    } else {
      const dist = distribuir(total, PESOS[area]);
      for (const [d, k] of Object.entries(dist)) for (let i = 0; i < k; i++) disciplinas.push(d);
      disciplinas = shuffle(disciplinas, r);
    }
    const difs = distribuir(total, DIFICULDADE_PROP);
    const dificuldades = shuffle(Object.entries(difs).flatMap(([d, k]) => Array(k).fill(d)), r);
    const letras = letrasBalanceadas(total, r);
    const pools = {};
    const proxAssunto = (d) => {
      if (!pools[d] || !pools[d].length) pools[d] = shuffle(ASSUNTOS[d], r);
      return pools[d].pop();
    };
    const generos = shuffle(GENEROS_LE, r);
    // ~20% das questões elegíveis (LC sem LE, e CH) contextualizadas no tema
    const elegiveis = disciplinas.map((d, i) => i).filter((i) => temTema && config.temaNasQuestoes && (area === 'CH' || (area === 'LC' && disciplinas[i] !== LINGUA_ESTRANGEIRA)));
    const tematicas = new Set(shuffle(elegiveis, r).slice(0, Math.round(elegiveis.length * 0.2)));
    disciplinas.forEach((d, i) => {
      const le = d === LINGUA_ESTRANGEIRA;
      plano.push({
        n: n++,
        area,
        disciplina: d,
        assunto: proxAssunto(d),
        dificuldade: dificuldades[i],
        gabaritoAlvo: letras[i],
        tematica: tematicas.has(i),
        lingua: le ? config.lingua : null,
        ...(le ? { genero: generos[i % generos.length] } : {}),
      });
    });
  }
  return plano;
}

function lotes(specs) {
  const grupos = new Map();
  for (const s of specs) {
    const k = `${s.area}:${s.lingua ? 'LE' : ''}`;
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(s);
  }
  const out = [];
  for (const g of grupos.values()) for (let i = 0; i < g.length; i += TAM_LOTE) out.push(g.slice(i, i + TAM_LOTE));
  return out;
}

// ───────────── Persistência incremental ─────────────

function salvarQuestao(id, q) {
  const c = store.update(id, 'conteudo', (c) => {
    c.questoes = (c.questoes || []).filter((x) => x.n !== q.n);
    c.questoes.push(q);
  });
  const feito = c.questoes.length;
  const total = c.plano.length;
  store.updateMeta(id, (m) => {
    m.progresso = { etapa: `Criando e verificando questões ${feito}/${total}`, feito, total, atualizadoEm: new Date().toISOString() };
  });
}

function setEtapa(id, etapa, extra = {}) {
  store.updateMeta(id, (m) => {
    m.progresso = { ...(m.progresso || {}), etapa, ...extra, atualizadoEm: new Date().toISOString() };
  });
}

// ───────────── Questões ─────────────

function montarQuestao(spec, raw, tema) {
  return {
    id: `q${spec.n}`,
    n: spec.n,
    area: spec.area,
    disciplina: spec.disciplina,
    assunto: spec.assunto,
    dificuldade: spec.dificuldade,
    lingua: spec.lingua || null,
    tematica: !!(spec.tematica && tema),
    textoBase: raw.textoBase.trim(),
    fonte: (raw.fonte || 'Texto elaborado para este simulado').trim(),
    enunciado: raw.enunciado.trim(),
    alternativas: raw.alternativas.map((a) => ({ letra: a.letra, texto: String(a.texto).trim() })),
    gabarito: raw.gabarito,
    explicacao: raw.explicacao.trim(),
    habilidade: (raw.habilidade || '').trim(),
    verificada: false,
    anulada: false,
  };
}

async function gerarLote(specs, tema, evitar) {
  const area = specs[0].area;
  const lingua = specs[0].lingua;
  const p = promptQuestoes({ specs, area, lingua, tema, evitar });
  const out = await ai.json({
    kind: 'questoes',
    input: { specs, area, lingua, tema, evitar },
    model: cfg.modelGeracao,
    system: p.system,
    user: p.user,
    schema: SCHEMA_QUESTOES,
    validate: validarLoteQuestoes(specs),
    maxTokens: 4000 + 2400 * specs.length,
    toolName: 'entregar_questoes',
  });
  return out.questoes.map((raw, i) => montarQuestao(specs[i], raw, tema));
}

async function resolver(q) {
  const semGabarito = { ...q };
  delete semGabarito.gabarito;
  delete semGabarito.explicacao;
  const p = promptResolucao(semGabarito);
  return ai.json({
    kind: 'resolucao',
    input: { questao: semGabarito, gabaritoMock: q.gabarito },
    model: cfg.modelValidacao,
    system: p.system,
    user: p.user,
    schema: SCHEMA_RESOLUCAO,
    validate: validarResolucao,
    maxTokens: 6000,
    toolName: 'entregar_resolucao',
  });
}

async function verificarEFinalizar(id, spec, q, tema) {
  for (let regen = 0; ; regen++) {
    const res = await resolver(q);
    const ok = res.alternativa === q.gabarito && !res.problema;
    if (ok) {
      q.verificada = true;
      q.anulada = false;
      salvarQuestao(id, q);
      return;
    }
    const motivo = res.problema
      ? `problema apontado pelo revisor: ${res.motivo}`
      : `o revisor resolveu de forma independente e chegou à alternativa ${res.alternativa}, não à ${q.gabarito}. Resolução do revisor: ${String(res.resolucao).slice(0, 600)}`;
    console.log(`[gerar ${id}] q${spec.n}: reprovada na verificação (${regen + 1}/${MAX_REGENERACOES + 1}) — ${res.problema ? 'problema' : 'divergência'}`);
    if (regen >= MAX_REGENERACOES) {
      q.verificada = false;
      q.anulada = true;
      q.motivoAnulacao = motivo.slice(0, 400);
      salvarQuestao(id, q);
      return;
    }
    [q] = await gerarLote([spec], tema, `${motivo}. Garanta uma única alternativa correta, inequívoca, na letra ${spec.gabaritoAlvo}.`);
  }
}

async function processarLote(id, specs, tema) {
  const qs = await gerarLote(specs, tema);
  const rs = await Promise.allSettled(qs.map((q, i) => verificarEFinalizar(id, specs[i], q, tema)));
  const falha = rs.find((r) => r.status === 'rejected');
  if (falha) throw falha.reason;
}

// ───────────── Pipeline ─────────────

export async function runGeracao(id) {
  const meta = store.getMeta(id);
  if (!meta) return;
  const config = meta.config;
  let conteudo = store.read(id, 'conteudo', {}) || {};

  if (config.redacao && !conteudo.redacao) {
    setEtapa(id, 'Elaborando proposta de redação');
    const semente = config.temaModo === 'escolhido' ? config.temaTexto : config.temaSemente;
    const p = promptProposta({ semente, escolhidoPeloUsuario: config.temaModo === 'escolhido' });
    const out = await ai.json({
      kind: 'proposta',
      input: { semente },
      model: cfg.modelGeracao,
      system: p.system,
      user: p.user,
      schema: SCHEMA_PROPOSTA,
      validate: validarProposta,
      maxTokens: 6000,
      toolName: 'entregar_proposta',
    });
    const tema = out.tema.trim().replace(/^["“]|["”]$/g, '');
    conteudo = store.update(id, 'conteudo', (c) => {
      c.redacao = {
        tema,
        eixo: out.eixo.trim(),
        textos: out.textos.map((t) => ({ texto: t.texto.trim(), fonte: (t.fonte || 'Texto elaborado para este simulado').trim() })),
        proposta: PROPOSTA_FIXA(tema),
      };
    });
    store.updateMeta(id, (m) => { m.tema = tema; });
    console.log(`[gerar ${id}] proposta de redação pronta: ${tema}`);
  }

  if (!conteudo.plano) {
    conteudo = store.update(id, 'conteudo', (c) => {
      c.plano = planejar(id, config);
      c.questoes = c.questoes || [];
    });
  }

  const tema = conteudo.redacao?.tema || null;
  const prontas = new Set((conteudo.questoes || []).map((q) => q.n));
  const pendentes = conteudo.plano.filter((s) => !prontas.has(s.n));
  const total = conteudo.plano.length;
  setEtapa(id, `Criando e verificando questões ${total - pendentes.length}/${total}`, { feito: total - pendentes.length, total });

  if (pendentes.length) {
    const ls = lotes(pendentes);
    console.log(`[gerar ${id}] ${pendentes.length} questões pendentes em ${ls.length} lotes`);
    const rs = await Promise.allSettled(ls.map((l) => processarLote(id, l, tema)));
    const falha = rs.find((r) => r.status === 'rejected');
    if (falha) throw falha.reason;
  }

  store.update(id, 'conteudo', (c) => {
    const porN = new Map(c.questoes.map((q) => [q.n, q]));
    c.questoes = [...porN.values()].sort((a, b) => a.n - b.n);
  });
  const final = store.read(id, 'conteudo');
  if (final.questoes.length !== final.plano.length) throw new Error('geração incompleta');
  store.updateMeta(id, (m) => {
    m.status = 'pronta';
    m.erro = null;
    m.progresso = { etapa: 'Prova pronta', feito: total, total, atualizadoEm: new Date().toISOString() };
  });
  console.log(`[gerar ${id}] prova pronta (${total} questões, ${final.questoes.filter((q) => q.anulada).length} anuladas)`);
}
