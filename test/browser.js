// Teste de navegador (Playwright + Chromium já instalado; não roda `playwright install`).
// Percorre: criar → gerar → iniciar → responder (teclado e clique) → riscar/marcar → redação →
// finalizar → relatório. Exige zero erros de console, KaTeX renderizado e <script> injetado inerte.
// Capturas de tela (desktop e 390 px) em test/screenshots/.
import { spawn } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = path.join(ROOT, 'test', 'screenshots');
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'simulae-browser-'));
fs.mkdirSync(SHOTS, { recursive: true });

const CANDIDATOS = [
  process.env.CHROMIUM_PATH,
  '/opt/pw-browsers/chromium',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);
function acharChromium() {
  for (const c of CANDIDATOS) {
    try {
      const st = fs.statSync(c);
      if (st.isFile()) return c;
      if (st.isDirectory()) {
        for (const n of ['chrome', 'chromium', 'chrome-linux/chrome', 'chrome-linux64/chrome']) if (fs.existsSync(path.join(c, n))) return path.join(c, n);
        for (const sub of fs.readdirSync(c)) {
          for (const n of ['chrome-linux/chrome', 'chrome-linux64/chrome']) if (fs.existsSync(path.join(c, sub, n))) return path.join(c, sub, n);
        }
      }
    } catch {}
  }
  throw new Error('Chromium não encontrado; defina CHROMIUM_PATH.');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function portaLivre() {
  return new Promise((resolve) => { const s = net.createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => resolve(p)); }); });
}

let ok = 0, falhas = 0;
async function t(nome, fn) {
  try { await fn(); ok++; console.log(`  ✔ ${nome}`); } catch (e) { falhas++; console.log(`  ✘ ${nome}\n    ${String(e.stack || e.message).split('\n').slice(0, 5).join('\n    ')}`); }
}

