// Renderização segura: markdown → marked → DOMPurify → (só então) KaTeX nos placeholders.
import { marked } from './vendor/marked.esm.js';
import DOMPurify from './vendor/purify.es.mjs';

marked.setOptions({ gfm: true, breaks: false });

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

const PH = (i) => `KXMATHPH${i}XK`;
const PH_RE = /KXMATHPH(\d+)XK/g;

// $$...$$ em bloco
const BLOCK_RE = /\$\$([\s\S]+?)\$\$/g;
// $...$ inline (regra do pandoc): abre com $ não precedido de letra/dígito/\/$ e seguido de
// não-espaço; fecha com $ precedido de não-espaço e não seguido de dígito.
const INLINE_RE = /(^|[^\p{L}\p{N}\\$])\$(?=\S)((?:\\\$|[^$\n])+?)(?<=\S)\$(?!\d)/gu;

export function protegerMatematica(src) {
  const maths = [];
  let s = String(src ?? '');
  s = s.replace(BLOCK_RE, (_, tex) => {
    maths.push({ tex: tex.trim(), display: true });
    return `\n\n${PH(maths.length - 1)}\n\n`;
  });
  s = s.replace(INLINE_RE, (_, pre, tex) => {
    maths.push({ tex, display: false });
    return `${pre}${PH(maths.length - 1)}`;
  });
  return { s, maths };
}

function katexHtml({ tex, display }) {
  const k = window.katex;
  const esc = (t) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  if (!k) return `<code>${esc(tex)}</code>`;
  try {
    return k.renderToString(tex, { displayMode: display, throwOnError: false, output: 'html', trust: false, strict: 'ignore' });
  } catch {
    return `<code>${esc(tex)}</code>`;
  }
}

/** Converte markdown em HTML sanitizado com matemática renderizada. */
export function renderMarkdown(md, { inline = false } = {}) {
  const { s, maths } = protegerMatematica(md);
  const raw = inline ? marked.parseInline(s) : marked.parse(s);
  const clean = DOMPurify.sanitize(raw, { USE_PROFILE: { html: true } });
  return clean.replace(PH_RE, (_, i) => (maths[+i] ? katexHtml(maths[+i]) : ''));
}

/** Preenche um elemento com markdown renderizado e envolve tabelas para rolagem no celular. */
export function setRich(el, md, opts) {
  el.innerHTML = renderMarkdown(md, opts);
  el.querySelectorAll('table').forEach((t) => {
    if (t.parentElement?.classList.contains('table-wrap')) return;
    const w = document.createElement('div');
    w.className = 'table-wrap';
    t.replaceWith(w);
    w.appendChild(t);
  });
  return el;
}
