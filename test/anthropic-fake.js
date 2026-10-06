// Testa o caminho real do provedor Anthropic (server/ai.js) contra um servidor local que imita a
// API de Mensagens com streaming SSE. Não precisa de chave nem de rede.
import http from 'node:http';
import assert from 'node:assert/strict';

const reqs = [];
let roteiro = []; // fila de respostas: fn(body) → { status, json } | { sse: { input, stop } }

function sse(res, { input, stop = 'tool_use', name = 'entregar_x', model = 'm' }) {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
  const ev = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
  ev('message_start', { message: { id: 'msg_1', type: 'message', role: 'assistant', model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 1 } } });
  ev('content_block_start', { index: 0, content_block: { type: 'tool_use', id: 'toolu_1', name, input: {} } });
  const js = JSON.stringify(input);
  for (let i = 0; i < js.length; i += 40) ev('content_block_delta', { index: 0, delta: { type: 'input_json_delta', partial_json: js.slice(i, i + 40) } });
  ev('content_block_stop', { index: 0 });
  ev('message_delta', { delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: 50 } });
  ev('message_stop', {});
  res.end();
}

const server = http.createServer((req, res) => {
  let b = '';
  req.on('data', (d) => { b += d; });
  req.on('end', () => {
    const body = JSON.parse(b || '{}');
    reqs.push({ url: req.url, headers: req.headers, body });
    const passo = roteiro.shift();
    const r = passo ? passo(body) : { status: 500, json: { type: 'error', error: { type: 'api_error', message: 'sem roteiro' } } };
    if (r.sse) return sse(res, { ...r.sse, name: body.tools?.[0]?.name, model: body.model });
    res.writeHead(r.status, { 'content-type': 'application/json', ...(r.headers || {}) });
    res.end(JSON.stringify(r.json));
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

process.env.AI_PROVIDER = 'anthropic';
process.env.ANTHROPIC_API_KEY = 'sk-ant-teste';
process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${port}`;
const ai = await import('../server/ai.js');

const schema = { type: 'object', properties: { valor: { type: 'integer' } }, required: ['valor'] };
const validate = (o) => (o.valor > 0 ? [] : ['valor deve ser positivo']);
const call = (model, extra = {}) => ai.json({ kind: 'teste', model, system: 'sys', user: 'pergunta', schema, validate, maxTokens: 1000, toolName: 'entregar_teste', ...extra });

let ok = 0, falhas = 0;
async function t(nome, fn) {
  reqs.length = 0;
  try { await fn(); ok++; console.log(`  ✔ ${nome}`); } catch (e) { falhas++; console.log(`  ✘ ${nome}\n    ${e.stack.split('\n').slice(0, 4).join('\n    ')}`); }
  roteiro = [];
}

console.log('Provedor Anthropic (servidor falso)');

await t('Sonnet 5.5: tool_choice auto + instrução, fallbacks "default", streaming, sem temperature/thinking', async () => {
  roteiro = [() => ({ sse: { input: { valor: 7 } } })];
  const r = await call('claude-sonnet-5-5');
  assert.deepEqual(r, { valor: 7 });
  const q = reqs[0];
  assert.match(q.url, /^\/v1\/messages/);
  assert.deepEqual(q.body.tool_choice, { type: 'auto' });
  assert.match(q.body.system, /chamando a ferramenta "entregar_teste"/);
  assert.equal(q.body.tools[0].name, 'entregar_teste');
  assert.deepEqual(q.body.tools[0].input_schema, schema);
  assert.equal(q.body.stream, true);
  assert.equal(q.body.fallbacks, 'default');
  assert.match(q.headers['anthropic-beta'] || '', /server-side-fallback-2026-07-01/);
  assert.equal(q.body.temperature, undefined);
  assert.equal(q.body.thinking, undefined);
  assert.equal(q.headers['x-api-key'], 'sk-ant-teste');
});

await t('Opus 5.5 também usa tool_choice auto', async () => {
  roteiro = [() => ({ sse: { input: { valor: 1 } } })];
  await call('claude-opus-5-5');
  assert.deepEqual(reqs[0].body.tool_choice, { type: 'auto' });
});

await t('modelo antigo: tool_choice forçado e sem fallbacks', async () => {
  roteiro = [() => ({ sse: { input: { valor: 3 } } })];
  await call('claude-sonnet-4-6');
  assert.deepEqual(reqs[0].body.tool_choice, { type: 'tool', name: 'entregar_teste' });
  assert.equal(reqs[0].body.fallbacks, undefined);
  assert.doesNotMatch(reqs[0].body.system, /FORMATO DA RESPOSTA/);
});

await t('modelo desconhecido que recusa tool_choice forçado → aprende e passa para auto', async () => {
  roteiro = [
    () => ({ status: 400, json: { type: 'error', error: { type: 'invalid_request_error', message: 'tool_choice: type "tool" and "any" are not supported for this model.' } } }),
    () => ({ sse: { input: { valor: 9 } } }),
    () => ({ sse: { input: { valor: 9 } } }),
  ];
  assert.deepEqual(await call('claude-novo-x'), { valor: 9 });
  assert.deepEqual(reqs[1].body.tool_choice, { type: 'auto' });
  await call('claude-novo-x');
  assert.deepEqual(reqs[2].body.tool_choice, { type: 'auto' }, 'deveria lembrar');
});

await t('fallbacks recusados (400) → segue sem eles', async () => {
  roteiro = [
    () => ({ status: 400, json: { type: 'error', error: { type: 'invalid_request_error', message: 'fallbacks: unsupported beta' } } }),
    () => ({ sse: { input: { valor: 2 } } }),
  ];
  assert.deepEqual(await call('claude-opus-5'), { valor: 2 });
  assert.equal(reqs[1].body.fallbacks, undefined);
});

await t('falha de validação → nova tentativa com feedback', async () => {
  roteiro = [() => ({ sse: { input: { valor: -1 } } }), () => ({ sse: { input: { valor: 5 } } })];
  assert.deepEqual(await call('claude-sonnet-5-5'), { valor: 5 });
  assert.match(reqs[1].body.messages[0].content, /rejeitada pela validação automática: valor deve ser positivo/);
});

await t('stop_reason max_tokens → falha de validação e max_tokens dobrado', async () => {
  roteiro = [() => ({ sse: { input: { valor: 5 }, stop: 'max_tokens' } }), () => ({ sse: { input: { valor: 5 } } })];
  await call('claude-sonnet-5-5');
  assert.equal(reqs[0].body.max_tokens, 1000);
  assert.equal(reqs[1].body.max_tokens, 2000);
});

await t('429 / 529 → backoff e sucesso', async () => {
  roteiro = [
    () => ({ status: 429, headers: { 'retry-after': '0' }, json: { type: 'error', error: { type: 'rate_limit_error', message: 'devagar' } } }),
    () => ({ status: 529, json: { type: 'error', error: { type: 'overloaded_error', message: 'cheio' } } }),
    () => ({ sse: { input: { valor: 4 } } }),
  ];
  assert.deepEqual(await call('claude-sonnet-5-5'), { valor: 4 });
  assert.equal(reqs.length, 3);
});

await t('401 → erro permanente imediato com mensagem clara', async () => {
  roteiro = [() => ({ status: 401, json: { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } } })];
  await assert.rejects(call('claude-sonnet-5-5'), (e) => e.permanent && /chave da API inválida/.test(e.message));
  assert.equal(reqs.length, 1);
});

await t('404 → modelo não encontrado', async () => {
  roteiro = [() => ({ status: 404, json: { type: 'error', error: { type: 'not_found_error', message: 'model: x' } } })];
  await assert.rejects(call('claude-inexistente-1'), (e) => e.permanent && /não encontrado/.test(e.message));
});

server.close();
console.log(`\n${ok} ok, ${falhas} falha(s)`);
process.exit(falhas ? 1 : 0);
