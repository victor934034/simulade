// Montagem do relatório final em Markdown — a única saída entregue ao usuário.
import { AREAS, AREAS_CURTAS, ORDEM_AREAS, DIFICULDADE_NOME, LINGUAS } from './taxonomy.js';
import { COMPETENCIAS, NOMES_COMPETENCIAS } from './prompts.js';
import { fmtDuracao, fmtDataHora } from './util.js';

const num = (x, d = 1) => (x == null ? '—' : Number(x).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: d }));
const cell = (s) => String(s ?? '').replace(/\r?\n+/g, ' ').replace(/\|/g, '\\|').trim();
const quote = (s) => String(s ?? '').replace(/\r\n?/g, '\n').split('\n').map((l) => (l.trim() ? `> ${l}` : '>')).join('\n');
const primeiraFrase = (s) => {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  const m = t.match(/^(.{20,}?[.!?])(\s|$)/);
  return (m ? m[1] : t).slice(0, 320);
};
const pct = (a, t) => (t ? `${Math.round((100 * a) / t)}%` : '—');

export function nomeModo(config) {
  if (config.modo === 'dia1') return 'Dia 1 — Linguagens, Ciências Humanas e Redação';
  if (config.modo === 'dia2') return 'Dia 2 — Ciências da Natureza e Matemática';
  const partes = ORDEM_AREAS.filter((a) => config.contagens[a] > 0).map((a) => `${AREAS_CURTAS[a]} (${config.contagens[a]})`);
  if (config.redacao) partes.push('Redação');
  return `Personalizada — ${partes.join(', ')}`;
}

export function tituloProva(meta) {
  if (meta.tema) return meta.tema;
  return nomeModo(meta.config);
}

