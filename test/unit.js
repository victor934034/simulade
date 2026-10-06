// Testes unitários (sem servidor): TRI, contagem de linhas, distribuição, plano, regras da redação.
import assert from 'node:assert/strict';
import { estimar } from '../server/tri.js';
import { rng, distribuir, contarLinhas, letrasBalanceadas } from '../server/util.js';
import { planejar } from '../server/generate.js';
import { notaFinalRedacao, discrepantes, corrigirObjetiva } from '../server/evaluate.js';
import { validarQuestao, validarCorrecao } from '../server/prompts.js';
import { validarCriacao } from '../server/index.js';

let ok = 0, falhas = 0;
function t(nome, fn) {
  try {
    fn();
    ok++;
    console.log(`  ✔ ${nome}`);
  } catch (e) {
    falhas++;
    console.log(`  ✘ ${nome}\n    ${e.message}`);
  }
}

// Prova de 45 itens com a distribuição padrão de dificuldade (30/45/25).
const difs = [...Array(14).fill('facil'), ...Array(20).fill('medio'), ...Array(11).fill('dificil')];
const itens = difs.map((d, i) => ({ id: `q${i + 1}`, dificuldade: d }));
const media = (f, sementes) => {
  const ns = sementes.map((s) => { const r = rng(s); return estimar(itens.map((it) => ({ ...it, acertou: f(it, r) }))).nota; });
  return ns.reduce((a, b) => a + b, 0) / ns.length;
};

console.log('TRI');
t('100% de acertos → 780–850', () => {
  const n = estimar(itens.map((it) => ({ ...it, acertou: true }))).nota;
  assert.ok(n >= 780 && n <= 850, `nota ${n}`);
});
t('chute puro (~20%) → 330–400 (média de 40 padrões)', () => {
  const n = media((it, r) => r() < 0.2, Array.from({ length: 40 }, (_, i) => `chute${i}`));
  assert.ok(n >= 330 && n <= 400, `nota ${n.toFixed(1)}`);
});
t('~60% com padrão coerente → 560–620 (média de 40 padrões)', () => {
  const p = { facil: 0.85, medio: 0.58, dificil: 0.3 };
  const n = media((it, r) => r() < p[it.dificuldade], Array.from({ length: 40 }, (_, i) => `sess${i}`));
  assert.ok(n >= 560 && n <= 620, `nota ${n.toFixed(1)}`);
});
t('coerência pedagógica: errar fáceis pesa mais que errar difíceis', () => {
  const k = 11; // mesmo número de acertos
  const soDificeisErradas = estimar(itens.map((it, i) => ({ ...it, acertou: it.dificuldade !== 'dificil' || i < 0 }))).nota;
  const soFaceisErradas = estimar(itens.map((it) => ({ ...it, acertou: it.dificuldade !== 'facil' || false }))).nota;
  assert.ok(soDificeisErradas > soFaceisErradas, `${soDificeisErradas} vs ${soFaceisErradas} (k=${k})`);
});
t('margem informada e positiva', () => {
  const r = estimar(itens.map((it, i) => ({ ...it, acertou: i % 2 === 0 })));
  assert.ok(r.margem > 0 && r.margem < 200, `margem ${r.margem}`);
});

console.log('Utilitários');
t('contarLinhas: vazio = 0, parágrafo curto = 1, ~80 caracteres por linha', () => {
  assert.equal(contarLinhas(''), 0);
  assert.equal(contarLinhas('   \n  '), 0);
  assert.equal(contarLinhas('Oi.'), 1);
  assert.equal(contarLinhas('a'.repeat(75)), 1);
  assert.equal(contarLinhas('a'.repeat(76)), 2);
  assert.equal(contarLinhas(`${'a'.repeat(100)}\n\n${'b'.repeat(10)}`), 3);
});
t('distribuir usa maior resto e soma exata', () => {
  const d = distribuir(10, { a: 15, b: 15, c: 8, d: 7 });
  assert.equal(Object.values(d).reduce((s, x) => s + x, 0), 10);
  assert.deepEqual(distribuir(45, { a: 15, b: 15, c: 15 }), { a: 15, b: 15, c: 15 });
});
t('letrasBalanceadas: cada letra 20% em 45', () => {
  const l = letrasBalanceadas(45, rng(1));
  for (const x of 'ABCDE') assert.equal(l.filter((y) => y === x).length, 9);
});

console.log('Planejamento');
const cfgDia1 = { contagens: { LC: 45, CH: 45, CN: 0, MT: 0 }, redacao: true, temaNasQuestoes: true, lingua: 'espanhol' };
t('Dia 1: 90 itens, 5 de LE primeiro, pesos por disciplina', () => {
  const p = planejar('abc123xyz', cfgDia1);
  assert.equal(p.length, 90);
  assert.deepEqual(p.slice(0, 5).map((s) => s.lingua), Array(5).fill('espanhol'));
  assert.equal(p.filter((s) => s.disciplina === 'Língua Portuguesa').length, 18);
  assert.equal(p.filter((s) => s.disciplina === 'História').length, 15);
  assert.deepEqual(p.map((s) => s.n), Array.from({ length: 90 }, (_, i) => i + 1));
});
t('plano determinístico pela semente', () => {
  assert.deepEqual(planejar('semente1', cfgDia1), planejar('semente1', cfgDia1));
  assert.notDeepEqual(planejar('semente1', cfgDia1), planejar('semente2', cfgDia1));
});
t('dificuldade 30/45/25 por área e ~20% temáticas', () => {
  const p = planejar('abc123xyz', cfgDia1).filter((s) => s.area === 'CH');
  assert.equal(p.filter((s) => s.dificuldade === 'facil').length, 14);
  assert.equal(p.filter((s) => s.dificuldade === 'medio').length, 20);
  assert.equal(p.filter((s) => s.dificuldade === 'dificil').length, 11);
  assert.equal(p.filter((s) => s.tematica).length, 9);
});
t('assuntos sem repetição dentro da disciplina (até esgotar)', () => {
  const p = planejar('zzz12345', { contagens: { LC: 0, CH: 0, CN: 45, MT: 0 }, redacao: false, lingua: 'ingles' });
  const fis = p.filter((s) => s.disciplina === 'Física').map((s) => s.assunto);
  assert.equal(new Set(fis).size, fis.length);
});
t('personalizado proporcional: LE = round(n×5/45)', () => {
  const p = planejar('abcdefgh', { contagens: { LC: 9, CH: 0, CN: 0, MT: 3 }, redacao: false, lingua: 'ingles' });
  assert.equal(p.filter((s) => s.lingua).length, 1);
  assert.equal(p.length, 12);
});

