// Persistência em arquivos JSON: uma pasta por prova, escrita atômica (.tmp + rename).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from './config.js';

const ID_RE = /^[a-z0-9]{8,40}$/;

export const provasDir = () => path.join(config.dataDir, 'provas');

export function validId(id) {
  return typeof id === 'string' && ID_RE.test(id);
}

export function newId() {
  return Date.now().toString(36) + crypto.randomBytes(6).toString('hex');
}

function dirOf(id) {
  if (!validId(id)) throw new Error('id inválido');
  return path.join(provasDir(), id);
}

export function ensureDirs() {
  fs.mkdirSync(provasDir(), { recursive: true });
}

export function writeJsonAtomic(file, data) {
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  fs.writeFileSync(tmp, typeof data === 'string' ? data : JSON.stringify(data, null, 2));
  for (let i = 0; ; i++) {
    try {
      fs.renameSync(tmp, file);
      return;
    } catch (e) {
      // Windows pode bloquear o rename brevemente (antivírus/leitor concorrente)
      if (i >= 8 || !['EPERM', 'EACCES', 'EBUSY'].includes(e.code)) {
        try { fs.unlinkSync(tmp); } catch {}
        throw e;
      }
      const until = Date.now() + 15 * (i + 1);
      while (Date.now() < until) { /* espera curta */ }
    }
  }
}

function readJson(file, def) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return def;
    throw e;
  }
}

export function exists(id) {
  return validId(id) && fs.existsSync(path.join(dirOf(id), 'meta.json'));
}

export function create(id, meta) {
  fs.mkdirSync(dirOf(id), { recursive: true });
  writeJsonAtomic(path.join(dirOf(id), 'meta.json'), meta);
}

export function read(id, name, def = null) {
  return readJson(path.join(dirOf(id), `${name}.json`), def);
}

export function write(id, name, data) {
  writeJsonAtomic(path.join(dirOf(id), `${name}.json`), data);
}

/** Leitura-modificação-escrita síncrona (sem await no meio → sem corrida no processo). */
export function update(id, name, fn, def = {}) {
  const cur = read(id, name, def);
  const next = fn(cur) ?? cur;
  write(id, name, next);
  return next;
}

export const getMeta = (id) => read(id, 'meta', null);
export const updateMeta = (id, fn) => update(id, 'meta', fn, null);

export function readText(id, name) {
  try {
    return fs.readFileSync(path.join(dirOf(id), name), 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}

export function writeText(id, name, text) {
  writeJsonAtomic(path.join(dirOf(id), name), text);
}

export function remove(id) {
  fs.rmSync(dirOf(id), { recursive: true, force: true });
}

export function listIds() {
  try {
    return fs.readdirSync(provasDir()).filter(validId);
  } catch {
    return [];
  }
}

export function listMetas() {
  const out = [];
  for (const id of listIds()) {
    try {
      const m = getMeta(id);
      if (m) out.push(m);
    } catch (e) {
      console.warn(`[store] meta ilegível em ${id}: ${e.message}`);
    }
  }
  return out;
}
