// Execução em segundo plano: geração e avaliação, retomada na subida, agendador de autofinalização.
import * as store from './store.js';
import { config } from './config.js';
import { runGeracao } from './generate.js';
import { runAvaliacao, passosIniciais } from './evaluate.js';

const emExecucao = new Set();
const promessas = new Map();
let timer = null;

function executar(chave, id, fn, statusErro) {
  if (emExecucao.has(chave)) return promessas.get(chave);
  emExecucao.add(chave);
  const p = (async () => {
    try {
      await fn();
    } catch (e) {
      if (!store.exists(id)) return; // prova apagada no meio do caminho
      console.error(`[jobs] ${chave} falhou: ${e?.message || e}`);
      try {
        store.updateMeta(id, (m) => {
          m.status = statusErro;
          m.erro = String(e?.message || e).slice(0, 500);
          m.avaliacao?.passos?.forEach((x) => { if (x.estado === 'andando') x.estado = 'erro'; });
        });
      } catch (e2) {
        console.error(`[jobs] não consegui registrar o erro de ${id}: ${e2.message}`);
      }
    } finally {
      emExecucao.delete(chave);
      promessas.delete(chave);
    }
  })();
  promessas.set(chave, p);
  return p;
}

export const isRunning = (id) => emExecucao.has(`ger:${id}`) || emExecucao.has(`aval:${id}`);

export function startGeracao(id) {
  return executar(`ger:${id}`, id, () => runGeracao(id), 'erro_geracao');
}

export function startAvaliacao(id) {
  return executar(`aval:${id}`, id, () => runAvaliacao(id), 'erro_avaliacao');
}

/** Finaliza a sessão (idempotente) e dispara a avaliação. */
export function finalizar(id, { auto = false } = {}) {
  const m = store.getMeta(id);
  if (!m) return null;
  if (m.status !== 'em_andamento') return m;
  const agora = Date.now();
  const enc = Date.parse(m.sessao.encerraEm);
  const novo = store.updateMeta(id, (mm) => {
    if (mm.status !== 'em_andamento') return mm;
    mm.status = 'avaliando';
    mm.sessao.finalizadaEm = new Date(Math.min(agora, enc)).toISOString();
    mm.sessao.autoFinalizada = auto;
    mm.avaliacao = { passos: passosIniciais() };
    mm.progresso = { ...(mm.progresso || {}), etapa: 'Avaliando', atualizadoEm: new Date().toISOString() };
  });
  console.log(`[jobs] prova ${id} finalizada${auto ? ' automaticamente (tempo esgotado)' : ''}`);
  startAvaliacao(id);
  return novo;
}

/** Finaliza sessões cujo tempo (mais a carência do autosave) já passou. */
export function checarExpirada(meta) {
  if (!meta || meta.status !== 'em_andamento' || !meta.sessao?.encerraEm) return meta;
  if (Date.now() > Date.parse(meta.sessao.encerraEm) + config.graceMs) return finalizar(meta.id, { auto: true });
  return meta;
}

export function varrer() {
  for (const m of store.listMetas()) {
    try {
      checarExpirada(m);
    } catch (e) {
      console.error(`[jobs] erro ao checar ${m.id}: ${e.message}`);
    }
  }
}

export function retomarTudo() {
  let n = 0;
  for (const m of store.listMetas()) {
    if (m.status === 'gerando') { startGeracao(m.id); n++; }
    else if (m.status === 'avaliando') { startAvaliacao(m.id); n++; }
  }
  if (n) console.log(`[jobs] retomando ${n} tarefa(s) interrompida(s)`);
  varrer();
}

export function retry(id) {
  const m = store.getMeta(id);
  if (!m) return null;
  if (m.status === 'erro_geracao' || (m.status === 'gerando' && !isRunning(id))) {
    store.updateMeta(id, (mm) => { mm.status = 'gerando'; mm.erro = null; });
    startGeracao(id);
  } else if (m.status === 'erro_avaliacao' || (m.status === 'avaliando' && !isRunning(id))) {
    store.updateMeta(id, (mm) => { mm.status = 'avaliando'; mm.erro = null; });
    startAvaliacao(id);
  }
  return store.getMeta(id);
}

export function startScheduler() {
  if (timer) return;
  timer = setInterval(varrer, config.schedulerMs);
  timer.unref?.();
}

export function stopScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}

export function pendentes() {
  return [...promessas.values()];
}
