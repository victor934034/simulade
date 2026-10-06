// Camada de IA: provedor (anthropic | mock), limitador global, retry e validação.
//
// ai.json({ kind, input, model, system, user, schema, validate, maxTokens, toolName })
//   → objeto JSON validado (entrada da ferramenta chamada pelo modelo).
//
// Obtemos JSON confiável via tool use. Nos modelos que aceitam, a ferramenta é forçada
// (tool_choice {type:'tool'}). Claude Sonnet 5.5 / Opus 5.5 / Fable 5.1 recusam tool_choice
// forçado (400), então nesses usamos tool_choice 'auto' + instrução explícita; se um modelo
// desconhecido devolver 400 por causa disso, a camada aprende e passa para 'auto' sozinha.
import Anthropic from '@anthropic-ai/sdk';
import { config, isMock } from './config.js';
import { createLimiter, sleep } from './util.js';
import { mockRespond } from './mock.js';

const limit = createLimiter(config.concurrency);
const MAX_TOKENS_CAP = 32000; // folga para o thinking adaptativo dos modelos atuais
const MAX_VALIDACAO = 4;
const MAX_TRANSITORIO = 6;

export class AIError extends Error {
  constructor(message, { permanent = false, cause } = {}) {
    super(message);
    this.name = 'AIError';
    this.permanent = permanent;
    if (cause) this.cause = cause;
  }
}

class ValidationError extends Error {}

let client = null;
function getClient() {
  if (!client) client = new Anthropic({ apiKey: config.apiKey || undefined, maxRetries: 0, timeout: 15 * 60 * 1000 });
  return client;
}

// Capacidades por modelo (aprendidas em tempo de execução).
const SEM_FORCADO = /^claude-(opus-5-5|sonnet-5-5|fable-5-1|mythos-5-1)/;
const COM_FALLBACKS = /^claude-(opus-5-5|opus-5(?!-)|sonnet-5-5|fable-5-1|mythos-5-1)/;
const caps = new Map();
function capsDe(model) {
  if (!caps.has(model)) caps.set(model, { forcado: !SEM_FORCADO.test(model), fallbacks: COM_FALLBACKS.test(model) });
  return caps.get(model);
}

function errorStatus(e) {
  return typeof e?.status === 'number' ? e.status : null;
}

function isTransient(e) {
  if (e instanceof Anthropic.APIConnectionError) return true; // inclui timeout
  const s = errorStatus(e);
  return s === 408 || s === 409 || s === 429 || (s != null && s >= 500);
}

function retryAfterMs(e) {
  const h = e?.headers;
  const v = h && (typeof h.get === 'function' ? h.get('retry-after') : h['retry-after']);
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.min(n * 1000, 120000) : null;
}

