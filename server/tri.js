// Estimativa de nota no estilo TRI (modelo logístico de 3 parâmetros + EAP).
// Itens gerados não têm parâmetros calibrados; usamos parâmetros por dificuldade com
// um pequeno jitter determinístico em b. É uma aproximação, não a nota oficial.
import { hashStr } from './util.js';

export const PARAMS = {
  facil: { a: 1.3, b: -1.0, c: 0.2 },
  medio: { a: 1.6, b: 0.5, c: 0.2 },
  dificil: { a: 2.0, b: 1.7, c: 0.17 },
};

// Escala calibrada (em vez de 500 + 100·θ) para que, numa prova de 45 itens com a
// distribuição de dificuldade padrão: 100% ≈ 800, ~60% coerente ≈ 590, chute ≈ 375.
export const TRI_CFG = {
  min: -4,
  max: 4,
  passo: 0.05,
  priorMedia: 0,
  priorDp: 1.4,
  escala: 85,
  centro: 560,
};

export function itemParams(id, dificuldade) {
  const p = PARAMS[dificuldade] || PARAMS.medio;
  const u = hashStr(String(id)) / 4294967295; // 0..1
  return { a: p.a, b: p.b + (u * 2 - 1) * 0.25, c: p.c };
}

export function prob(theta, { a, b, c }) {
  return c + (1 - c) / (1 + Math.exp(-1.7 * a * (theta - b)));
}

/**
 * itens: [{ id, dificuldade, acertou:boolean }]
 * Retorna { nota, margem, theta, dp } (nota arredondada a 0,1).
 */
export function estimar(itens) {
  if (!itens.length) return null;
  const ps = itens.map((it) => ({ ...itemParams(it.id, it.dificuldade), x: it.acertou ? 1 : 0 }));
  const { min, max, passo, priorMedia, priorDp } = TRI_CFG;
  let somaW = 0, somaT = 0, somaT2 = 0;
  const logs = [];
  const thetas = [];
  for (let t = min; t <= max + 1e-9; t += passo) {
    let ll = -((t - priorMedia) ** 2) / (2 * priorDp * priorDp);
    for (const p of ps) {
      const pr = prob(t, p);
      ll += p.x ? Math.log(pr) : Math.log(1 - pr);
    }
    logs.push(ll);
    thetas.push(t);
  }
  const mx = Math.max(...logs);
  for (let i = 0; i < logs.length; i++) {
    const w = Math.exp(logs[i] - mx);
    somaW += w;
    somaT += w * thetas[i];
    somaT2 += w * thetas[i] * thetas[i];
  }
  const theta = somaT / somaW;
  const dp = Math.sqrt(Math.max(0, somaT2 / somaW - theta * theta));
  const r1 = (x) => Math.round(x * 10) / 10;
  return {
    theta,
    dp,
    nota: r1(TRI_CFG.centro + TRI_CFG.escala * theta),
    margem: Math.round(TRI_CFG.escala * dp),
  };
}
