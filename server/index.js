// Simulaê — servidor HTTP (Express): rotas, cookies, acesso e ciclo de vida.
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import express from 'express';
import { fileURLToPath } from 'node:url';
import { config, isMock } from './config.js';
import * as store from './store.js';
import * as jobs from './jobs.js';
import { temasAleatorios, TEMAS_ALEATORIOS, LINGUAS } from './taxonomy.js';
import { tituloProva } from './report.js';
import { pick } from './util.js';

const LETRAS = new Set(['A', 'B', 'C', 'D', 'E']);
const DIA_MS = 24 * 60 * 60 * 1000;
const PUBLIC = path.join(config.root, 'public');

// ───────────── Cookies e acesso ─────────────

function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (k) out[k] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function setCookie(res, name, value, maxAgeSec) {
  const secure = res.req.secure ? '; Secure' : '';
  res.append('Set-Cookie', `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure}`);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const tokenAcesso = () => crypto.createHash('sha256').update(`simulae-acesso:${config.accessCode}`).digest('hex');

function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function identidade(req, res, next) {
  const c = parseCookies(req);
  let sid = c.sid;
  if (!sid || !UUID_RE.test(sid)) {
    sid = crypto.randomUUID();
    setCookie(res, 'sid', sid, 400 * 24 * 3600);
  }
  req.sid = sid;
  req.logado = !config.accessCode || safeEqual(c.acc || '', tokenAcesso());
  next();
}

function exigirAcesso(req, res, next) {
  if (req.logado) return next();
  res.status(401).json({ erro: 'Código de acesso necessário.', precisaLogin: true });
}

// ───────────── Limite diário ─────────────

const limitesFile = () => path.join(config.dataDir, 'limites.json');
function lerLimites() {
  try { return JSON.parse(fs.readFileSync(limitesFile(), 'utf8')); } catch { return {}; }
}
function contarCriacoes(sid) {
  const agora = Date.now();
  return (lerLimites()[sid] || []).filter((t) => agora - t < DIA_MS).length;
}
function registrarCriacao(sid) {
  const agora = Date.now();
  const lim = lerLimites();
  for (const k of Object.keys(lim)) {
    lim[k] = lim[k].filter((t) => agora - t < DIA_MS);
    if (!lim[k].length) delete lim[k];
  }
  (lim[sid] = lim[sid] || []).push(agora);
  store.writeJsonAtomic(limitesFile(), lim);
}

// ───────────── Validação ─────────────

const isInt = (x) => Number.isInteger(x);

export function validarCriacao(b) {
  const erros = [];
  if (!b || typeof b !== 'object') return { erros: ['corpo inválido'] };
  const modo = b.modo;
  if (!['dia1', 'dia2', 'custom'].includes(modo)) return { erros: ['modo deve ser dia1, dia2 ou custom'] };
  let contagens, redacao;
  if (modo === 'dia1') { contagens = { LC: 45, CH: 45, CN: 0, MT: 0 }; redacao = true; }
  else if (modo === 'dia2') { contagens = { LC: 0, CH: 0, CN: 45, MT: 45 }; redacao = false; }
  else {
    contagens = {};
    for (const a of ['LC', 'CH', 'CN', 'MT']) {
      const v = b.contagens?.[a] ?? 0;
      if (!isInt(v) || v < 0 || v > 45) erros.push(`contagem de ${a} deve ser um inteiro entre 0 e 45`);
      contagens[a] = v;
    }
    redacao = b.redacao === true;
  }
  const totalQ = Object.values(contagens).reduce((s, v) => s + (isInt(v) ? v : 0), 0);
  if (totalQ + (redacao ? 1 : 0) <= 0) erros.push('a prova precisa ter ao menos uma questão ou a redação');
  const padrao = modo === 'dia1' ? 330 : modo === 'dia2' ? 300 : Math.max(20, Math.ceil(totalQ * 3.1) + (redacao ? 60 : 0));
  const duracaoMin = b.duracaoMin == null ? padrao : b.duracaoMin;
  if (!isInt(duracaoMin) || duracaoMin < 20 || duracaoMin > 600) erros.push('duração deve ser um inteiro entre 20 e 600 minutos');
  const temaModo = b.temaModo === 'escolhido' ? 'escolhido' : 'aleatorio';
  const temaTexto = typeof b.temaTexto === 'string' ? b.temaTexto.replace(/\s+/g, ' ').trim() : '';
  if (redacao && temaModo === 'escolhido') {
    if (!temaTexto) erros.push('informe o tema da redação ou escolha "Aleatório"');
    else if (temaTexto.length < 3 || temaTexto.length > 200) erros.push('o tema deve ter entre 3 e 200 caracteres');
  }
  const lingua = b.lingua == null ? 'ingles' : b.lingua;
  if (!LINGUAS[lingua]) erros.push('língua estrangeira deve ser ingles ou espanhol');
  const temaNasQuestoes = b.temaNasQuestoes !== false;
  if (erros.length) return { erros };
  return {
    config: {
      modo, contagens, redacao, duracaoMin, lingua,
      temaModo: redacao ? temaModo : null,
      temaTexto: redacao && temaModo === 'escolhido' ? temaTexto : null,
      temaSemente: redacao && temaModo === 'aleatorio' ? pick(TEMAS_ALEATORIOS) : null,
      temaNasQuestoes: redacao ? temaNasQuestoes : false,
    },
  };
}

function validarSessao(body, conteudo) {
  const ids = new Set((conteudo.questoes || []).map((q) => q.id));
  const out = {};
  if (body.respostas !== undefined) {
    if (!body.respostas || typeof body.respostas !== 'object' || Array.isArray(body.respostas)) return { erro: 'respostas deve ser um objeto' };
    for (const [k, v] of Object.entries(body.respostas)) {
      if (!ids.has(k)) return { erro: `questão inexistente: ${String(k).slice(0, 20)}` };
      if (v !== null && !LETRAS.has(v)) return { erro: `resposta inválida para ${k}` };
    }
    out.respostas = Object.fromEntries(Object.entries(body.respostas).filter(([, v]) => v !== null));
  }
  if (body.marcadas !== undefined) {
    if (!Array.isArray(body.marcadas) || body.marcadas.some((k) => !ids.has(k))) return { erro: 'marcadas inválidas' };
    out.marcadas = [...new Set(body.marcadas)];
  }
  if (body.redacaoTexto !== undefined) {
    if (typeof body.redacaoTexto !== 'string') return { erro: 'redacaoTexto deve ser texto' };
    if (body.redacaoTexto.length > 20000) return { erro: 'redação excede 20.000 caracteres' };
    out.redacaoTexto = body.redacaoTexto;
  }
  return { dados: out };
}

// ───────────── Visões públicas ─────────────

function metaPublico(m) {
  const conteudo = m.status === 'gerando' ? null : store.read(m.id, 'conteudo', null);
  return {
    id: m.id,
    status: m.status,
    titulo: tituloProva(m),
    tema: m.tema,
    criadaEm: m.criadaEm,
    config: { modo: m.config.modo, contagens: m.config.contagens, redacao: m.config.redacao, duracaoMin: m.config.duracaoMin, lingua: m.config.lingua, temaModo: m.config.temaModo, temaNasQuestoes: m.config.temaNasQuestoes },
    progresso: m.progresso,
    erro: m.erro,
    avaliacao: m.avaliacao ? { passos: m.avaliacao.passos.map(({ id, titulo, estado }) => ({ id, titulo, estado })) } : null,
    sessao: m.sessao ? { iniciadaEm: m.sessao.iniciadaEm, encerraEm: m.sessao.encerraEm, finalizadaEm: m.sessao.finalizadaEm || null, autoFinalizada: !!m.sessao.autoFinalizada } : null,
    resumo: m.resumo,
    nQuestoes: conteudo?.questoes?.length ?? m.progresso?.total ?? null,
    agora: new Date().toISOString(),
  };
}

function resumoLista(m) {
  return { id: m.id, titulo: tituloProva(m), tema: m.tema, modo: m.config.modo, criadaEm: m.criadaEm, status: m.status, progresso: m.progresso, resumo: m.resumo, erro: m.erro };
}

const CAMPOS_QUESTAO_PUBLICOS = ['id', 'n', 'area', 'disciplina', 'assunto', 'lingua', 'textoBase', 'fonte', 'enunciado'];
function questaoPublica(q) {
  const o = {};
  for (const k of CAMPOS_QUESTAO_PUBLICOS) o[k] = q[k];
  o.alternativas = q.alternativas.map((a) => ({ letra: a.letra, texto: a.texto }));
  return o;
}

// ───────────── App ─────────────

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');

  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'same-origin');
    res.set('X-Frame-Options', 'DENY');
    res.set(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    );
    next();
  });

  app.use(express.static(PUBLIC, { index: 'index.html', maxAge: 0, etag: true }));

  const api = express.Router();
  api.use(express.json({ limit: '1mb' }));
  api.use(express.text({ type: 'text/plain', limit: '1mb' }));
  api.use((req, res, next) => {
    if (typeof req.body === 'string') {
      try { req.body = req.body ? JSON.parse(req.body) : {}; } catch { return res.status(400).json({ erro: 'JSON inválido' }); }
    }
    res.set('Cache-Control', 'no-store');
    next();
  });
  api.use(identidade);

  api.get('/config', (req, res) => {
    res.json({ mock: isMock(), precisaCodigo: !!config.accessCode, logado: req.logado, maxProvasPorDia: config.maxProvasPorDia });
  });

  api.post('/login', (req, res) => {
    if (!config.accessCode) return res.json({ ok: true });
    const codigo = String(req.body?.codigo ?? '');
    if (!safeEqual(codigo, config.accessCode)) return res.status(403).json({ erro: 'Código incorreto.' });
    setCookie(res, 'acc', tokenAcesso(), 90 * 24 * 3600);
    res.json({ ok: true });
  });

  api.use(exigirAcesso);

  api.get('/temas/sugestoes', (req, res) => {
    const n = Math.max(1, Math.min(12, parseInt(req.query.n, 10) || 6));
    res.json({ temas: temasAleatorios(n) });
  });

  api.post('/provas', (req, res) => {
    const { erros, config: cfgProva } = validarCriacao(req.body);
    if (erros) return res.status(400).json({ erro: erros.join('; '), erros });
    if (contarCriacoes(req.sid) >= config.maxProvasPorDia) {
      return res.status(429).json({ erro: `Limite diário atingido: no máximo ${config.maxProvasPorDia} provas a cada 24 horas. Tente novamente mais tarde.` });
    }
    const id = store.newId();
    const totalQ = Object.values(cfgProva.contagens).reduce((s, v) => s + v, 0);
    store.create(id, {
      id,
      owner: req.sid,
      criadaEm: new Date().toISOString(),
      status: 'gerando',
      config: cfgProva,
      tema: null,
      progresso: { etapa: 'Na fila', feito: 0, total: totalQ, atualizadoEm: new Date().toISOString() },
      erro: null,
      avaliacao: null,
      sessao: null,
      resumo: null,
    });
    registrarCriacao(req.sid);
    console.log(`[api] prova ${id} criada (${cfgProva.modo}, ${totalQ} questões${cfgProva.redacao ? ' + redação' : ''})`);
    jobs.startGeracao(id);
    res.status(201).json({ id });
  });

  api.get('/provas', (req, res) => {
    const lista = store.listMetas()
      .filter((m) => m.owner === req.sid)
      .map((m) => jobs.checarExpirada(m) || m)
      .sort((a, b) => (a.criadaEm < b.criadaEm ? 1 : -1))
      .map(resumoLista);
    res.json({ provas: lista });
  });

  // Carrega a prova do visitante (404 se não existir ou não for dono).
  api.param('id', (req, res, next, id) => {
    if (!store.validId(id) || !store.exists(id)) return res.status(404).json({ erro: 'Prova não encontrada.' });
    let m = store.getMeta(id);
    if (!m || m.owner !== req.sid) return res.status(404).json({ erro: 'Prova não encontrada.' });
    m = jobs.checarExpirada(m) || m;
    req.meta = m;
    next();
  });

  api.get('/provas/:id', (req, res) => res.json(metaPublico(req.meta)));

  api.get('/provas/:id/prova', (req, res) => {
    const m = req.meta;
    if (!['pronta', 'em_andamento'].includes(m.status)) return res.status(409).json({ erro: 'A prova não está disponível para realização.', status: m.status });
    const c = store.read(m.id, 'conteudo');
    const s = m.status === 'em_andamento' ? store.read(m.id, 'sessao', null) : null;
    res.json({
      id: m.id,
      status: m.status,
      titulo: tituloProva(m),
      config: { modo: m.config.modo, duracaoMin: m.config.duracaoMin, redacao: m.config.redacao, lingua: m.config.lingua },
      questoes: (c.questoes || []).map(questaoPublica),
      redacao: c.redacao ? { tema: c.redacao.tema, eixo: c.redacao.eixo, proposta: c.redacao.proposta, textos: c.redacao.textos.map((t) => ({ texto: t.texto, fonte: t.fonte })) } : null,
      sessao: s ? { respostas: s.respostas || {}, marcadas: s.marcadas || [], redacaoTexto: s.redacaoTexto || '' } : null,
      tempos: m.sessao ? { iniciadaEm: m.sessao.iniciadaEm, encerraEm: m.sessao.encerraEm } : null,
      agora: new Date().toISOString(),
    });
  });

  api.post('/provas/:id/iniciar', (req, res) => {
    const m = req.meta;
    if (m.status === 'em_andamento') return res.json(metaPublico(m));
    if (m.status !== 'pronta') return res.status(409).json({ erro: 'A prova não pode ser iniciada agora.', status: m.status });
    const agora = Date.now();
    if (!store.read(m.id, 'sessao', null)) store.write(m.id, 'sessao', { respostas: {}, marcadas: [], redacaoTexto: '' });
    const novo = store.updateMeta(m.id, (mm) => {
      if (mm.status !== 'pronta') return mm;
      mm.status = 'em_andamento';
      mm.sessao = { iniciadaEm: new Date(agora).toISOString(), encerraEm: new Date(agora + mm.config.duracaoMin * 60000).toISOString(), finalizadaEm: null };
    });
    console.log(`[api] prova ${m.id} iniciada`);
    res.json(metaPublico(novo));
  });

  const salvarSessao = (req, res) => {
    const m = req.meta;
    if (m.status !== 'em_andamento') return res.status(409).json({ erro: 'A prova não está em andamento.', status: m.status });
    if (Date.now() > Date.parse(m.sessao.encerraEm) + config.graceMs) return res.status(409).json({ erro: 'O tempo da prova terminou.', status: m.status });
    const c = store.read(m.id, 'conteudo');
    const { erro, dados } = validarSessao(req.body || {}, c);
    if (erro) return res.status(400).json({ erro });
    store.update(m.id, 'sessao', (s) => Object.assign(s, dados), { respostas: {}, marcadas: [], redacaoTexto: '' });
    res.json({ ok: true, salvoEm: new Date().toISOString() });
  };
  api.put('/provas/:id/sessao', salvarSessao);
  api.post('/provas/:id/sessao', salvarSessao);

  api.post('/provas/:id/finalizar', (req, res) => {
    const m = req.meta;
    if (['avaliando', 'concluida', 'erro_avaliacao'].includes(m.status)) return res.json(metaPublico(m));
    if (m.status !== 'em_andamento') return res.status(409).json({ erro: 'A prova não está em andamento.', status: m.status });
    const novo = jobs.finalizar(m.id);
    res.json(metaPublico(novo));
  });

  api.get('/provas/:id/relatorio.md', (req, res) => {
    const m = req.meta;
    const md = m.status === 'concluida' ? store.readText(m.id, 'relatorio.md') : null;
    if (!md) return res.status(409).json({ erro: 'O relatório ainda não está pronto.', status: m.status });
    res.type('text/markdown; charset=utf-8');
    if (req.query.download) {
      const data = (m.sessao?.iniciadaEm || m.criadaEm).slice(0, 10);
      res.set('Content-Disposition', `attachment; filename="simulae-relatorio-${data}-${m.id}.md"`);
    }
    res.send(md);
  });

  api.post('/provas/:id/retry', (req, res) => {
    const m = req.meta;
    if (!['erro_geracao', 'erro_avaliacao', 'gerando', 'avaliando'].includes(m.status)) return res.status(409).json({ erro: 'Nada para retomar.', status: m.status });
    res.json(metaPublico(jobs.retry(m.id)));
  });

  api.delete('/provas/:id', (req, res) => {
    store.remove(req.meta.id);
    console.log(`[api] prova ${req.meta.id} apagada`);
    res.json({ ok: true });
  });

  api.use((req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }));
  // eslint-disable-next-line no-unused-vars
  api.use((err, req, res, next) => {
    if (err?.type === 'entity.too.large') return res.status(413).json({ erro: 'Conteúdo grande demais.' });
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ erro: 'JSON inválido.' });
    console.error('[api] erro:', err);
    res.status(500).json({ erro: 'Erro interno.' });
  });

  app.use('/api', api);
  app.get('*', (req, res) => res.sendFile(path.join(PUBLIC, 'index.html')));
  return app;
}

// ───────────── Subida ─────────────

export function start(port = config.port) {
  store.ensureDirs();
  const app = createApp();
  return new Promise((resolve) => {
    const server = app.listen(port, () => {
      const p = server.address().port;
      console.log(`Simulaê rodando em http://localhost:${p}  (IA: ${isMock() ? 'MOCK — modo demonstração' : `anthropic — ${config.modelGeracao} / ${config.modelValidacao} / ${config.modelAvaliacao}`}; dados em ${config.dataDir})`);
      jobs.retomarTudo();
      jobs.startScheduler();
      resolve(server);
    });
    server.on('error', (e) => {
      if (e.code === 'EADDRINUSE') console.error(`\nA porta ${port} já está em uso por outro programa. Defina outra porta no .env (ex.: PORT=3001) ou na linha de comando.\n`);
      else console.error(e);
      process.exit(1);
    });
    const encerrar = (sinal) => {
      console.log(`\n[${sinal}] encerrando…`);
      jobs.stopScheduler();
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 1500).unref();
    };
    process.once('SIGINT', () => encerrar('SIGINT'));
    process.once('SIGTERM', () => encerrar('SIGTERM'));
  });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) start();
