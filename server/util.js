// Utilitários: limitador de concorrência, RNG com semente, embaralhar, distribuir, contar linhas.

export function createLimiter(max) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= max || queue.length === 0) return;
    active++;
    const { fn, resolve, reject } = queue.shift();
    Promise.resolve()
      .then(fn)
      .then(resolve, reject)
      .finally(() => {
        active--;
        next();
      });
  };
  return (fn) =>
    new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      next();
    });
}

export function hashStr(s) {
  // FNV-1a 32 bits
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 com semente string/número. */
export function rng(seed) {
  let a = typeof seed === 'number' ? seed >>> 0 : hashStr(String(seed));
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(arr, rand = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function pick(arr, rand = Math.random) {
  return arr[Math.floor(rand() * arr.length)];
}

/**
 * Distribui `total` entre chaves proporcionalmente a `pesos` pelo método do maior resto.
 * pesos: { chave: peso }. Retorna { chave: inteiro } somando exatamente `total`.
 */
export function distribuir(total, pesos) {
  const keys = Object.keys(pesos);
  const soma = keys.reduce((s, k) => s + pesos[k], 0);
  if (total <= 0 || soma <= 0) return Object.fromEntries(keys.map((k) => [k, 0]));
  const brutos = keys.map((k) => (total * pesos[k]) / soma);
  const base = brutos.map(Math.floor);
  let resto = total - base.reduce((s, x) => s + x, 0);
  const ordem = keys
    .map((k, i) => ({ i, frac: brutos[i] - base[i], peso: pesos[k] }))
    .sort((x, y) => y.frac - x.frac || y.peso - x.peso || x.i - y.i);
  for (let j = 0; resto > 0; j++, resto--) base[ordem[j % ordem.length].i]++;
  return Object.fromEntries(keys.map((k, i) => [k, base[i]]));
}

/** Lista balanceada de letras A–E (cada uma ~20%), embaralhada. */
export function letrasBalanceadas(n, rand) {
  const letras = ['A', 'B', 'C', 'D', 'E'];
  const base = shuffle(letras, rand);
  const out = [];
  for (let i = 0; i < n; i++) out.push(base[i % 5]);
  return shuffle(out, rand);
}

/**
 * Estimativa de linhas manuscritas: ~80 caracteres por linha e recuo de parágrafo
 * (≈ 5 caracteres) no início de cada parágrafo. Mesma lógica em public/ui.js.
 */
export const CHARS_POR_LINHA = 80;
export const RECUO = 5;
export function contarLinhas(texto) {
  const t = String(texto || '').replace(/\r\n?/g, '\n').trim();
  if (!t) return 0;
  let linhas = 0;
  for (const par of t.split('\n')) {
    const p = par.trim();
    if (!p) continue;
    linhas += Math.max(1, Math.ceil((p.length + RECUO) / CHARS_POR_LINHA));
  }
  return linhas;
}

export function contarPalavras(texto) {
  const m = String(texto || '').match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu);
  return m ? m.length : 0;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function fmtDuracao(min) {
  const m = Math.round(min);
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (!h) return `${r} min`;
  return r ? `${h}h${String(r).padStart(2, '0')}` : `${h}h`;
}

export function fmtDataHora(iso) {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
