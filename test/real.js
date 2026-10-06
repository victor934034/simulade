// Teste com a IA real (custa centavos): prova pequena (1 Linguagens + 2 Matemática + redação).
// Uso: ANTHROPIC_API_KEY=sk-ant-... npm run test:real   (ou com a chave no .env)
// Salva o relatório em ./relatorio-teste-real.md.
import { spawn } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(ROOT, '.env'), quiet: true });
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('Defina ANTHROPIC_API_KEY (no ambiente ou no .env) para rodar o teste real.');
  process.exit(2);
}
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'simulae-real-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = await new Promise((resolve) => { const s = net.createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => resolve(p)); }); });
const BASE = `http://127.0.0.1:${port}`;

const srv = spawn(process.execPath, [path.join(ROOT, 'server/index.js')], {
  cwd: ROOT,
  env: { ...process.env, AI_PROVIDER: 'anthropic', PORT: String(port), DATA_DIR: DATA, ACCESS_CODE: '' },
  stdio: ['ignore', 'inherit', 'inherit'],
});
const fim = (code) => { srv.kill(); process.exit(code); };
process.on('SIGINT', () => fim(130));

let cookie = '';
async function req(method, url, body) {
  const res = await fetch(BASE + url, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const sc = res.headers.getSetCookie?.()[0];
  if (sc) cookie = sc.split(';')[0];
  const txt = await res.text();
  try { return JSON.parse(txt); } catch { return txt; }
}
async function esperar(id, alvo) {
  let ult = '';
  for (;;) {
    const m = await req('GET', `/api/provas/${id}`);
    const etapa = m.status === 'avaliando' ? m.avaliacao.passos.map((p) => `${p.id}:${p.estado}`).join(' ') : m.progresso?.etapa;
    if (etapa !== ult) { console.log(`[teste-real] ${m.status} — ${etapa}`); ult = etapa; }
    if (m.status === alvo) return m;
    if (m.status?.startsWith('erro_')) { console.error(`[teste-real] ERRO: ${m.erro}`); fim(1); }
    await sleep(3000);
  }
}

for (let i = 0; i < 100; i++) { try { await fetch(`${BASE}/api/config`); break; } catch { await sleep(100); } }
const cfg = await req('GET', '/api/config');
if (cfg.mock) { console.error('O servidor subiu em modo mock; confira a chave.'); fim(1); }

const ini = Date.now();
const { id, erro } = await req('POST', '/api/provas', { modo: 'custom', contagens: { LC: 1, CH: 0, CN: 0, MT: 2 }, redacao: true, temaModo: 'escolhido', temaTexto: 'saúde mental dos jovens e redes sociais', duracaoMin: 30 });
if (!id) { console.error(erro); fim(1); }
await esperar(id, 'pronta');
const prova = await req('GET', `/api/provas/${id}/prova`);
console.log(`[teste-real] prova pronta em ${Math.round((Date.now() - ini) / 1000)}s — tema: ${prova.redacao.tema}`);
await req('POST', `/api/provas/${id}/iniciar`);
const redacao = [
  'No Brasil contemporâneo, a saúde mental dos jovens tornou-se motivo de preocupação crescente, sobretudo diante do uso intenso das redes sociais. A comparação constante com vidas aparentemente perfeitas e a busca por aprovação alimentam a ansiedade e a baixa autoestima, o que exige atenção do Estado e da sociedade.',
  'Em primeiro lugar, as plataformas digitais são desenhadas para prender a atenção pelo maior tempo possível. Conforme o sociólogo Zygmunt Bauman, vivemos uma modernidade líquida, marcada por relações frágeis e passageiras, e esse cenário se intensifica no ambiente virtual, onde curtidas substituem vínculos reais.',
  'Além disso, o acesso ao atendimento psicológico ainda é desigual no país. Muitas escolas não contam com profissionais preparados para identificar sinais de sofrimento, e os serviços públicos especializados enfrentam filas extensas, o que adia o cuidado e agrava os quadros.',
  'Portanto, é necessário que o Ministério da Educação, em parceria com o Ministério da Saúde, implemente programas permanentes de educação digital e acolhimento psicológico nas escolas, por meio de oficinas semanais conduzidas por psicólogos, a fim de promover o uso consciente das redes e o cuidado com a saúde mental dos estudantes.',
].join('\n\n');
await req('PUT', `/api/provas/${id}/sessao`, { respostas: { [prova.questoes[0].id]: 'A', [prova.questoes[1].id]: 'C' }, redacaoTexto: redacao });
await req('POST', `/api/provas/${id}/finalizar`);
await esperar(id, 'concluida');
const md = await req('GET', `/api/provas/${id}/relatorio.md`);
const out = path.join(ROOT, 'relatorio-teste-real.md');
fs.writeFileSync(out, md);
console.log(`\n[teste-real] OK em ${Math.round((Date.now() - ini) / 1000)}s. Relatório salvo em ${out}`);
fs.rmSync(DATA, { recursive: true, force: true });
fim(0);