async function main() {
  const port = await portaLivre();
  const BASE = `http://127.0.0.1:${port}`;
  let logs = '';
  const srv = spawn(process.execPath, [path.join(ROOT, 'server/index.js')], {
    cwd: ROOT,
    env: { ...process.env, ANTHROPIC_API_KEY: '', AI_PROVIDER: 'mock', PORT: String(port), DATA_DIR: DATA, MOCK_DELAY_MS: '60', ACCESS_CODE: '', MAX_PROVAS_POR_DIA: '20' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  srv.stdout.on('data', (d) => { logs += d; });
  srv.stderr.on('data', (d) => { logs += d; });
  for (let i = 0; i < 100; i++) { try { await fetch(`${BASE}/api/config`); break; } catch { await sleep(100); } }

  const exe = acharChromium();
  console.log(`Teste de navegador — ${exe}`);
  const browser = await chromium.launch({ executablePath: exe, headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'pt-BR' });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE }).catch(() => {});
  const page = await ctx.newPage();
  const erros = [];
  page.on('console', (m) => { if (m.type() === 'error') erros.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => erros.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => { if (!r.url().includes('/sessao')) erros.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`); });

  const shot = async (nome) => {
    await page.screenshot({ path: path.join(SHOTS, `${nome}-desktop.png`), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await sleep(250);
    const largura = await page.evaluate(() => document.documentElement.scrollWidth);
    await page.screenshot({ path: path.join(SHOTS, `${nome}-mobile.png`), fullPage: true });
    await page.setViewportSize({ width: 1280, height: 900 });
    await sleep(150);
    assert.ok(largura <= 392, `${nome}: rolagem horizontal no celular (scrollWidth=${largura})`);
  };

  let provaId = null;

  await t('início: formulário, banner de demonstração e sugestões de tema', async () => {
    await page.goto(BASE);
    await page.waitForSelector('#criar-titulo');
    assert.equal(await page.isVisible('#mock-banner'), true);
    await page.click('label.mode-card:has-text("Personalizado")');
    for (const [a, v] of [['LC', '6'], ['CH', '2'], ['CN', '0'], ['MT', '4']]) await page.fill(`#cnt-${a}`, v);
    await page.click('label:has-text("Escolher meu tema")');
    await page.click('button:has-text("Sortear sugestões")');
    await page.waitForSelector('.chip-btn');
    const chip = await page.textContent('.chip-btn');
    await page.click('.chip-btn');
    assert.equal(await page.inputValue('#tema-texto'), chip);
    assert.equal(await page.inputValue('#duracao'), String(Math.ceil(12 * 3.1) + 60));
    await shot('01-inicio');
  });

  await t('criar → tela de geração com progresso → prova pronta', async () => {
    await page.click('button:has-text("Criar prova")');
    await page.waitForSelector('h1:has-text("Gerando sua prova")');
    provaId = page.url().split('/prova/')[1];
    await shot('02-gerando');
    await page.waitForSelector('h1:has-text("Prova pronta")', { timeout: 60000 });
    await shot('03-pronta');
  });

  await t('iniciar → prova com timer, abas e cartão-resposta', async () => {
    await page.click('button:has-text("Iniciar prova")');
    await page.waitForSelector('.q-panel .q-num');
    assert.match(await page.textContent('.timer-text'), /^1:\d\d:\d\d$/);
    assert.equal(await page.locator('.tab').count(), 4); // LC, CH, MT, Redação
    assert.equal(await page.locator('.ac-cell').count(), 12);
  });

  await t('responder pelo teclado (B) e por clique (C); navegar com setas', async () => {
    await page.keyboard.press('b');
    assert.equal(await page.getAttribute('.alt[data-letra="B"] .alt-btn', 'aria-checked'), 'true');
    assert.equal(await page.locator('.ac-cell.answered').count(), 1);
    await page.keyboard.press('ArrowRight');
    await page.waitForSelector('.q-num:has-text("Questão 2")');
    await page.click('.alt[data-letra="C"] .alt-btn');
    assert.equal(await page.getAttribute('.alt[data-letra="C"] .alt-btn', 'aria-checked'), 'true');
    await page.keyboard.press('3'); // 3 = C de novo → mantém C (atalho numérico)
    await page.keyboard.press('4'); // 4 = D
    assert.equal(await page.getAttribute('.alt[data-letra="D"] .alt-btn', 'aria-checked'), 'true');
    await page.keyboard.press('ArrowLeft');
    await page.waitForSelector('.q-num:has-text("Questão 1")');
  });

  await t('riscar alternativa e marcar para revisar (botão e tecla M)', async () => {
    await page.click('.alt[data-letra="A"] .strike-btn');
    assert.ok(await page.locator('.alt[data-letra="A"].struck').count());
    await page.keyboard.press('m');
    assert.equal(await page.getAttribute('.btn-mark', 'aria-pressed'), 'true');
    assert.ok(await page.locator('.ac-cell.marked').count());
    await page.click('.btn-mark');
    assert.equal(await page.getAttribute('.btn-mark', 'aria-pressed'), 'false');
    await page.click('.btn-mark');
    await shot('04-prova-questao');
  });

  await t('KaTeX renderiza fórmula numa questão de Matemática', async () => {
    await page.click('.tab:has-text("Matemática")');
    await page.waitForSelector('.chip-area:has-text("Matemática")');
    // percorre as questões de MT até achar LaTeX
    let achou = false;
    for (let i = 0; i < 4 && !achou; i++) {
      achou = (await page.locator('.q-panel .katex').count()) > 0;
      if (!achou) await page.keyboard.press('ArrowRight');
    }
    assert.ok(achou, 'nenhuma fórmula KaTeX renderizada');
    const r = await page.evaluate(async () => {
      const m = await import('/rich.js');
      return {
        dinheiro: m.protegerMatematica('Custa R$ 50,00 e depois R$ 30,00.').maths.length,
        misto: m.protegerMatematica('Pagou R$ 12,50 por $x^2$ unidades e $$y = 2x$$').maths.length,
      };
    });
    assert.equal(r.dinheiro, 0, 'R$ foi tratado como matemática');
    assert.equal(r.misto, 2);
    await shot('05-prova-matematica');
  });

  await t('cartão-resposta como gaveta no celular', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await sleep(200);
    await page.click('.exam-top .card-toggle');
    await page.waitForSelector('.answer-card.open');
    await sleep(300);
    await page.screenshot({ path: path.join(SHOTS, '06-cartao-gaveta-mobile.png') });
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 1280, height: 900 });
  });

  await t('redação: folha pautada, contador e atalhos ignorados ao digitar', async () => {
    await page.click('.tab:has-text("Redação")');
    await page.waitForSelector('#redacao');
    await page.click('#redacao');
    await page.keyboard.type('Introducao curta. ');
    assert.match(await page.textContent('.counter'), /≈ 1 \/ 30 linhas · 2 palavras/);
    assert.match(await page.textContent('.sheet-foot'), /nota zero/);
    const texto = [
      'A desinformação nas redes sociais representa um desafio para a democracia brasileira, pois compromete o debate público e a confiança nas instituições.',
      '<script>window.__xss = 1</script><img src=x onerror="window.__xss = 2">',
      'Em primeiro lugar, os algoritmos privilegiam conteúdos que geram engajamento, o que favorece a circulação de notícias falsas e sensacionalistas entre os usuários.',
      'Além disso, a baixa educação midiática dificulta que a população verifique fontes e identifique manipulações, ampliando o alcance de boatos em grupos de mensagens.',
      'Portanto, cabe ao Ministério da Educação incluir a educação midiática no currículo escolar, por meio de oficinas práticas, a fim de formar cidadãos críticos e capazes de checar informações.',
    ].join('\n\n');
    await page.fill('#redacao', texto);
    const cont = await page.textContent('.counter');
    const n = parseInt(cont.match(/≈ (\d+)/)[1], 10);
    assert.ok(n >= 8, `linhas estimadas: ${n}`);
    await page.waitForSelector('.save-status:has-text("Salvo")', { timeout: 10000 });
    await shot('07-redacao');
  });

  await t('finalizar pelo modal → tela de correção → relatório', async () => {
    await page.click('.exam-top button:has-text("Finalizar")');
    await page.waitForSelector('dialog.modal[open]');
    assert.match(await page.textContent('dialog.modal'), /respondidas/);
    await page.screenshot({ path: path.join(SHOTS, '08-modal-finalizar-desktop.png') });
    await page.click('dialog.modal button:has-text("Finalizar e corrigir")');
    await page.waitForSelector('h1:has-text("Corrigindo sua prova"), .report h1', { timeout: 30000 });
    if (await page.locator('h1:has-text("Corrigindo sua prova")').count()) await shot('09-avaliando');
    await page.waitForSelector('.report h1', { timeout: 60000 });
    await page.waitForSelector('.report[aria-busy="false"]');
  });

  await t('relatório: seções, KaTeX, tabelas roláveis e redação sanitizada', async () => {
    const txt = await page.textContent('.report');
    for (const s of ['Resumo das notas', 'Redação', 'Desempenho objetivo', 'Diagnóstico e plano de estudos', 'Gabarito completo', 'Correção comentada', 'não oficial']) assert.ok(txt.includes(s), `sem ${s}`);
    assert.ok((await page.locator('.report .katex').count()) > 0, 'KaTeX não renderizado no relatório');
    assert.ok((await page.locator('.report .table-wrap table').count()) > 3);
    assert.equal(await page.locator('.report script').count(), 0);
    assert.equal(await page.locator('.report img[onerror]').count(), 0);
    assert.equal(await page.evaluate(() => window.__xss), undefined, 'script injetado executou');
    assert.ok(txt.includes('A desinformação nas redes sociais'), 'texto do aluno ausente');
    const href = await page.getAttribute('a:has-text("Baixar relatório")', 'href');
    assert.match(href, /relatorio\.md\?download=1$/);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('a:has-text("Baixar relatório")')]);
    assert.match(dl.suggestedFilename(), /^simulae-relatorio-.*\.md$/);
    await page.click('button:has-text("Copiar markdown")');
    await page.waitForSelector('.toast');
    await shot('10-relatorio');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(SHOTS, '10-relatorio-topo-desktop.png') });
    await page.evaluate(() => document.querySelector('.report h2:nth-of-type(2)')?.scrollIntoView());
    await page.screenshot({ path: path.join(SHOTS, '10-relatorio-redacao-desktop.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => [...document.querySelectorAll('.report h2')].find((x) => x.textContent.includes('Gabarito'))?.scrollIntoView());
    await page.screenshot({ path: path.join(SHOTS, '10-relatorio-gabarito-mobile.png') });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(SHOTS, '12-relatorio-escuro-desktop.png') });
    await page.emulateMedia({ colorScheme: 'light' });
  });

  await t('início lista a prova concluída com média', async () => {
    await page.click('a:has-text("Início")');
    await page.waitForSelector('.exam-item');
    assert.match(await page.textContent('.exam-item'), /Concluída · média/);
    await shot('11-inicio-lista');
  });

  await t('reabrir prova em andamento em outra aba continua do ponto salvo', async () => {
    const r = await page.evaluate(async () => {
      const res = await fetch('/api/provas', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ modo: 'custom', contagens: { MT: 2 }, redacao: true, temaModo: 'aleatorio' }) });
      return res.json();
    });
    for (let i = 0; i < 200; i++) {
      const m = await page.evaluate(async (id) => (await fetch(`/api/provas/${id}`)).json(), r.id);
      if (m.status === 'pronta') break;
      await sleep(100);
    }
    await page.goto(`${BASE}/#/prova/${r.id}`);
    await page.click('button:has-text("Iniciar prova")');
    await page.waitForSelector('.q-panel');
    await page.keyboard.press('e');
    await page.waitForSelector('.save-status:has-text("Salvo")', { timeout: 10000 });
    const t1 = await page.textContent('.timer-text');
    const p2 = await ctx.newPage();
    p2.on('console', (m) => { if (m.type() === 'error') erros.push(`console(p2): ${m.text()}`); });
    await p2.goto(`${BASE}/#/prova/${r.id}`);
    await p2.waitForSelector('.q-panel');
    assert.equal(await p2.getAttribute('.alt[data-letra="E"] .alt-btn', 'aria-checked'), 'true');
    const t2 = await p2.textContent('.timer-text');
    const seg = (s) => s.split(':').reduce((a, x) => a * 60 + +x, 0);
    assert.ok(Math.abs(seg(t1) - seg(t2)) <= 5, `timers divergentes: ${t1} vs ${t2}`);
    await p2.close();
  });

  await t('zero erros de console', async () => {
    assert.deepEqual(erros, []);
  });

  await browser.close();
  srv.kill('SIGKILL');
  try { fs.rmSync(DATA, { recursive: true, force: true }); } catch {}
  console.log(`\n${ok} ok, ${falhas} falha(s) — capturas em ${path.relative(ROOT, SHOTS)}`);
  if (falhas) console.log(logs.slice(-3000));
  process.exit(falhas ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
