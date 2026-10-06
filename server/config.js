import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(ROOT, '.env'), quiet: true });

function str(name, def = '') {
  const v = process.env[name];
  if (v == null) return def;
  const t = String(v).replace(/\s+#.*$/, '').trim();
  return t === '' ? def : t;
}
function int(name, def) {
  const n = parseInt(str(name, ''), 10);
  return Number.isFinite(n) ? n : def;
}

const apiKey = str('ANTHROPIC_API_KEY');
let provider = str('AI_PROVIDER').toLowerCase();
if (provider !== 'anthropic' && provider !== 'mock') provider = apiKey ? 'anthropic' : 'mock';

export const config = {
  root: ROOT,
  apiKey,
  provider,
  modelGeracao: str('MODEL_GERACAO', 'claude-sonnet-5-5'),
  modelValidacao: str('MODEL_VALIDACAO', 'claude-sonnet-5-5'),
  modelAvaliacao: str('MODEL_AVALIACAO', 'claude-opus-5-5'),
  concurrency: Math.max(1, int('AI_CONCURRENCY', 4)),
  port: int('PORT', 3000),
  dataDir: path.resolve(ROOT, str('DATA_DIR', './data')),
  accessCode: str('ACCESS_CODE'),
  maxProvasPorDia: Math.max(1, int('MAX_PROVAS_POR_DIA', 6)),
  mockDelayMs: Math.max(0, int('MOCK_DELAY_MS', 15)),
  schedulerMs: Math.max(200, int('SCHEDULER_MS', 10000)),
  graceMs: Math.max(0, int('GRACE_MS', 45000)),
};

export const isMock = () => config.provider === 'mock';