async function chamarAnthropic({ model, system, user, schema, toolName, maxTokens }) {
  const c = capsDe(model);
  const sys =
    system +
    (c.forcado
      ? ''
      : `\n\nFORMATO DA RESPOSTA: responda exclusivamente chamando a ferramenta "${toolName}" uma única vez, preenchendo todos os campos obrigatórios. Não escreva texto fora da chamada da ferramenta.`);
  const params = {
    model,
    max_tokens: maxTokens,
    system: sys,
    messages: [{ role: 'user', content: user }],
    tools: [{ name: toolName, description: `Entrega o resultado estruturado (${toolName}).`, input_schema: schema }],
    tool_choice: c.forcado ? { type: 'tool', name: toolName } : { type: 'auto' },
  };
  const api = getClient();
  try {
    const stream = c.fallbacks
      ? api.beta.messages.stream({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
      : api.messages.stream(params);
    return await stream.finalMessage();
  } catch (e) {
    const s = errorStatus(e);
    const msg = String(e?.message || '');
    if (s === 400 && c.forcado && /tool_choice/i.test(msg)) {
      console.warn(`[ai] ${model} não aceita tool_choice forçado; usando 'auto' + instrução.`);
      c.forcado = false;
      return chamarAnthropic({ model, system, user, schema, toolName, maxTokens });
    }
    if (s === 400 && c.fallbacks && /fallback|beta/i.test(msg)) {
      console.warn(`[ai] ${model}: fallbacks indisponíveis; seguindo sem eles.`);
      c.fallbacks = false;
      return chamarAnthropic({ model, system, user, schema, toolName, maxTokens });
    }
    throw e;
  }
}

function extrairJson(resp, toolName) {
  if (resp.stop_reason === 'max_tokens') throw new ValidationError('resposta truncada (max_tokens)');
  if (resp.stop_reason === 'refusal') throw new ValidationError('o modelo recusou a solicitação');
  const blocos = resp.content || [];
  const tool = blocos.find((b) => b.type === 'tool_use' && b.name === toolName) || blocos.find((b) => b.type === 'tool_use');
  let obj = tool?.input;
  if (typeof obj === 'string') {
    try { obj = JSON.parse(obj); } catch { throw new ValidationError('entrada da ferramenta não é JSON válido'); }
  }
  if (obj == null) {
    // Sem tool_use: tenta recuperar um objeto JSON do texto.
    const txt = blocos.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
    const m = txt.match(/\{[\s\S]*\}/);
    if (m) {
      try { obj = JSON.parse(m[0]); } catch {}
    }
  }
  if (!obj || typeof obj !== 'object') throw new ValidationError(`o modelo não chamou a ferramenta ${toolName}`);
  return obj;
}

function runValidate(validate, obj) {
  if (!validate) return;
  const r = validate(obj);
  const erros = Array.isArray(r) ? r.filter(Boolean) : r ? [String(r)] : [];
  if (erros.length) throw new ValidationError(erros.slice(0, 8).join('; '));
}

export async function json({ kind, input = {}, model, system = '', user = '', schema, validate, maxTokens = 8000, toolName }) {
  toolName = toolName || `entregar_${kind}`;
  if (isMock()) {
    return limit(async () => {
      for (let tentativa = 1; ; tentativa++) {
        if (config.mockDelayMs) await sleep(config.mockDelayMs);
        const obj = mockRespond(kind, input, tentativa);
        try {
          runValidate(validate, obj);
          return obj;
        } catch (e) {
          if (!(e instanceof ValidationError) || tentativa >= MAX_VALIDACAO) throw new AIError(`[${kind}] mock inválido: ${e.message}`);
        }
      }
    });
  }

  let tokens = Math.min(maxTokens, MAX_TOKENS_CAP);
  let feedback = '';
  let falhasValidacao = 0;
  let falhasTransitorias = 0;
  for (;;) {
    const userMsg = feedback
      ? `${user}\n\n---\nATENÇÃO: sua resposta anterior foi rejeitada pela validação automática: ${feedback}. Corrija e responda novamente pela ferramenta.`
      : user;
    try {
      const resp = await limit(() => chamarAnthropic({ model, system, user: userMsg, schema, toolName, maxTokens: tokens }));
      if (resp.stop_reason === 'max_tokens') {
        tokens = Math.min(tokens * 2, MAX_TOKENS_CAP);
      }
      const obj = extrairJson(resp, toolName);
      runValidate(validate, obj);
      return obj;
    } catch (e) {
      if (e instanceof ValidationError) {
        falhasValidacao++;
        console.warn(`[ai] ${kind}: validação falhou (${falhasValidacao}/${MAX_VALIDACAO}): ${e.message}`);
        if (falhasValidacao >= MAX_VALIDACAO) throw new AIError(`[${kind}] resposta inválida após ${MAX_VALIDACAO} tentativas: ${e.message}`);
        feedback = e.message;
        continue;
      }
      const s = errorStatus(e);
      if (isTransient(e)) {
        falhasTransitorias++;
        if (falhasTransitorias > MAX_TRANSITORIO) throw new AIError(`[${kind}] falha temporária persistente na API (${s ?? 'rede'}): ${e.message}`, { cause: e });
        const espera = retryAfterMs(e) ?? Math.min(60000, 1000 * 2 ** falhasTransitorias) + Math.floor(Math.random() * 500);
        console.warn(`[ai] ${kind}: erro temporário (${s ?? 'rede'}); nova tentativa em ${Math.round(espera / 1000)}s`);
        await sleep(espera);
        continue;
      }
      let msg = e?.message || String(e);
      if (s === 401) msg = 'chave da API inválida (ANTHROPIC_API_KEY)';
      else if (s === 403) msg = 'acesso negado pela API (permissão do modelo/conta)';
      else if (s === 404) msg = `modelo "${model}" não encontrado — verifique MODEL_* no .env`;
      else if (s === 400) msg = `requisição rejeitada pela API: ${msg}`;
      console.error(`[ai] ${kind}: erro permanente (${s ?? '?'}): ${msg}`);
      throw new AIError(`[${kind}] ${msg}`, { permanent: true, cause: e });
    }
  }
}