export function montarRelatorio({ meta, conteudo, sessao, dados }) {
  const obj = dados.objetiva;
  const red = conteudo.redacao;
  const rf = dados.redacaoFinal || null;
  const questoes = conteudo.questoes || [];
  const L = [];
  const push = (...xs) => L.push(...xs);

  // ── Cabeçalho
  const ini = meta.sessao?.iniciadaEm ? new Date(meta.sessao.iniciadaEm) : null;
  const fim = meta.sessao?.finalizadaEm ? new Date(meta.sessao.finalizadaEm) : null;
  const usadoMin = ini && fim ? Math.min(meta.config.duracaoMin, Math.max(0, (fim - ini) / 60000)) : null;
  push('# Simulaê — Relatório do simulado', '');
  push(`- **Prova:** ${nomeModo(meta.config)}`);
  if (red) push(`- **Tema da redação:** ${red.tema}`);
  if (meta.config.contagens.LC > 0) push(`- **Língua estrangeira:** ${LINGUAS[meta.config.lingua] || '—'}`);
  push(`- **Data:** ${fmtDataHora(meta.sessao?.iniciadaEm || meta.criadaEm)}`);
  push(`- **Duração da prova:** ${fmtDuracao(meta.config.duracaoMin)}`);
  push(`- **Tempo usado:** ${usadoMin == null ? '—' : fmtDuracao(usadoMin)}${meta.sessao?.autoFinalizada ? ' (tempo esgotado — finalizada automaticamente)' : ''}`);
  push('');

  // ── Resumo das notas
  push('## Resumo das notas', '');
  push('| Área | Acertos | Nota estimada | Margem |', '|---|---|---|---|');
  const notas = {};
  for (const a of ORDEM_AREAS) {
    const r = obj.porArea[a];
    if (!r) continue;
    notas[a] = r.nota;
    push(`| ${AREAS[a]} | ${r.acertos}/${r.total}${r.anuladas ? ` (${r.anuladas} anulada${r.anuladas > 1 ? 's' : ''})` : ''} | ${num(r.nota)} | ± ${r.margem} |`);
  }
  if (rf) {
    notas.redacao = rf.total;
    push(`| Redação | — | ${num(rf.total, 0)} | — |`);
  }
  const vals = Object.values(notas).filter((v) => v != null);
  const media = vals.length ? Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10 : null;
  const completa = ORDEM_AREAS.every((a) => obj.porArea[a]) && !!rf;
  push(`| **Média${completa ? '' : ' (parcial)'}** | ${obj.acertos}/${obj.total} | **${num(media)}** | — |`, '');
  if (!completa) push(`*Média parcial: considera apenas as ${vals.length} nota(s) presentes nesta prova, não as cinco notas do Enem completo.*`, '');
  push('> **Atenção:** as notas objetivas são **estimativas** por uma TRI aproximada (modelo de 3 parâmetros com parâmetros atribuídos por nível de dificuldade, pois itens gerados não têm calibração real). A nota da redação foi atribuída por IA, seguindo a matriz oficial, e também é uma estimativa.', '');

  // ── Redação
  if (red) {
    push('## Redação', '');
    push(`**Tema:** ${red.tema}`, '');
    push(`**Extensão estimada:** ≈ ${rf?.linhas ?? 0} linhas · ${rf?.palavras ?? 0} palavras`, '');
    const c1 = dados.corretor_1, c2 = dados.corretor_2, c3 = dados.corretor_3;
    const parecer = dados.parecer;
    if (rf?.insuficiente) {
      push(`**Nota final: 0 / 1000** — ${rf.motivo}. A redação não foi enviada aos corretores.`, '');
    } else if (rf) {
      push('### Notas por competência', '');
      const cab = ['Competência', 'Corretor 1', 'Corretor 2', ...(c3 ? ['Corretor 3'] : []), 'Final'];
      push(`| ${cab.join(' | ')} |`, `|${cab.map(() => '---').join('|')}|`);
      const notaDe = (c, id) => (c ? (c.anulacao?.anulada ? 0 : c.competencias.find((x) => x.id === id)?.nota ?? '—') : '—');
      for (const id of COMPETENCIAS) {
        const fin = rf.competencias.find((x) => x.id === id)?.nota;
        push(`| ${id} — ${NOMES_COMPETENCIAS[id]} | ${notaDe(c1, id)} | ${notaDe(c2, id)} |${c3 ? ` ${notaDe(c3, id)} |` : ''} **${num(fin, 0)}** |`);
      }
      const tot = (c) => (c ? (c.anulacao?.anulada ? 0 : c.competencias.reduce((s, x) => s + x.nota, 0)) : '—');
      push(`| **Total** | ${tot(c1)} | ${tot(c2)} |${c3 ? ` ${tot(c3)} |` : ''} **${num(rf.total, 0)}** |`, '');
      if (rf.regra === 'media') push('**Regra aplicada:** sem discrepância entre os corretores 1 e 2 (diferença ≤ 100 no total e ≤ 80 em cada competência); nota final = média simples por competência.', '');
      else {
        push(`**Regra aplicada:** houve discrepância entre os corretores 1 e 2 (diferença > 100 no total ou > 80 em alguma competência), então um 3º corretor avaliou o texto. Nota final = média, por competência, entre o corretor 3 e o corretor ${rf.maisProximo}, cujo total ficou mais próximo.`, '');
        if (rf.banca) push('> O 3º corretor também divergiu de ambos. **No Enem real, a redação iria para uma banca presencial.** Aqui foi mantida a regra do corretor mais próximo.', '');
      }
      if (rf.anulada && rf.motivo) push(`> **Redação anulada:** ${rf.motivo}`, '');
    }
    if (parecer) {
      push('### Parecer', '', parecer.resumo, '');
      const desvios = (parecer.desviosPrincipais?.length ? parecer.desviosPrincipais : []).map((d) => ({ trecho: d.trecho, correcao: d.correcao, obs: d.explicacao }));
      if (!desvios.length && !rf?.insuficiente) {
        for (const c of [c1, c2, c3].filter(Boolean)) for (const d of c.desvios || []) if (desvios.length < 10) desvios.push({ trecho: d.trecho, correcao: d.correcao, obs: `${d.tipo} (${d.competencia})` });
      }
      push('### Desvios encontrados', '');
      if (desvios.length) {
        push('| Trecho | Correção | Observação |', '|---|---|---|');
        for (const d of desvios) push(`| ${cell(d.trecho)} | ${cell(d.correcao)} | ${cell(d.obs)} |`);
        push('');
      } else push('Nenhum desvio relevante registrado.', '');

      if (!rf?.insuficiente) {
        push('### Proposta de intervenção — 5 elementos', '');
        const els = [['agente', 'Agente'], ['acao', 'Ação'], ['meio', 'Meio/modo'], ['finalidade', 'Finalidade'], ['detalhamento', 'Detalhamento']];
        const cs = [c1, c2, c3].filter(Boolean);
        push(`| Elemento | ${cs.map((_, i) => `Corretor ${i + 1}`).join(' | ')} | Trecho |`, `|---|${cs.map(() => '---').join('|')}|---|`);
        for (const [k, nome] of els) {
          const marcas = cs.map((c) => (c.intervencao?.[k]?.presente ? '✔' : '✘'));
          const trecho = cs.map((c) => c.intervencao?.[k]?.trecho).find((t) => t && t.trim()) || '—';
          push(`| ${nome} | ${marcas.join(' | ')} | ${cell(trecho)} |`);
        }
        push('');
        const rep = (c3 || c1)?.repertorio;
        if (rep) push(`**Repertório sociocultural:** ${rep.descricao} — legitimado ${rep.legitimado ? '✔' : '✘'} · pertinente ${rep.pertinente ? '✔' : '✘'} · produtivo ${rep.produtivo ? '✔' : '✘'}. ${rep.comentario || ''}`, '');
        const fortes = [...new Set(cs.flatMap((c) => c.pontosFortes || []))].slice(0, 6);
        const fracos = [...new Set(cs.flatMap((c) => c.pontosAFortalecer || []))].slice(0, 6);
        if (fortes.length) push('**Pontos fortes:**', '', ...fortes.map((x) => `- ${x}`), '');
        if (fracos.length) push('**Pontos a fortalecer:**', '', ...fracos.map((x) => `- ${x}`), '');
      }

      push('### Como subir de nível em cada competência', '');
      for (const pc of parecer.porCompetencia || []) push(`- **${pc.id} — ${NOMES_COMPETENCIAS[pc.id] || ''}:** ${pc.comentario} *Como subir:* ${pc.comoSubir}`);
      push('');
      if (parecer.exemploPropostaIntervencao) push('### Exemplo de proposta de intervenção', '', quote(parecer.exemploPropostaIntervencao), '');
      if (parecer.planoDeTreino?.length) push('### Plano de treino de redação', '', ...parecer.planoDeTreino.map((x) => `- ${x}`), '');
    }
    push('### Seu texto', '');
    const t = String(sessao.redacaoTexto || '').trim();
    push(t ? quote(t) : '> *(em branco)*', '');
  }

  // ── Desempenho objetivo
  if (questoes.length) {
    push('## Desempenho objetivo', '');
    push('### Por área', '', '| Área | Acertos | Em branco | Aproveitamento | Nota estimada |', '|---|---|---|---|---|');
    for (const a of ORDEM_AREAS) {
      const r = obj.porArea[a];
      if (r) push(`| ${AREAS_CURTAS[a]} | ${r.acertos}/${r.total} | ${r.brancos} | ${pct(r.acertos, r.total)} | ${num(r.nota)} ± ${r.margem} |`);
    }
    push('', '### Por disciplina', '', '| Área | Disciplina | Acertos | Aproveitamento |', '|---|---|---|---|');
    const discs = Object.entries(obj.porDisciplina).sort((x, y) => ORDEM_AREAS.indexOf(x[0].split('|')[0]) - ORDEM_AREAS.indexOf(y[0].split('|')[0]));
    for (const [k, v] of discs) {
      const [a, d] = k.split('|');
      push(`| ${AREAS_CURTAS[a]} | ${d} | ${v.acertos}/${v.total} | ${pct(v.acertos, v.total)} |`);
    }
    push('', '### Por dificuldade', '', '| Dificuldade | Acertos | Aproveitamento |', '|---|---|---|');
    for (const d of ['facil', 'medio', 'dificil']) {
      const v = obj.porDificuldade[d];
      if (v) push(`| ${DIFICULDADE_NOME[d]} | ${v.acertos}/${v.total} | ${pct(v.acertos, v.total)} |`);
    }
    push('', '*Na TRI, errar questões fáceis e acertar difíceis é visto como incoerente e pesa menos do que um padrão consistente.*', '');
  }

  // ── Diagnóstico
  const dg = dados.diagnostico;
  push('## Diagnóstico e plano de estudos', '');
  if (dg) {
    push(dg.resumo, '');
    if (dg.pontosFortes?.length) push('**Pontos fortes:**', '', ...dg.pontosFortes.map((x) => `- ${x}`), '');
    if (dg.prioridades?.length) {
      push('### Prioridades', '');
      dg.prioridades.forEach((p, i) => push(`${i + 1}. **${p.assunto}** — ${p.motivo} *Como estudar:* ${p.comoEstudar}`));
      push('');
    }
    if (dg.planoDeEstudo?.length) {
      push('### Plano de estudos', '');
      for (const et of dg.planoDeEstudo) push(`**${et.titulo}**`, '', ...(et.acoes || []).map((a) => `- ${a}`), '');
    }
  } else push('Diagnóstico indisponível.', '');

  // ── Gabarito
  if (questoes.length) {
    push('## Gabarito completo', '');
    push('| Q | Área | Disciplina | Dificuldade | Sua resposta | Gabarito | Resultado |', '|---|---|---|---|---|---|---|');
    const porId = new Map(obj.itens.map((it) => [it.qid, it]));
    for (const q of questoes) {
      const it = porId.get(q.id);
      const res = it.status === 'certa' ? '✔' : it.status === 'errada' ? '✘' : it.status === 'anulada' ? 'anulada' : '—';
      const disc = q.lingua ? `${q.disciplina} (${LINGUAS[q.lingua]})` : q.disciplina;
      push(`| ${q.n} | ${AREAS_CURTAS[q.area]} | ${cell(disc)} | ${DIFICULDADE_NOME[q.dificuldade]} | ${it.marcada || '—'} | ${q.gabarito} | ${res} |`);
    }
    push('', '*✔ acerto · ✘ erro · — em branco*', '');

    // ── Correção comentada
    push('## Correção comentada', '');
    const coment = dados.comentarios || {};
    for (const q of questoes) {
      const it = porId.get(q.id);
      const cab = `### Questão ${q.n} — ${AREAS_CURTAS[q.area]} · ${q.disciplina} · ${q.assunto} · ${DIFICULDADE_NOME[q.dificuldade]}`;
      if (it.status === 'certa') {
        push(`${cab} ✔`, '', `**Acertou (${q.gabarito}).** ${primeiraFrase(q.explicacao)}`, '');
        continue;
      }
      push(`${cab} ${it.status === 'anulada' ? '(ANULADA)' : it.status === 'errada' ? '✘' : '(em branco)'}`, '');
      if (it.status === 'anulada') {
        push('> **Questão anulada:** na verificação independente, a resposta não pôde ser confirmada com segurança. Ela não conta na nota, como o Inep faz com itens anulados.', '');
      }
      push(q.textoBase, '', `*Fonte: ${q.fonte}*`, '', q.enunciado.trim(), '');
      for (const a of q.alternativas) {
        const marca = a.letra === q.gabarito ? ' ✔ **(gabarito)**' : a.letra === it.marcada ? ' ✘ *(sua resposta)*' : '';
        push(`- **${a.letra})** ${a.texto}${marca}`);
      }
      push('');
      push(`**Sua resposta:** ${it.marcada || 'em branco'} · **Gabarito:** ${q.gabarito}`, '');
      push(`**Explicação:** ${q.explicacao}`, '');
      if (q.habilidade) push(`**Habilidade:** ${q.habilidade}`, '');
      const c = coment[q.id];
      if (c) push(`**Comentário personalizado:** ${c.porQueAtrai} **Conceito-chave:** ${c.conceitoChave} **Dica:** ${c.dica}`, '');
    }
  }

  push('---', '');
  push('*Simulaê é um simulado **não oficial**, sem vínculo com o Inep ou o MEC. As questões e a proposta de redação foram geradas por IA e podem conter erros mesmo após a verificação. As notas são estimativas e não equivalem às notas oficiais do Enem.*', '');

  const resumo = { media, parcial: !completa, notas };
  return { md: L.join('\n'), resumo };
}
