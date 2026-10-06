// Utilitários de interface: criação de elementos, toasts, modais, formatação, contagem de linhas.

/** h('div.classe#id', {attrs}, ...filhos) */
export function h(sel, attrs, ...children) {
  const [, tag = 'div', rest = ''] = sel.match(/^([a-z0-9-]*)(.*)$/i) || [];
  const el = document.createElement(tag || 'div');
  for (const m of rest.matchAll(/([.#])([\w-]+)/g)) {
    if (m[1] === '.') el.classList.add(m[2]);
    else el.id = m[2];
  }
  if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) {
    children.unshift(attrs);
    attrs = null;
  }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className += ` ${v}`;
    else if (k === 'text') el.textContent = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

export function toast(msg, tipo = '', ms = 4500) {
  const box = document.getElementById('toasts');
  const t = h(`div.toast${tipo ? `.toast-${tipo}` : ''}`, { role: 'status' }, msg);
  box.append(t);
  setTimeout(() => t.remove(), ms);
}

export function announce(msg) {
  const el = document.getElementById('sr-announcer');
  el.textContent = '';
  setTimeout(() => { el.textContent = msg; }, 50);
}

/** Modal acessível com <dialog>. Resolve com o valor do botão clicado (ou null). */
export function modal({ titulo, corpo, acoes = [{ label: 'OK', valor: true, primario: true }] }) {
  return new Promise((resolve) => {
    const d = h('dialog.modal', { 'aria-labelledby': 'modal-title' });
    const body = h('div.modal-body', h('h2#modal-title', titulo), corpo);
    const bar = h('div.modal-actions');
    for (const a of acoes) {
      bar.append(h(`button.btn${a.primario ? '.btn-primary' : ''}${a.perigo ? '.btn-danger' : ''}`, {
        type: 'button',
        onclick: () => { d.close(); resolve(a.valor); },
      }, a.label));
    }
    d.append(body, bar);
    d.addEventListener('cancel', () => resolve(null));
    d.addEventListener('close', () => setTimeout(() => d.remove(), 0));
    document.body.append(d);
    d.showModal();
    (bar.querySelector('.btn-primary') || bar.querySelector('button'))?.focus();
  });
}

export const confirmar = (titulo, texto, label = 'Confirmar', perigo = false) =>
  modal({ titulo, corpo: h('p', texto), acoes: [{ label: 'Cancelar', valor: false }, { label, valor: true, primario: !perigo, perigo }] });

// Mesma estimativa do servidor (server/util.js): ~80 caracteres por linha + recuo de parágrafo.
export const CHARS_POR_LINHA = 80;
export const RECUO = 5;
export function contarLinhas(texto) {
  const t = String(texto || '').replace(/\r\n?/g, '\n').trim();
  if (!t) return 0;
  let linhas = 0;
  for (const par of t.split('\n')) {
    const p = par.trim();
    if (!p) continue;
    linhas += Math.max(1, Math.ceil((p.length + RECUO) / CHARS_POR_LINHA));
  }
  return linhas;
}
export function contarPalavras(texto) {
  const m = String(texto || '').match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu);
  return m ? m.length : 0;
}

export function fmtDuracao(min) {
  const m = Math.round(min);
  const hh = Math.floor(m / 60), r = m % 60;
  if (!hh) return `${r} min`;
  return r ? `${hh}h${String(r).padStart(2, '0')}` : `${hh}h`;
}

export function fmtRelogio(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
  return `${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

export function fmtData(iso) {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export const fmtNota = (x) => (x == null ? '—' : Number(x).toLocaleString('pt-BR', { maximumFractionDigits: 1 }));

export const STATUS = {
  gerando: 'Gerando',
  pronta: 'Pronta',
  em_andamento: 'Em andamento',
  avaliando: 'Avaliando',
  concluida: 'Concluída',
  erro_geracao: 'Erro na geração',
  erro_avaliacao: 'Erro na avaliação',
};

export function badge(status, extra = '') {
  const vivo = status === 'gerando' || status === 'avaliando';
  return h(`span.badge.badge-${status}`, vivo ? h('span.dot-pulse', { 'aria-hidden': 'true' }) : null, STATUS[status] || status, extra ? ` · ${extra}` : '');
}

export const AREAS_CURTAS = { LC: 'Linguagens', CH: 'Humanas', CN: 'Natureza', MT: 'Matemática' };
export const ORDEM_AREAS = ['LC', 'CH', 'CN', 'MT'];
export const LINGUAS = { ingles: 'Inglês', espanhol: 'Espanhol' };

export function icon(name) {
  const paths = {
    strike: '<path d="M6 7h12M6 12h12M6 17h8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" opacity=".55"/><path d="M4 20L20 4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
    flag: '<path d="M5 21V4m0 0h11l-2 4 2 4H5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    spinner: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-opacity=".2" stroke-width="3"/><path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>',
    check: '<circle cx="12" cy="12" r="10" fill="currentColor" opacity=".12"/><path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
    alert: '<circle cx="12" cy="12" r="10" fill="currentColor" opacity=".12"/><path d="M12 7v6m0 3.5v.5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
    clock: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7v5l3 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  };
  const span = document.createElement('span');
  span.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${paths[name] || ''}</svg>`;
  return span.firstChild;
}
