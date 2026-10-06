// Teste end-to-end em modo mock: sobe o servidor de verdade (processo filho), numa porta livre,
// com DATA_DIR temporário, e percorre os fluxos da especificação.
import { spawn } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'simulae-smoke-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ───── servidor ─────
let srv = null;
let BASE = '';
let logs = '';

async function portaLivre() {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, () => { const p = s.address().port; s.close(() => resolve(p)); });
  });
}

async function subir(envExtra = {}) {
  const port = await portaLivre();
  BASE = `http://127.0.0.1:${port}`;
  srv = spawn(process.execPath, [path.join(ROOT, 'server/index.js')], {
    cwd: ROOT,
    env: {
      ...process.env,
      ANTHROPIC_API_KEY: '',
      AI_PROVIDER: 'mock',
      PORT: String(port),
      DATA_DIR: DATA,
      MOCK_DELAY_MS: '2',
      SCHEDULER_MS: '300',
      GRACE_MS: '800',
      MAX_PROVAS_POR_DIA: '12',
      ACCESS_CODE: '',
      ...envExtra,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  srv.stdout.on('data', (d) => { logs += d; });
  srv.stderr.on('data', (d) => { logs += d; });
  for (let i = 0; i < 100; i++) {
    try { await fetch(`${BASE}/api/config`); return; } catch { await sleep(100); }
  }
  throw new Error(`servidor não subiu:\n${logs}`);
}

async function derrubar() {
  if (!srv) return;
  const p = new Promise((r) => srv.once('exit', r));
  srv.kill('SIGKILL');
  await p;
  srv = null;
}

// ───── cliente com cookie ─────
function cliente() {
  let cookie = '';
  async function req(method, url, body, raw = false) {
    const res = await fetch(BASE + url, {
      method,
      headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
      body: body !== undefined ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
    });
    const sc = res.headers.getSetCookie?.() || [];
    for (const c of sc) {
      const [kv] = c.split(';');
      const [k] = kv.split('=');
      const outros = cookie.split('; ').filter((x) => x && !x.startsWith(`${k}=`));
      cookie = [...outros, kv].join('; ');
    }
    const text = await res.text();
    let data = text;
    if (!raw) { try { data = JSON.parse(text); } catch {} }
    return { status: res.status, data, headers: res.headers };
  }
  return { req, get: (u, raw) => req('GET', u, undefined, raw), post: (u, b) => req('POST', u, b ?? {}), put: (u, b) => req('PUT', u, b), del: (u) => req('DELETE', u) };
}

// ───── helpers de domínio ─────
const metaDisco = (id) => JSON.parse(fs.readFileSync(path.join(DATA, 'provas', id, 'meta.json'), 'utf8'));
const lerDisco = (id, nome) => JSON.parse(fs.readFileSync(path.join(DATA, 'provas', id, `${nome}.json`), 'utf8'));
const editarMeta = (id, fn) => {
  const f = path.join(DATA, 'provas', id, 'meta.json');
  const m = JSON.parse(fs.readFileSync(f, 'utf8'));
  fn(m);
  fs.writeFileSync(f, JSON.stringify(m, null, 2));
};

async function esperarStatus(c, id, alvo, timeoutMs = 60000) {
  const ini = Date.now();
  let m;
  while (Date.now() - ini < timeoutMs) {
    m = (await c.get(`/api/provas/${id}`)).data;
    if (m.status === alvo) return m;
    if (m.status?.startsWith('erro_')) throw new Error(`prova ${id} em ${m.status}: ${m.erro}`);
    await sleep(100);
  }
  throw new Error(`timeout esperando ${alvo} (atual: ${m?.status})\n${logs.slice(-3000)}`);
}

function procurarChaves(obj, chaves, caminho = '$') {
  const achadas = [];
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      if (chaves.includes(k)) achadas.push(`${caminho}.${k}`);
      achadas.push(...procurarChaves(v, chaves, `${caminho}.${k}`));
    }
  }
  return achadas;
}

const PARAGRAFOS = [
  'A saúde mental dos jovens tornou-se uma das questões mais urgentes da sociedade brasileira contemporânea. Nesse contexto, o uso excessivo das redes sociais, marcado pela comparação constante e pela busca de aprovação, contribui para o aumento de quadros de ansiedade e de depressão entre adolescentes.',
  'Em primeiro lugar, cabe destacar que as plataformas digitais são projetadas para capturar a atenção do usuário pelo maior tempo possível. Segundo o sociólogo Zygmunt Bauman, vivemos em uma modernidade líquida, na qual os laços são frágeis e as relações se tornam efêmeras, o que agrava o sentimento de solidão.',
  'Além disso, a escassez de serviços públicos de atendimento psicológico dificulta o acesso ao tratamento. Muitas famílias não reconhecem os sinais de sofrimento e, quando os reconhecem, enfrentam longas filas nos centros de atenção psicossocial, o que perpetua o problema e amplia as desigualdades.',
  'Portanto, é necessário que o Ministério da Educação, em parceria com o Ministério da Saúde, implemente programas permanentes de educação digital e de acolhimento psicológico nas escolas, por meio de oficinas semanais conduzidas por profissionais capacitados, a fim de promover o uso consciente das redes e o cuidado com a saúde mental dos estudantes.',
];
const REDACAO_LONGA = PARAGRAFOS.join('\n\n');

async function cicloCompleto(c, cfg, { responder = 'metade', redacao = REDACAO_LONGA } = {}) {
  const { status, data } = await c.post('/api/provas', cfg);
  assert.equal(status, 201, JSON.stringify(data));
  const id = data.id;
  await esperarStatus(c, id, 'pronta');
  const prova = (await c.get(`/api/provas/${id}/prova`)).data;
  const ini = (await c.post(`/api/provas/${id}/iniciar`)).data;
  assert.equal(ini.status, 'em_andamento');
  assert.equal(Date.parse(ini.sessao.encerraEm) - Date.parse(ini.sessao.iniciadaEm), cfg.duracaoMin ? cfg.duracaoMin * 60000 : ini.config.duracaoMin * 60000);
  const conteudo = lerDisco(id, 'conteudo');
  const respostas = {};
  conteudo.questoes.forEach((q, i) => {
    if (responder === 'tudo-certo') respostas[q.id] = q.gabarito;
    else if (responder === 'metade') respostas[q.id] = i % 2 === 0 ? q.gabarito : 'ABCDE'.replace(q.gabarito, '')[i % 4];
  });
  const s = await c.put(`/api/provas/${id}/sessao`, { respostas, marcadas: prova.questoes.slice(0, 2).map((q) => q.id), redacaoTexto: prova.redacao ? redacao : '' });
  assert.equal(s.status, 200, JSON.stringify(s.data));
  await c.post(`/api/provas/${id}/finalizar`);
  await esperarStatus(c, id, 'concluida');
  const md = (await c.get(`/api/provas/${id}/relatorio.md`, true)).data;
  return { id, prova, conteudo, md };
}

function linhasGabarito(md) {
  const sec = md.split('## Gabarito completo')[1]?.split('\n## ')[0] || '';
  return sec.split('\n').filter((l) => /^\| \d+ \|/.test(l));
}

function conferirSecoes(md, { redacao }) {
  const obrig = ['# Simulaê — Relatório do simulado', '**Duração da prova:**', '**Tempo usado:**', '## Resumo das notas', '## Desempenho objetivo', '### Por área', '### Por disciplina', '### Por dificuldade', '## Diagnóstico e plano de estudos', '## Gabarito completo', '## Correção comentada', 'não oficial', 'TRI'];
  if (redacao) obrig.push('## Redação', '### Notas por competência', '**Regra aplicada:**', '### Parecer', '### Desvios encontrados', '### Proposta de intervenção — 5 elementos', '### Como subir de nível em cada competência', '### Exemplo de proposta de intervenção', '### Seu texto', '**Tema da redação:**');
  for (const s of obrig) assert.ok(md.includes(s), `relatório sem a seção/trecho: ${s}`);
}

// ───── runner ─────
let ok = 0, falhas = 0;
async function t(nome, fn) {
  const ini = Date.now();
  try {
    await fn();
    ok++;
    console.log(`  ✔ ${nome} (${((Date.now() - ini) / 1000).toFixed(1)}s)`);
  } catch (e) {
    falhas++;
    console.log(`  ✘ ${nome}\n    ${String(e.stack || e.message).split('\n').slice(0, 6).join('\n    ')}`);
  }
}

async function main() {
  console.log(`Smoke test (mock) — dados em ${DATA}`);
  await subir();
  const A = cliente();
  const B = cliente();

  await t('config indica modo mock', async () => {
    const r = await A.get('/api/config');
    assert.equal(r.data.mock, true);
    assert.equal(r.data.precisaCodigo, false);
  });

  await t('validação do POST de criação', async () => {
    for (const b of [{ modo: 'x' }, { modo: 'dia1', temaModo: 'escolhido', temaTexto: '' }, { modo: 'custom', contagens: { LC: 50 } }, { modo: 'custom', contagens: {}, redacao: false }, { modo: 'dia2', duracaoMin: 5 }]) {
      const r = await A.post('/api/provas', b);
      assert.equal(r.status, 400, JSON.stringify(b));
      assert.ok(r.data.erro);
    }
  });

  let dia1;
  await t('Dia 1: geração completa e verificação do conteúdo', async () => {
    const r = await A.post('/api/provas', { modo: 'dia1', temaModo: 'escolhido', temaTexto: 'saúde mental dos jovens e redes sociais', lingua: 'ingles', temaNasQuestoes: true });
    assert.equal(r.status, 201);
    dia1 = r.data.id;
    await esperarStatus(A, dia1, 'pronta');
    const c = lerDisco(dia1, 'conteudo');
    assert.equal(c.questoes.length, 90);
    assert.equal(c.questoes.filter((q) => q.area === 'LC').length, 45);
    assert.equal(c.questoes.filter((q) => q.area === 'CH').length, 45);
    assert.equal(c.questoes.filter((q) => q.lingua === 'ingles').length, 5);
    assert.ok(c.redacao?.tema && c.redacao.textos.length >= 3 && c.redacao.proposta.includes(c.redacao.tema));
    assert.deepEqual(c.questoes.map((q) => q.n), Array.from({ length: 90 }, (_, i) => i + 1));
    assert.equal(new Set(c.questoes.map((q) => q.id)).size, 90);
    for (const q of c.questoes) {
      assert.equal(q.alternativas.length, 5, `q${q.n}`);
      assert.deepEqual(q.alternativas.map((a) => a.letra), ['A', 'B', 'C', 'D', 'E']);
      assert.equal(typeof q.verificada, 'boolean', `q${q.n} sem verificada`);
      assert.equal(typeof q.anulada, 'boolean');
    }
    for (const L of 'ABCDE') {
      const f = c.questoes.filter((q) => q.gabarito === L).length / 90;
      assert.ok(f >= 0.15 && f <= 0.25, `letra ${L}: ${(f * 100).toFixed(1)}%`);
    }
    assert.ok(c.questoes.some((q) => q.tematica), 'nenhuma questão temática');
    const regen = (logs.match(/reprovada na verificação/g) || []).length;
    console.log(`    (regenerações exercitadas até aqui: ${regen}; anuladas: ${c.questoes.filter((q) => q.anulada).length})`);
  });

  await t('GET /prova não vaza gabarito, explicação nem verificada', async () => {
    const r = await A.get(`/api/provas/${dia1}/prova`);
    assert.equal(r.status, 200);
    assert.deepEqual(procurarChaves(r.data, ['gabarito', 'explicacao', 'verificada', 'anulada', 'motivoAnulacao']), []);
    assert.equal(r.data.questoes.length, 90);
    assert.ok(r.data.redacao.textos.length >= 3);
    const meta = await A.get(`/api/provas/${dia1}`);
    assert.deepEqual(procurarChaves(meta.data, ['gabarito', 'explicacao']), []);
  });

  await t('isolamento: outro visitante recebe 404', async () => {
    for (const [m, u] of [['get', `/api/provas/${dia1}`], ['get', `/api/provas/${dia1}/prova`], ['post', `/api/provas/${dia1}/iniciar`], ['del', `/api/provas/${dia1}`], ['get', `/api/provas/${dia1}/relatorio.md`]]) {
      const r = await B[m](u);
      assert.equal(r.status, 404, `${m} ${u}`);
    }
    assert.equal((await B.get('/api/provas')).data.provas.length, 0);
    assert.equal((await A.get('/api/provas/..%2F..%2Fetc')).status, 404);
  });

  await t('Dia 1: iniciar, timer do servidor, autosave e validação do autosave', async () => {
    const antes = await A.put(`/api/provas/${dia1}/sessao`, { respostas: { q1: 'A' } });
    assert.equal(antes.status, 409, 'autosave antes de iniciar deveria falhar');
    const ini = (await A.post(`/api/provas/${dia1}/iniciar`)).data;
    assert.equal(Date.parse(ini.sessao.encerraEm) - Date.parse(ini.sessao.iniciadaEm), 330 * 60000);
    const de2 = (await A.post(`/api/provas/${dia1}/iniciar`)).data;
    assert.equal(de2.sessao.encerraEm, ini.sessao.encerraEm, 'reiniciar não pode mudar o timer');
    assert.equal((await A.put(`/api/provas/${dia1}/sessao`, { respostas: { q1: 'Z' } })).status, 400);
    assert.equal((await A.put(`/api/provas/${dia1}/sessao`, { respostas: { q999: 'A' } })).status, 400);
    assert.equal((await A.put(`/api/provas/${dia1}/sessao`, { marcadas: ['q999'] })).status, 400);
    assert.equal((await A.put(`/api/provas/${dia1}/sessao`, { redacaoTexto: 'x'.repeat(20001) })).status, 400);
    const c = lerDisco(dia1, 'conteudo');
    const respostas = {};
    c.questoes.forEach((q, i) => { if (i % 3) respostas[q.id] = i % 2 ? q.gabarito : 'ABCDE'.replace(q.gabarito, '')[i % 4]; });
    assert.equal((await A.put(`/api/provas/${dia1}/sessao`, { respostas, marcadas: ['q3', 'q7'], redacaoTexto: REDACAO_LONGA })).status, 200);
    // sendBeacon chega como text/plain via POST
    const beacon = await A.req('POST', `/api/provas/${dia1}/sessao`, JSON.stringify({ marcadas: ['q3', 'q7', 'q9'] }));
    assert.equal(beacon.status, 200);
    const s = lerDisco(dia1, 'sessao');
    assert.deepEqual(s.marcadas, ['q3', 'q7', 'q9']);
    assert.equal(s.redacaoTexto, REDACAO_LONGA);
    const p = (await A.get(`/api/provas/${dia1}/prova`)).data;
    assert.equal(p.sessao.redacaoTexto, REDACAO_LONGA, 'reabrir deve continuar do ponto salvo');
    assert.equal(Object.keys(p.sessao.respostas).length, Object.keys(respostas).length);
  });

  await t('Dia 1: finalizar (idempotente) → concluída → relatório completo', async () => {
    const f1 = await A.post(`/api/provas/${dia1}/finalizar`);
    const f2 = await A.post(`/api/provas/${dia1}/finalizar`);
    assert.equal(f1.status, 200);
    assert.equal(f2.status, 200);
    assert.equal((await A.put(`/api/provas/${dia1}/sessao`, { respostas: {} })).status, 409);
    await esperarStatus(A, dia1, 'concluida');
    const r = await A.get(`/api/provas/${dia1}/relatorio.md`, true);
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /text\/markdown/);
    const md = r.data;
    conferirSecoes(md, { redacao: true });
    assert.equal(linhasGabarito(md).length, 90);
    assert.ok(md.includes(`> ${PARAGRAFOS[0]}`), 'texto do aluno ausente');
    assert.ok(md.includes('Linguagens, Códigos e suas Tecnologias') && md.includes('Ciências Humanas e suas Tecnologias'));
    const dl = await A.get(`/api/provas/${dia1}/relatorio.md?download=1`, true);
    assert.match(dl.headers.get('content-disposition') || '', /attachment; filename="simulae-relatorio-.*\.md"/);
    const m = (await A.get(`/api/provas/${dia1}`)).data;
    assert.ok(m.resumo?.media > 0);
    assert.ok(m.avaliacao.passos.every((p) => p.estado === 'ok' || p.estado === 'pulado'));
    // depois de concluída a prova não volta a ser servida
    assert.equal((await A.get(`/api/provas/${dia1}/prova`)).status, 409);
  });

  await t('Dia 2: ciclo completo (Natureza + Matemática, sem redação)', async () => {
    const { conteudo, md } = await cicloCompleto(A, { modo: 'dia2' });
    assert.equal(conteudo.questoes.length, 90);
    assert.equal(conteudo.questoes.filter((q) => q.area === 'CN').length, 45);
    assert.equal(conteudo.questoes.filter((q) => q.area === 'MT').length, 45);
    assert.ok(!conteudo.redacao);
    conferirSecoes(md, { redacao: false });
    assert.ok(!md.includes('## Redação'));
    assert.equal(linhasGabarito(md).length, 90);
    assert.ok(/\$[^$\n]+\$/.test(md), 'esperava LaTeX nas questões de matemática');
  });

  await t('Personalizada pequena (4 LC + 3 MT, sem redação): ciclo completo', async () => {
    const { conteudo, md } = await cicloCompleto(A, { modo: 'custom', contagens: { LC: 4, CH: 0, CN: 0, MT: 3 }, redacao: false, lingua: 'espanhol', duracaoMin: 25 }, { responder: 'tudo-certo' });
    assert.equal(conteudo.questoes.length, 7);
    assert.equal(conteudo.questoes.filter((q) => q.lingua === 'espanhol').length, 0); // round(4×5/45) = 0
    assert.equal(linhasGabarito(md).length, 7);
    conferirSecoes(md, { redacao: false });
  });

  await t('Redação curta (≤ 7 linhas) → nota 0 sem chamar IA', async () => {
    const curta = 'A tecnologia mudou a vida dos jovens.\n\nIsso traz problemas.\n\nPrecisamos agir.';
    const { id, md } = await cicloCompleto(A, { modo: 'custom', contagens: { LC: 0, CH: 0, CN: 0, MT: 1 }, redacao: true, temaModo: 'aleatorio' }, { redacao: curta });
    const m = (await A.get(`/api/provas/${id}`)).data;
    const est = Object.fromEntries(m.avaliacao.passos.map((p) => [p.id, p.estado]));
    assert.equal(est.corretor_1, 'pulado');
    assert.equal(est.corretor_2, 'pulado');
    assert.equal(est.corretor_3, 'pulado');
    const av = lerDisco(id, 'avaliacao').dados;
    assert.equal(av.redacaoFinal.total, 0);
    assert.equal(av.redacaoFinal.insuficiente, true);
    assert.ok(!av.corretor_1);
    assert.equal(av.parecer.estatico, true);
    assert.ok(md.includes('Nota final: 0 / 1000'));
    assert.ok(md.includes('> Precisamos agir.'));
  });

  await t('Redação em branco → nota 0 sem chamar IA', async () => {
    const { id, md } = await cicloCompleto(A, { modo: 'custom', contagens: { LC: 0, CH: 1, CN: 0, MT: 0 }, redacao: true, temaModo: 'aleatorio' }, { redacao: '' });
    const av = lerDisco(id, 'avaliacao').dados;
    assert.equal(av.redacaoFinal.total, 0);
    assert.equal(av.redacaoFinal.branco, true);
    assert.ok(!av.corretor_1 && !av.corretor_2);
    assert.ok(md.includes('Redação em branco'));
  });

  await t('Discrepância forçada: corretor 3 roda e a regra do mais próximo é aplicada', async () => {
    const texto = `${REDACAO_LONGA}\n\n[[DISCREPANTE]]`;
    const { id, md } = await cicloCompleto(B, { modo: 'custom', contagens: { LC: 0, CH: 0, CN: 0, MT: 1 }, redacao: true, temaModo: 'escolhido', temaTexto: 'desinformação' }, { redacao: texto });
    const m = (await B.get(`/api/provas/${id}`)).data;
    assert.equal(m.avaliacao.passos.find((p) => p.id === 'corretor_3').estado, 'ok');
    const av = lerDisco(id, 'avaliacao').dados;
    assert.ok(av.corretor_3);
    assert.equal(av.redacaoFinal.regra, 'terceiro');
    assert.equal(av.redacaoFinal.maisProximo, 1);
    assert.equal(av.redacaoFinal.total, 960); // média por competência entre C3 (920) e C1 (1000)
    assert.ok(md.includes('Corretor 3'));
    assert.ok(md.includes('mais próximo'));
  });

  await t('Sem discrepância: corretor 3 é pulado e vale a média', async () => {
    // procura um texto sem discrepância natural no mock
    const { id } = await cicloCompleto(B, { modo: 'custom', contagens: { LC: 0, CH: 0, CN: 0, MT: 1 }, redacao: true, temaModo: 'aleatorio' }, { redacao: `${REDACAO_LONGA}\n\nVersão final.` });
    const av = lerDisco(id, 'avaliacao').dados;
    if (av.redacaoFinal.regra === 'media') {
      assert.ok(!av.corretor_3);
      assert.equal(av.redacaoFinal.total % 20, 0);
    } else {
      assert.ok(av.corretor_3, 'discrepância natural sem corretor 3');
    }
  });

  await t('Autofinalização pelo agendador, sem requisições do cliente', async () => {
    const r = await A.post('/api/provas', { modo: 'custom', contagens: { LC: 0, CH: 0, CN: 0, MT: 2 }, redacao: false, duracaoMin: 20 });
    const id = r.data.id;
    await esperarStatus(A, id, 'pronta');
    await A.post(`/api/provas/${id}/iniciar`);
    await A.put(`/api/provas/${id}/sessao`, { respostas: { q1: 'A' } });
    // simula o fim da duração mínima: o horário de término passa a ser "agora"
    editarMeta(id, (m) => {
      const agora = Date.now();
      m.sessao.iniciadaEm = new Date(agora - 20 * 60000).toISOString();
      m.sessao.encerraEm = new Date(agora).toISOString();
    });
    const ini = Date.now();
    let st;
    while (Date.now() - ini < 15000) {
      st = metaDisco(id).status; // só lê o disco: nenhuma requisição ao servidor
      if (st !== 'em_andamento') break;
      await sleep(100);
    }
    assert.ok(['avaliando', 'concluida'].includes(st), `status: ${st}`);
    assert.equal(metaDisco(id).sessao.autoFinalizada, true);
    await esperarStatus(A, id, 'concluida');
    const md = (await A.get(`/api/provas/${id}/relatorio.md`, true)).data;
    assert.ok(md.includes('tempo esgotado'));
  });

  await t('Limite diário devolve erro claro (429)', async () => {
    const C = cliente();
    let ultimo;
    for (let i = 0; i < 13; i++) {
      ultimo = await C.post('/api/provas', { modo: 'custom', contagens: { LC: 0, CH: 0, CN: 0, MT: 1 }, redacao: false });
      if (ultimo.status !== 201) break;
    }
    assert.equal(ultimo.status, 429);
    assert.match(ultimo.data.erro, /Limite diário/);
  });

  await t('Apagar prova', async () => {
    const r = await A.post('/api/provas', { modo: 'custom', contagens: { MT: 1 }, redacao: false });
    await esperarStatus(A, r.data.id, 'pronta');
    assert.equal((await A.del(`/api/provas/${r.data.id}`)).status, 200);
    assert.equal((await A.get(`/api/provas/${r.data.id}`)).status, 404);
  });

  // ───── Retomada após queda do servidor ─────
  await derrubar();
  console.log('Retomada (servidor lento para dar tempo de derrubar no meio)');
  await subir({ MOCK_DELAY_MS: '40', MAX_PROVAS_POR_DIA: '50' });
  const R = cliente();

  let idGer;
  await t('queda no meio da geração → retoma sem duplicar questões', async () => {
    const r = await R.post('/api/provas', { modo: 'dia1', temaModo: 'aleatorio' });
    idGer = r.data.id;
    const ini = Date.now();
    let feito = 0;
    while (Date.now() - ini < 30000) {
      const m = metaDisco(idGer);
      feito = m.progresso?.feito || 0;
      if (feito >= 10) break;
      await sleep(30);
    }
    assert.ok(feito >= 10 && feito < 90, `feito=${feito}`);
    await derrubar();
    const parcial = lerDisco(idGer, 'conteudo').questoes.length;
    assert.equal(metaDisco(idGer).status, 'gerando');
    await subir({ MOCK_DELAY_MS: '40', MAX_PROVAS_POR_DIA: '50' });
    await esperarStatus(R, idGer, 'pronta', 90000);
    const c = lerDisco(idGer, 'conteudo');
    assert.equal(c.questoes.length, 90, `questões: ${c.questoes.length}`);
    assert.equal(new Set(c.questoes.map((q) => q.n)).size, 90);
    assert.ok(/retomando 1 tarefa/.test(logs));
    console.log(`    (derrubado com ${parcial} questões prontas)`);
  });

  await t('queda no meio da avaliação → retoma e conclui', async () => {
    await derrubar();
    await subir({ MOCK_DELAY_MS: '250', MAX_PROVAS_POR_DIA: '50' });
    await R.post(`/api/provas/${idGer}/iniciar`);
    await R.put(`/api/provas/${idGer}/sessao`, { respostas: { q1: 'A', q2: 'B' }, redacaoTexto: REDACAO_LONGA });
    await R.post(`/api/provas/${idGer}/finalizar`);
    const ini = Date.now();
    let passos;
    while (Date.now() - ini < 30000) {
      passos = metaDisco(idGer).avaliacao?.passos || [];
      if (passos.some((p) => p.estado === 'ok') && metaDisco(idGer).status === 'avaliando') break;
      await sleep(20);
    }
    assert.equal(metaDisco(idGer).status, 'avaliando', 'avaliação terminou rápido demais para o teste');
    const okAntes = passos.filter((p) => p.estado === 'ok').map((p) => p.id);
    await derrubar();
    await subir({ MOCK_DELAY_MS: '5', MAX_PROVAS_POR_DIA: '50' });
    await esperarStatus(R, idGer, 'concluida', 90000);
    const md = (await R.get(`/api/provas/${idGer}/relatorio.md`, true)).data;
    assert.equal(linhasGabarito(md).length, 90);
    conferirSecoes(md, { redacao: true });
    console.log(`    (derrubado com passos concluídos: ${okAntes.join(', ')})`);
  });

  await t('ACCESS_CODE: rotas pedem login (401) e /api/login libera', async () => {
    await derrubar();
    await subir({ ACCESS_CODE: 'segredo123' });
    const D = cliente();
    const cfg = await D.get('/api/config');
    assert.equal(cfg.data.precisaCodigo, true);
    assert.equal(cfg.data.logado, false);
    const r = await D.get('/api/provas');
    assert.equal(r.status, 401);
    assert.equal(r.data.precisaLogin, true);
    assert.equal((await D.post('/api/login', { codigo: 'errado' })).status, 403);
    assert.equal((await D.post('/api/login', { codigo: 'segredo123' })).status, 200);
    assert.equal((await D.get('/api/provas')).status, 200);
  });

  await derrubar();
  console.log(`\n${ok} ok, ${falhas} falha(s)`);
  if (falhas) console.log(`\nÚltimos logs do servidor:\n${logs.slice(-4000)}`);
  try { fs.rmSync(DATA, { recursive: true, force: true }); } catch {}
  process.exit(falhas ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  console.error(logs.slice(-4000));
  await derrubar();
  process.exit(1);
});