console.log('Redação');
const cor = (notas, anulada = false) => ({ anulacao: { anulada, motivo: '' }, competencias: ['C1', 'C2', 'C3', 'C4', 'C5'].map((id, i) => ({ id, nota: notas[i], justificativa: 'x', evidencias: [] })) });
t('sem discrepância: média simples, total múltiplo de 20', () => {
  const f = notaFinalRedacao(cor([120, 120, 160, 120, 80]), cor([160, 120, 120, 120, 120]));
  assert.equal(f.regra, 'media');
  assert.equal(f.total, 620);
  assert.equal(f.total % 20, 0);
});
t('discrepância por total > 100', () => {
  assert.ok(discrepantes(cor([120, 120, 120, 120, 120]), cor([160, 160, 160, 120, 120])));
  assert.ok(!discrepantes(cor([120, 120, 120, 120, 120]), cor([160, 160, 120, 120, 120])));
});
t('discrepância por competência > 80', () => {
  assert.ok(discrepantes(cor([40, 120, 120, 120, 120]), cor([160, 120, 120, 120, 80])));
});
t('3º corretor: média com o mais próximo; banca se divergir de ambos', () => {
  assert.equal(notaFinalRedacao(cor([200, 200, 200, 200, 200]), cor([80, 80, 80, 80, 80])), null);
  const f = notaFinalRedacao(cor([200, 200, 200, 200, 200]), cor([80, 80, 80, 80, 80]), cor([200, 200, 200, 160, 160]));
  assert.equal(f.regra, 'terceiro');
  assert.equal(f.maisProximo, 1);
  assert.equal(f.total, 960);
  assert.equal(f.banca, false);
  const g = notaFinalRedacao(cor([200, 200, 200, 200, 200]), cor([40, 40, 40, 40, 40]), cor([120, 120, 120, 120, 120]));
  assert.equal(g.banca, true);
});
t('validador do corretor rejeita nota fora da escala', () => {
  const c = cor([120, 130, 120, 120, 120]);
  c.intervencao = {};
  assert.ok(validarCorrecao(c).some((e) => /nota inválida/.test(e)));
});

console.log('Questões e correção objetiva');
t('validador de questão: gabarito alvo, proibições e referências a figura', () => {
  const q = { textoBase: 'x'.repeat(100), enunciado: 'Observe a figura e responda.', explicacao: 'e', fonte: 'f', alternativas: 'ABCDE'.split('').map((l) => ({ letra: l, texto: `alt ${l}` })), gabarito: 'B' };
  const e = validarQuestao(q, { n: 1, gabaritoAlvo: 'C' });
  assert.ok(e.some((x) => /letra C/.test(x)));
  assert.ok(e.some((x) => /figura/.test(x)));
  q.alternativas[4].texto = 'Nenhuma das anteriores';
  assert.ok(validarQuestao(q, { n: 1, gabaritoAlvo: 'B' }).some((x) => /proibido/.test(x)));
});
t('anuladas ficam fora da nota', () => {
  const qs = [
    { id: 'q1', n: 1, area: 'MT', disciplina: 'Matemática', assunto: 'a', dificuldade: 'facil', gabarito: 'A', anulada: false },
    { id: 'q2', n: 2, area: 'MT', disciplina: 'Matemática', assunto: 'b', dificuldade: 'medio', gabarito: 'B', anulada: true },
  ];
  const o = corrigirObjetiva(qs, { q1: 'A', q2: 'C' });
  assert.equal(o.porArea.MT.total, 1);
  assert.equal(o.porArea.MT.acertos, 1);
  assert.equal(o.porArea.MT.anuladas, 1);
});

console.log('Validação de criação');
t('aceita Dia 1 padrão e rejeita entradas inválidas', () => {
  assert.equal(validarCriacao({ modo: 'dia1', temaModo: 'aleatorio' }).config.duracaoMin, 330);
  assert.ok(validarCriacao({ modo: 'xx' }).erros);
  assert.ok(validarCriacao({ modo: 'dia1', temaModo: 'escolhido', temaTexto: '' }).erros);
  assert.ok(validarCriacao({ modo: 'custom', contagens: { LC: 46 } }).erros);
  assert.ok(validarCriacao({ modo: 'custom', contagens: {}, redacao: false }).erros);
  assert.ok(validarCriacao({ modo: 'dia2', duracaoMin: 10 }).erros);
  assert.equal(validarCriacao({ modo: 'custom', contagens: { LC: 4, MT: 3 }, redacao: false }).config.duracaoMin, 22);
  assert.equal(validarCriacao({ modo: 'custom', contagens: { MT: 1 }, redacao: false }).config.duracaoMin, 20);
});

console.log(`\n${ok} ok, ${falhas} falha(s)`);
process.exit(falhas ? 1 : 0);
