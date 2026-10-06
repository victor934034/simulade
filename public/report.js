// Tela do relatório: o .md renderizado + baixar + copiar. Nada além disso.
import { api } from './api.js';
import { setRich } from './rich.js';
import { h, toast } from './ui.js';

export async function renderReport(main, meta, { setCleanup }) {
  const artigo = h('article.report.rich', { 'aria-busy': 'true' }, h('p.muted', 'Carregando relatório…'));
  const copiar = h('button.btn.btn-sm', { type: 'button', disabled: true }, 'Copiar markdown');
  const baixar = h('a.btn.btn-sm.btn-primary', { href: `/api/provas/${meta.id}/relatorio.md?download=1`, download: '' }, 'Baixar relatório (.md)');
  main.append(
    h('div.report-bar', h('div.report-bar-inner',
      h('a.btn.btn-sm.btn-ghost', { href: '#/' }, '← Início'),
      h('div.btn-row', copiar, baixar))),
    h('div.container', artigo));

  let md;
  try {
    md = await api.relatorio(meta.id);
  } catch (e) {
    artigo.textContent = `Não foi possível carregar o relatório: ${e.message}`;
    return;
  }
  setRich(artigo, md);
  artigo.setAttribute('aria-busy', 'false');
  document.title = `Relatório — ${meta.titulo} · Simulaê`;
  copiar.disabled = false;
  copiar.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(md);
      toast('Markdown copiado.');
    } catch {
      const ta = h('textarea', { style: 'position:fixed;opacity:0' });
      ta.value = md;
      document.body.append(ta);
      ta.select();
      try { document.execCommand('copy'); toast('Markdown copiado.'); } catch { toast('Não foi possível copiar.', 'danger'); }
      ta.remove();
    }
  });
  setCleanup(() => { document.title = 'Simulaê — Simulados com IA'; });
}
