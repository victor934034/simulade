// Roteador por hash + tela inicial + telas de status (gerando, pronta, avaliando).
import { api, ApiError } from './api.js';
import { h, clear, toast, confirmar, badge, fmtData, fmtDuracao, fmtNota, icon, AREAS_CURTAS, ORDEM_AREAS, LINGUAS } from './ui.js';
import { renderExam } from './exam.js';
import { renderReport } from './report.js';

const main = document.getElementById('main');
let cleanup = null;
let appConfig = null;
let rotaSeq = 0;

function setCleanup(fn) {
  cleanup = fn;
}

function runCleanup() {
  try { cleanup?.(); } catch (e) { console.warn(e); }
  cleanup = null;
  document.body.classList.remove('exam-mode');
}

async function router() {
  runCleanup();
  const seq = ++rotaSeq;
  const hash = location.hash || '#/';
  const m = hash.match(/^#\/prova\/([a-z0-9]{8,40})$/);
  clear(main);
  window.scrollTo(0, 0);
  if (appConfig?.precisaCodigo && !appConfig.logado) return renderLogin();
  if (m) return renderProva(m[1], seq);
  return renderHome(seq);
}

export function navegar(hash) {
  if (location.hash === hash) router();
  else location.hash = hash;
}

/** Re-renderiza a rota atual (ex.: após mudança de status). */
export function recarregarRota() {
  router();
}

// ───────────── Login ─────────────

function renderLogin() {
  const input = h('input.input#codigo', { type: 'password', autocomplete: 'current-password', required: true });
  const erro = h('p.form-error', { hidden: true, role: 'alert' });
  const form = h('form.card.login', {
    onsubmit: async (e) => {
      e.preventDefault();
      erro.hidden = true;
      try {
        await api.login(input.value);
        appConfig.logado = true;
        router();
      } catch (err) {
        erro.textContent = err.message;
        erro.hidden = false;
      }
    },
  },
  h('h1', 'Acesso'),
  h('p.muted', 'Este Simulaê é privado. Digite o código de acesso.'),
  h('label.field-label', { for: 'codigo' }, 'Código de acesso'),
  input,
  h('div', { style: 'margin-top:14px' }, erro),
  h('div.btn-row', { style: 'margin-top:14px' }, h('button.btn.btn-primary', { type: 'submit' }, 'Entrar')));
  main.append(h('div.container', form));
  input.focus();
}

// ───────────── Início ─────────────

const DURACAO_PADRAO = { dia1: 330, dia2: 300 };
const duracaoCustom = (c, red) => Math.max(20, Math.ceil(ORDEM_AREAS.reduce((s, a) => s + (c[a] || 0), 0) * 3.1) + (red ? 60 : 0));

function renderHome(seq) {
  const page = h('div.container.page');
  page.append(
    h('section.hero',
      h('h1', 'Simulados no estilo Enem, gerados e corrigidos por IA'),
      h('p.lead', 'Escolha o formato, gere uma prova inédita, resolva com cronômetro e cartão-resposta e receba um relatório completo: notas estimadas por TRI, redação corrigida por competência e plano de estudos.')),
  );
  const grid = h('div.home-grid');
  grid.append(formCriar(), listaProvas(seq));
  page.append(grid);
  main.append(page);
}

function formCriar() {
  const state = { modo: 'dia1', duracaoEditada: false };
  const card = h('section.card', { 'aria-labelledby': 'criar-titulo' });
  const erro = h('p.form-error', { hidden: true, role: 'alert' });

  const modoCard = (valor, titulo, desc, tempo) =>
    h('label.mode-card',
      h('input', { type: 'radio', name: 'modo', value: valor, checked: valor === 'dia1', onchange: () => { state.modo = valor; atualizar(); } }),
      h('span.mc-body', h('span.mc-title', titulo), h('span.mc-desc', desc), h('span.mc-time', tempo)));

  const contagem = (area, label) => {
    const inp = h('input.input.input-num', { type: 'number', min: 0, max: 45, step: 1, value: area === 'LC' ? 10 : area === 'MT' ? 10 : 0, id: `cnt-${area}`, inputmode: 'numeric', oninput: atualizar });
    return h('div', h('label.field-label', { for: `cnt-${area}` }, label), inp);
  };
  const cnt = { LC: contagem('LC', 'Linguagens'), CH: contagem('CH', 'Humanas'), CN: contagem('CN', 'Natureza'), MT: contagem('MT', 'Matemática') };
  const redCustom = h('input#red-custom', { type: 'checkbox', checked: true, onchange: atualizar });
  const customBox = h('fieldset#custom-box', { hidden: true },
    h('legend', 'Questões por área (0–45)'),
    h('div.counts', cnt.LC, cnt.CH, cnt.CN, cnt.MT),
    h('label.check', { style: 'margin-top:12px' }, redCustom, h('span', 'Incluir redação')));

  // Tema
  const temaInput = h('input.input#tema-texto', { type: 'text', maxlength: 200, placeholder: 'Ex.: saúde mental dos jovens', autocomplete: 'off' });
  const chips = h('div.chips', { 'aria-live': 'polite' });
  const sortear = h('button.btn.btn-sm', {
    type: 'button',
    onclick: async () => {
      sortear.disabled = true;
      try {
        const { temas } = await api.sugestoes(6);
        clear(chips);
        for (const t of temas) chips.append(h('button.chip-btn', { type: 'button', onclick: () => { temaInput.value = t; temaInput.focus(); } }, t));
      } catch (e) { toast(e.message, 'danger'); }
      sortear.disabled = false;
    },
  }, 'Sortear sugestões');
  const temaEscolhido = h('div#tema-escolhido-box',
    h('label.field-label', { for: 'tema-texto' }, 'Assunto da redação'),
    temaInput,
    h('p.hint', 'A IA transforma o assunto em um tema no formato Enem.'),
    h('div', { style: 'margin-top:8px' }, sortear),
    chips);
  const temaRadio = (v, label, checked) => h('label', h('input', { type: 'radio', name: 'tema-modo', value: v, checked, onchange: atualizar }), h('span', label));
  const temaBox = h('fieldset#tema-box',
    h('legend', 'Tema da redação'),
    h('div.seg', { role: 'radiogroup', 'aria-label': 'Tema da redação' }, temaRadio('escolhido', 'Escolher meu tema', false), temaRadio('aleatorio', 'Aleatório', true)),
    h('div', { style: 'margin-top:12px' }, temaEscolhido));

  const linguaRadio = (v, checked) => h('label', h('input', { type: 'radio', name: 'lingua', value: v, checked }), h('span', LINGUAS[v]));
  const linguaBox = h('fieldset#lingua-box', h('legend', 'Língua estrangeira'), h('div.seg', { role: 'radiogroup', 'aria-label': 'Língua estrangeira' }, linguaRadio('ingles', true), linguaRadio('espanhol', false)));

  const temaQuestoes = h('input#tema-questoes', { type: 'checkbox', checked: true });
  const temaQBox = h('fieldset#tema-q-box', h('label.check', temaQuestoes, h('span', h('b', 'Relacionar parte das questões ao tema'), h('span.hint', { style: 'display:block;margin:2px 0 0' }, '~20% das questões de Linguagens e Humanas usam o tema da redação como contexto.'))));

  const duracao = h('input.input#duracao', { type: 'number', min: 20, max: 600, step: 5, value: 330, inputmode: 'numeric', oninput: () => { state.duracaoEditada = true; atualizarResumoDur(); } });
  const durHint = h('p.hint');
  const durBox = h('fieldset', h('label.field-label', { for: 'duracao' }, 'Duração (minutos)'), duracao, durHint);
  const atualizarResumoDur = () => { durHint.textContent = `${fmtDuracao(Number(duracao.value) || 0)} · editável antes de gerar`; };

  const submit = h('button.btn.btn-primary.btn-lg', { type: 'submit' }, 'Criar prova');
  const form = h('form', { novalidate: true, onsubmit: enviar },
    h('fieldset', h('legend', 'Formato'),
      h('div.mode-cards', { role: 'radiogroup', 'aria-label': 'Formato' },
        modoCard('dia1', 'Dia 1', '45 Linguagens + 45 Humanas + Redação', '5h30'),
        modoCard('dia2', 'Dia 2', '45 Natureza + 45 Matemática', '5h'),
        modoCard('custom', 'Personalizado', 'Você escolhe as áreas e a quantidade', 'duração automática'))),
    customBox, temaBox, linguaBox, temaQBox, durBox, erro,
    h('div.btn-row', { style: 'margin-top:8px' }, submit, h('span.small.muted', 'A geração roda no servidor e pode levar alguns minutos.')));

  function contagens() {
    if (state.modo === 'dia1') return { LC: 45, CH: 45, CN: 0, MT: 0 };
    if (state.modo === 'dia2') return { LC: 0, CH: 0, CN: 45, MT: 45 };
    const o = {};
    for (const a of ORDEM_AREAS) o[a] = Math.max(0, Math.min(45, parseInt(cnt[a].querySelector('input').value, 10) || 0));
    return o;
  }
  function temRedacao() {
    return state.modo === 'dia1' || (state.modo === 'custom' && redCustom.checked);
  }
  function atualizar() {
    const red = temRedacao();
    const c = contagens();
    customBox.hidden = state.modo !== 'custom';
    temaBox.hidden = !red;
    temaQBox.hidden = !red || (c.LC + c.CH === 0);
    linguaBox.hidden = c.LC === 0;
    const modoTema = form.querySelector('input[name="tema-modo"]:checked')?.value;
    temaEscolhido.hidden = modoTema !== 'escolhido';
    if (!state.duracaoEditada) duracao.value = DURACAO_PADRAO[state.modo] || duracaoCustom(c, red);
    atualizarResumoDur();
  }

  async function enviar(e) {
    e.preventDefault();
    erro.hidden = true;
    const red = temRedacao();
    const c = contagens();
    const cfg = {
      modo: state.modo,
      contagens: c,
      redacao: red,
      temaModo: form.querySelector('input[name="tema-modo"]:checked')?.value || 'aleatorio',
      temaTexto: temaInput.value.trim(),
      lingua: form.querySelector('input[name="lingua"]:checked')?.value || 'ingles',
      temaNasQuestoes: temaQuestoes.checked,
      duracaoMin: parseInt(duracao.value, 10),
    };
    const problemas = [];
    if (red && cfg.temaModo === 'escolhido' && cfg.temaTexto.length < 3) problemas.push('Escreva o assunto da redação (ou escolha "Aleatório").');
    if (!Number.isInteger(cfg.duracaoMin) || cfg.duracaoMin < 20 || cfg.duracaoMin > 600) problemas.push('A duração deve ficar entre 20 e 600 minutos.');
    if (ORDEM_AREAS.reduce((s, a) => s + c[a], 0) + (red ? 1 : 0) === 0) problemas.push('Inclua ao menos uma questão ou a redação.');
    if (problemas.length) {
      erro.textContent = problemas.join(' ');
      erro.hidden = false;
      erro.focus?.();
      return;
    }
    submit.disabled = true;
    submit.textContent = 'Criando…';
    try {
      const { id } = await api.criar(cfg);
      navegar(`#/prova/${id}`);
    } catch (err) {
      erro.textContent = err.message;
      erro.hidden = false;
      submit.disabled = false;
      submit.textContent = 'Criar prova';
    }
  }

  card.append(h('h2#criar-titulo', 'Criar nova prova'), form);
  atualizar();
  return card;
}

function listaProvas(seq) {
  const card = h('section.card', { 'aria-labelledby': 'minhas-titulo' });
  const lista = h('div', { 'aria-live': 'polite', 'aria-busy': 'true' }, h('p.muted', 'Carregando…'));
  card.append(h('h2#minhas-titulo', 'Minhas provas'), lista);
  let timer = null;
  let assinaturaAnterior = '';

  async function carregar() {
    let provas;
    try {
      ({ provas } = await api.listar());
    } catch (e) {
      if (seq !== rotaSeq) return;
      clear(lista).append(h('p.form-error', e.message));
      return;
    }
    if (seq !== rotaSeq) return;
    lista.setAttribute('aria-busy', 'false');
    const assinatura = JSON.stringify(provas.map((p) => [p.id, p.status, p.progresso?.feito, p.progresso?.etapa]));
    if (assinatura !== assinaturaAnterior) {
      assinaturaAnterior = assinatura;
      clear(lista);
      if (!provas.length) lista.append(h('p.empty', 'Nenhuma prova ainda. Crie a primeira ao lado.'));
      else lista.append(h('ul.exam-list', provas.map(itemProva)));
    }
    clearTimeout(timer);
    if (provas.some((p) => p.status === 'gerando' || p.status === 'avaliando')) timer = setTimeout(carregar, 3000);
  }

  function itemProva(p) {
    let extra = '';
    if (p.status === 'gerando' && p.progresso?.total) extra = `${p.progresso.feito}/${p.progresso.total}`;
    if (p.status === 'concluida' && p.resumo?.media != null) extra = `média ${fmtNota(p.resumo.media)}`;
    return h('li.exam-item',
      h('p.exam-item-title', p.titulo),
      h('div.exam-item-meta', badge(p.status, extra), h('span', fmtData(p.criadaEm)), h('span', { dataset: { modo: p.modo } }, p.modo === 'dia1' ? 'Dia 1' : p.modo === 'dia2' ? 'Dia 2' : 'Personalizada')),
      h('div.btn-row',
        h('a.btn.btn-sm.btn-primary', { href: `#/prova/${p.id}` }, p.status === 'concluida' ? 'Ver relatório' : p.status === 'pronta' ? 'Abrir' : p.status === 'em_andamento' ? 'Continuar' : 'Acompanhar'),
        h('button.btn.btn-sm.btn-danger', {
          type: 'button',
          'aria-label': `Apagar prova: ${p.titulo}`,
          onclick: async () => {
            if (!(await confirmar('Apagar prova?', 'A prova, suas respostas e o relatório serão apagados definitivamente.', 'Apagar', true))) return;
            try {
              await api.apagar(p.id);
              toast('Prova apagada.');
              assinaturaAnterior = '';
              carregar();
            } catch (e) { toast(e.message, 'danger'); }
          },
        }, 'Apagar')));
  }

  carregar();
  setCleanup(() => clearTimeout(timer));
  return card;
}

// ───────────── Prova: despacha pelo status ─────────────

async function renderProva(id, seq) {
  let meta;
  try {
    meta = await api.meta(id);
  } catch (e) {
    if (seq !== rotaSeq) return;
    main.append(h('div.container.page', h('div.card.status-panel',
      h('h1', e.status === 404 ? 'Prova não encontrada' : 'Não foi possível abrir a prova'),
      h('p.muted', e.message),
      h('a.btn.btn-primary', { href: '#/' }, 'Voltar ao início'))));
    return;
  }
  if (seq !== rotaSeq) return;
  switch (meta.status) {
    case 'gerando':
    case 'erro_geracao':
      return renderGerando(meta, seq);
    case 'pronta':
      return renderPronta(meta);
    case 'em_andamento':
      return renderExam(main, id, { setCleanup, onFim: () => recarregarRota() });
    case 'avaliando':
    case 'erro_avaliacao':
      return renderAvaliando(meta, seq);
    case 'concluida':
      return renderReport(main, meta, { setCleanup });
    default:
      main.append(h('div.container.page', h('p', `Status desconhecido: ${meta.status}`)));
  }
}

function painelErro(meta, onRetry) {
  return h('div',
    h('p.form-error', { role: 'alert' }, meta.erro || 'Ocorreu um erro.'),
    h('p.muted.small', 'O que já foi feito está salvo. Ao tentar novamente, o processo continua de onde parou.'),
    h('div.btn-row', { style: 'justify-content:center' },
      h('button.btn.btn-primary', { type: 'button', onclick: onRetry }, 'Tentar novamente'),
      h('a.btn', { href: '#/' }, 'Voltar ao início')));
}

function renderGerando(meta0, seq) {
  const box = h('div.card.status-panel');
  main.append(h('div.container.container-narrow.page', box));
  let timer = null;

  const desenhar = (meta) => {
    clear(box);
    const p = meta.progresso || {};
    const pct = p.total ? Math.round((100 * (p.feito || 0)) / p.total) : 0;
    if (meta.status === 'erro_geracao') {
      box.append(h('div.big-icon', { style: 'color:var(--danger)' }, icon('alert')), h('h1', 'A geração parou'), h('p.muted', meta.titulo),
        painelErro(meta, async () => {
          try { await api.retry(meta.id); tick(); } catch (e) { toast(e.message, 'danger'); }
        }));
      return;
    }
    const indet = !p.feito && /proposta|fila/i.test(p.etapa || '');
    box.append(
      h('div.big-icon', h('span.spin', { style: 'display:block' }, icon('spinner'))),
      h('h1', 'Gerando sua prova'),
      h('p.muted', meta.titulo),
      h(`div.progress${indet ? '.indeterminate' : ''}`, { role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': pct, 'aria-label': 'Progresso da geração' }, h('span', { style: `width:${Math.max(3, pct)}%` })),
      h('p', { 'aria-live': 'polite' }, h('b', p.etapa || 'Na fila')),
      h('p.muted.small', 'Pode fechar esta página; a prova continua sendo gerada no servidor. Cada questão é resolvida por um revisor independente antes de entrar na prova.'),
      h('a.btn.btn-sm', { href: '#/' }, 'Voltar ao início'));
  };

  async function tick() {
    let meta;
    try { meta = await api.meta(meta0.id); } catch { meta = null; }
    if (seq !== rotaSeq) return;
    if (meta && meta.status !== 'gerando' && meta.status !== 'erro_geracao') return recarregarRota();
    if (meta) desenhar(meta);
    timer = setTimeout(tick, 2000);
  }
  desenhar(meta0);
  timer = setTimeout(tick, 1500);
  setCleanup(() => clearTimeout(timer));
}

function renderPronta(meta) {
  const c = meta.config;
  const areas = ORDEM_AREAS.filter((a) => c.contagens[a] > 0).map((a) => `${AREAS_CURTAS[a]} (${c.contagens[a]})`);
  const btn = h('button.btn.btn-primary.btn-lg', {
    type: 'button',
    onclick: async () => {
      btn.disabled = true;
      btn.textContent = 'Iniciando…';
      try {
        await api.iniciar(meta.id);
        recarregarRota();
      } catch (e) {
        toast(e.message, 'danger');
        btn.disabled = false;
        btn.textContent = 'Iniciar prova';
      }
    },
  }, 'Iniciar prova');
  main.append(h('div.container.container-narrow.page', h('div.card.status-panel',
    h('div.big-icon', { style: 'color:var(--ok)' }, icon('check')),
    h('h1', 'Prova pronta'),
    meta.tema ? h('p.lead', { style: 'margin:0 auto' }, h('b', 'Tema da redação: '), meta.tema) : h('p.lead', { style: 'margin:0 auto' }, meta.titulo),
    h('div.facts',
      h('div.fact', h('b', String(meta.nQuestoes ?? 0)), h('span', 'questões')),
      c.redacao ? h('div.fact', h('b', '1'), h('span', 'redação')) : null,
      h('div.fact', h('b', fmtDuracao(c.duracaoMin)), h('span', 'de duração'))),
    areas.length ? h('p.muted.small', areas.join(' · ') + (c.contagens.LC > 0 ? ` · Língua estrangeira: ${LINGUAS[c.lingua]}` : '')) : null,
    h('ul.rules',
      h('li', 'O cronômetro começa ao clicar em ', h('b', 'Iniciar prova'), ' e corre no servidor: recarregar ou fechar a página não pausa o tempo.'),
      h('li', 'Suas respostas e a redação são salvas automaticamente. Você pode continuar em outra aba ou dispositivo.'),
      h('li', 'Quando o tempo acaba, a prova é entregue automaticamente, mesmo com o navegador fechado.'),
      c.redacao ? h('li', 'Redação: mínimo de 8 linhas (até 7 linhas = nota zero); o que passar de 30 linhas não é considerado.') : null,
      h('li', 'O gabarito só aparece no relatório final, depois da correção.')),
    h('div.btn-row', { style: 'justify-content:center;margin-top:22px' }, btn, h('a.btn', { href: '#/' }, 'Voltar')))));
}

const ROTULO_PASSO = { pendente: 'pendente', andando: 'em andamento', ok: 'concluído', pulado: 'pulado', erro: 'erro' };
const ICONE_PASSO = { pendente: '', andando: '', ok: '✓', pulado: '–', erro: '!' };

function renderAvaliando(meta0, seq) {
  const box = h('div.card.status-panel');
  main.append(h('div.container.container-narrow.page', box));
  let timer = null;

  const desenhar = (meta) => {
    clear(box);
    const erro = meta.status === 'erro_avaliacao';
    box.append(
      erro ? h('div.big-icon', { style: 'color:var(--danger)' }, icon('alert')) : h('div.big-icon', h('span.spin', { style: 'display:block' }, icon('spinner'))),
      h('h1', erro ? 'A correção parou' : 'Corrigindo sua prova'),
      h('p.muted', meta.titulo),
      erro ? null : h('p', 'A IA está corrigindo tudo com calma. Pode fechar a página e voltar depois.'),
      h('ol.steps', { 'aria-live': 'polite' }, (meta.avaliacao?.passos || []).map((p) =>
        h(`li.step.step-${p.estado}`,
          h('span.step-icon', { 'aria-hidden': 'true' }, ICONE_PASSO[p.estado] || ''),
          h('span.step-title', p.titulo),
          h('span.step-state', ROTULO_PASSO[p.estado] || p.estado)))),
      erro ? painelErro(meta, async () => {
        try { await api.retry(meta.id); tick(); } catch (e) { toast(e.message, 'danger'); }
      }) : h('div', { style: 'margin-top:18px' }, h('a.btn.btn-sm', { href: '#/' }, 'Voltar ao início')));
  };

  async function tick() {
    let meta;
    try { meta = await api.meta(meta0.id); } catch { meta = null; }
    if (seq !== rotaSeq) return;
    if (meta && meta.status === 'concluida') return recarregarRota();
    if (meta) desenhar(meta);
    timer = setTimeout(tick, 2000);
  }
  desenhar(meta0);
  timer = setTimeout(tick, 1500);
  setCleanup(() => clearTimeout(timer));
}

// ───────────── Boot ─────────────

async function boot() {
  try {
    appConfig = await api.config();
  } catch (e) {
    appConfig = { mock: false, precisaCodigo: false, logado: true };
    toast('Não foi possível falar com o servidor.', 'danger');
  }
  document.getElementById('mock-banner').hidden = !appConfig.mock;
  window.addEventListener('precisa-login', () => {
    if (appConfig.precisaCodigo && !appConfig.logado) return;
    appConfig.precisaCodigo = true;
    appConfig.logado = false;
    router();
  });
  window.addEventListener('hashchange', router);
  router();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

export { ApiError };
