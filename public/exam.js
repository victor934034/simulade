// Tela da prova em andamento.
import { api } from './api.js';
import { setRich } from './rich.js';
import { h, clear, toast, announce, modal, contarLinhas, contarPalavras, fmtRelogio, icon, AREAS_CURTAS, ORDEM_AREAS, LINGUAS } from './ui.js';

const LETRAS = ['A', 'B', 'C', 'D', 'E'];
const AUTOSAVE_MS = 1500;
const RED = 'RED';

export async function renderExam(main, id, { setCleanup, onFim }) {
  let data;
  try {
    data = await api.prova(id);
  } catch (e) {
    if (e.status === 409) return onFim();
    main.append(h('div.container.page', h('div.card.status-panel', h('h1', 'Não foi possível carregar a prova'), h('p.muted', e.message), h('button.btn.btn-primary', { type: 'button', onclick: onFim }, 'Tentar de novo'))));
    return;
  }
  if (data.status !== 'em_andamento' || !data.tempos) return onFim();
  document.body.classList.add('exam-mode');

  // ───── Estado
  const offset = Date.parse(data.agora) - Date.now();
  const agoraServ = () => Date.now() + offset;
  const encerraEm = Date.parse(data.tempos.encerraEm);
  const questoes = data.questoes;
  const porId = new Map(questoes.map((q, i) => [q.id, i]));
  const st = {
    respostas: { ...(data.sessao?.respostas || {}) },
    marcadas: new Set(data.sessao?.marcadas || []),
    redacaoTexto: data.sessao?.redacaoTexto || '',
    atual: 0,
    aba: null,
    encerrado: false,
  };
  const chaveRiscadas = `simulae:riscadas:${id}`;
  let riscadas = {};
  try { riscadas = JSON.parse(localStorage.getItem(chaveRiscadas) || '{}') || {}; } catch { riscadas = {}; }
  const salvarRiscadas = () => { try { localStorage.setItem(chaveRiscadas, JSON.stringify(riscadas)); } catch {} };
  const chavePos = `simulae:pos:${id}`;
  try {
    const pos = JSON.parse(localStorage.getItem(chavePos) || 'null');
    if (pos && Number.isInteger(pos.atual) && pos.atual < questoes.length) st.atual = pos.atual;
    if (pos?.aba) st.aba = pos.aba;
  } catch {}

  const secoes = ORDEM_AREAS.filter((a) => questoes.some((q) => q.area === a));
  if (data.redacao) secoes.push(RED);
  if (!st.aba || !secoes.includes(st.aba)) st.aba = questoes.length ? questoes[st.atual].area : RED;

  // ───── Autosave
  let dirty = false, saving = false, saveTimer = null, retryTimer = null;
  const snapshot = () => ({ respostas: st.respostas, marcadas: [...st.marcadas], redacaoTexto: st.redacaoTexto });
  const saveEl = h('span.save-status', { role: 'status', 'aria-live': 'polite' }, 'Salvo');
  const setSave = (estado) => {
    saveEl.classList.toggle('saving', estado === 'saving');
    saveEl.classList.toggle('offline', estado === 'offline');
    saveEl.textContent = estado === 'saving' ? 'Salvando…' : estado === 'offline' ? 'Sem conexão — tentando de novo' : estado === 'pending' ? 'Alterações não salvas' : 'Salvo';
  };
  function sujo() {
    if (st.encerrado) return;
    dirty = true;
    setSave('pending');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(salvar, AUTOSAVE_MS);
  }
  async function salvar() {
    clearTimeout(saveTimer);
    if (!dirty) return true;
    if (saving) { saveTimer = setTimeout(salvar, 400); return false; }
    saving = true;
    dirty = false;
    setSave('saving');
    try {
      await api.salvar(id, snapshot());
      setSave(dirty ? 'pending' : 'saved');
      return true;
    } catch (e) {
      dirty = true;
      if (e.status === 409) {
        setSave('saved');
        if (!st.encerrado) encerrarPorServidor();
        return false;
      }
      if (e.status === 400) {
        toast(`Não foi possível salvar: ${e.message}`, 'danger');
        setSave('offline');
        return false;
      }
      setSave('offline');
      clearTimeout(retryTimer);
      retryTimer = setTimeout(salvar, 4000);
      return false;
    } finally {
      saving = false;
      if (dirty && !st.encerrado) { clearTimeout(saveTimer); saveTimer = setTimeout(salvar, AUTOSAVE_MS); }
    }
  }
  const beacon = () => { if (dirty && !st.encerrado) api.beacon(id, snapshot()); };
  const onPageHide = () => beacon();
  const onVis = () => { if (document.visibilityState === 'hidden') beacon(); };
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('beforeunload', onPageHide);
  document.addEventListener('visibilitychange', onVis);

  // ───── Estrutura
  const timerEl = h('span.timer.timer-ok', { role: 'timer', 'aria-label': 'Tempo restante' }, icon('clock'), h('span.timer-text', '—'));
  timerEl.querySelector('svg').style.cssText = 'width:18px;height:18px';
  const timerText = timerEl.querySelector('.timer-text');
  const btnCartao = h('button.btn.btn-sm.card-toggle', { type: 'button', 'aria-expanded': 'false', 'aria-controls': 'answer-card', onclick: () => toggleDrawer() }, 'Cartão-resposta');
  const btnFinalizar = h('button.btn.btn-primary.btn-sm', { type: 'button', onclick: () => abrirFinalizar() }, 'Finalizar');
  const top = h('header.exam-top',
    h('div.exam-top-inner',
      h('div.exam-title', data.titulo, h('small', `${questoes.length} questões${data.redacao ? ' + redação' : ''} · Simulado não oficial`)),
      timerEl, saveEl, btnCartao, btnFinalizar),
    h('div.tabs', { role: 'tablist', 'aria-label': 'Seções da prova' }));
  const tabsEl = top.querySelector('.tabs');
  const body = h('div');
  main.append(top, body);

  // Painéis persistentes
  const qPanel = h('section.q-panel#q-panel', { role: 'tabpanel', 'aria-live': 'off' });
  const card = h('aside.answer-card#answer-card', { 'aria-label': 'Cartão-resposta' });
  const backdrop = h('div.drawer-backdrop', { onclick: () => toggleDrawer(false) });
  const examLayout = h('div.exam-layout', qPanel, card);
  let essayEl = null;

  function toggleDrawer(force) {
    const abrir = force ?? !card.classList.contains('open');
    card.classList.toggle('open', abrir);
    backdrop.classList.toggle('open', abrir);
    btnCartao.setAttribute('aria-expanded', String(abrir));
    if (abrir) card.querySelector('.ac-cell.current, .ac-cell')?.focus();
  }

  // ───── Abas
  function contagemArea(a) {
    const qs = questoes.filter((q) => q.area === a);
    return `${qs.filter((q) => st.respostas[q.id]).length}/${qs.length}`;
  }
  function desenharAbas() {
    clear(tabsEl);
    for (const s of secoes) {
      const sel = st.aba === s;
      tabsEl.append(h('button.tab', {
        type: 'button', role: 'tab', 'aria-selected': String(sel), id: `tab-${s}`, tabindex: sel ? '0' : '-1',
        onclick: () => irParaAba(s),
        onkeydown: (e) => {
          if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
          e.preventDefault();
          e.stopPropagation();
          const i = secoes.indexOf(s) + (e.key === 'ArrowRight' ? 1 : -1);
          const alvo = secoes[(i + secoes.length) % secoes.length];
          irParaAba(alvo);
          document.getElementById(`tab-${alvo}`)?.focus();
        },
      }, s === RED ? 'Redação' : AREAS_CURTAS[s], h('span.tab-count', s === RED ? `${contarLinhas(st.redacaoTexto)} lin.` : contagemArea(s))));
    }
  }

  function irParaAba(s) {
    if (s === st.aba && (s === RED ? essayEl?.isConnected : examLayout.isConnected)) return;
    st.aba = s;
    if (s !== RED) {
      const q = questoes[st.atual];
      if (!q || q.area !== s) st.atual = questoes.findIndex((x) => x.area === s);
    }
    salvar();
    desenharTudo();
  }

  function guardarPosicao() {
    try { localStorage.setItem(chavePos, JSON.stringify({ atual: st.atual, aba: st.aba })); } catch {}
  }

  // ───── Questão
  function irPara(i) {
    if (i < 0 || i >= questoes.length) return;
    const mudouArea = questoes[i].area !== st.aba;
    st.atual = i;
    st.aba = questoes[i].area;
    if (dirty) salvar();
    if (mudouArea || !examLayout.isConnected) desenharTudo();
    else { desenharQuestao(); desenharCartao(); desenharAbas(); }
    guardarPosicao();
    qPanel.querySelector('.q-num')?.focus({ preventScroll: true });
    if (window.matchMedia('(max-width: 960px)').matches) qPanel.scrollIntoView({ block: 'start' });
  }

  function responder(letra) {
    const q = questoes[st.atual];
    if (!q || st.encerrado) return;
    if (st.respostas[q.id] === letra) delete st.respostas[q.id];
    else st.respostas[q.id] = letra;
    sujo();
    atualizarAlternativas();
    desenharCartao();
    desenharAbas();
  }

  function alternarMarcada() {
    const q = questoes[st.atual];
    if (!q || st.encerrado) return;
    if (st.marcadas.has(q.id)) st.marcadas.delete(q.id);
    else st.marcadas.add(q.id);
    sujo();
    const b = qPanel.querySelector('.btn-mark');
    if (b) {
      const on = st.marcadas.has(q.id);
      b.setAttribute('aria-pressed', String(on));
      b.lastChild.textContent = on ? 'Marcada para revisar' : 'Marcar para revisar';
    }
    desenharCartao();
  }

  function alternarRisco(letra) {
    const q = questoes[st.atual];
    const set = new Set(riscadas[q.id] || []);
    if (set.has(letra)) set.delete(letra);
    else set.add(letra);
    riscadas[q.id] = [...set];
    salvarRiscadas();
    atualizarAlternativas();
  }

  function atualizarAlternativas() {
    const q = questoes[st.atual];
    const ris = new Set(riscadas[q.id] || []);
    qPanel.querySelectorAll('.alt').forEach((li) => {
      const l = li.dataset.letra;
      const sel = st.respostas[q.id] === l;
      li.classList.toggle('struck', ris.has(l));
      const b = li.querySelector('.alt-btn');
      b.setAttribute('aria-checked', String(sel));
      b.tabIndex = sel || (!st.respostas[q.id] && l === 'A') ? 0 : -1;
      li.querySelector('.strike-btn').setAttribute('aria-pressed', String(ris.has(l)));
    });
  }

  function desenharQuestao() {
    const q = questoes[st.atual];
    clear(qPanel);
    if (!q) return;
    qPanel.setAttribute('aria-labelledby', `tab-${q.area}`);
    const marcada = st.marcadas.has(q.id);
    const alts = h('ul.alts', { role: 'radiogroup', 'aria-label': `Alternativas da questão ${q.n}` });
    for (const a of q.alternativas) {
      const txt = setRich(h('span.alt-text.rich'), a.texto, { inline: true });
      const btn = h('button.alt-btn', {
        type: 'button', role: 'radio', 'aria-checked': 'false', 'aria-label': `Alternativa ${a.letra}`,
        onclick: () => responder(a.letra),
        onkeydown: (e) => {
          if (!['ArrowDown', 'ArrowUp'].includes(e.key)) return;
          e.preventDefault();
          const i = LETRAS.indexOf(a.letra) + (e.key === 'ArrowDown' ? 1 : -1);
          qPanel.querySelectorAll('.alt-btn')[(i + 5) % 5]?.focus();
        },
      }, h('span.alt-letter', { 'aria-hidden': 'true' }, a.letra), txt);
      const strike = h('button.strike-btn', { type: 'button', 'aria-pressed': 'false', 'aria-label': `Riscar alternativa ${a.letra}`, title: 'Riscar (eliminar) alternativa', onclick: () => alternarRisco(a.letra) }, icon('strike'));
      alts.append(h('li.alt', { dataset: { letra: a.letra } }, btn, strike));
    }
    const idx = st.atual;
    qPanel.append(
      h('div.q-head',
        h('h2.q-num', { tabindex: '-1' }, `Questão ${q.n}`),
        h('span.chip.chip-area', AREAS_CURTAS[q.area]),
        q.disciplina !== AREAS_CURTAS[q.area] ? h('span.chip', q.disciplina + (q.lingua ? ` · ${LINGUAS[q.lingua]}` : '')) : null,
        h('button.btn.btn-sm.btn-mark', { type: 'button', 'aria-pressed': String(marcada), onclick: alternarMarcada }, icon('flag'), h('span', marcada ? 'Marcada para revisar' : 'Marcar para revisar'))),
      setRich(h('div.texto-base.rich'), q.textoBase),
      h('p.fonte', q.fonte),
      setRich(h('div.enunciado.rich'), q.enunciado),
      alts,
      h('div.q-nav',
        h('button.btn', { type: 'button', disabled: idx === 0, onclick: () => irPara(idx - 1) }, '← Anterior'),
        idx === questoes.length - 1
          ? (data.redacao ? h('button.btn.btn-primary', { type: 'button', onclick: () => irParaAba(RED) }, 'Ir para a redação →') : h('button.btn.btn-primary', { type: 'button', onclick: abrirFinalizar }, 'Finalizar prova'))
          : h('button.btn.btn-primary', { type: 'button', onclick: () => irPara(idx + 1) }, 'Próxima →')),
      h('p.kbd-hint', 'Atalhos: ', h('kbd', 'A'), '–', h('kbd', 'E'), ' ou ', h('kbd', '1'), '–', h('kbd', '5'), ' respondem · ', h('kbd', '←'), ' ', h('kbd', '→'), ' navegam · ', h('kbd', 'M'), ' marca para revisar'));
    qPanel.querySelectorAll('svg').forEach((s) => { if (!s.closest('.strike-btn')) s.style.cssText = 'width:16px;height:16px'; });
    atualizarAlternativas();
  }

  // ───── Cartão-resposta
  function desenharCartao() {
    clear(card);
    card.append(h('h2', 'Cartão-resposta', h('button.btn.btn-sm.btn-ghost.card-toggle', { type: 'button', onclick: () => toggleDrawer(false) }, 'Fechar')));
    for (const a of ORDEM_AREAS) {
      const qs = questoes.filter((q) => q.area === a);
      if (!qs.length) continue;
      const grid = h('div.ac-grid');
      for (const q of qs) {
        const i = porId.get(q.id);
        const resp = st.respostas[q.id];
        const estados = [resp ? `respondida ${resp}` : 'em branco', st.marcadas.has(q.id) ? 'marcada para revisar' : '', i === st.atual ? 'atual' : ''].filter(Boolean).join(', ');
        grid.append(h('button.ac-cell', {
          type: 'button',
          class: [resp ? 'answered' : '', st.marcadas.has(q.id) ? 'marked' : '', i === st.atual && st.aba !== RED ? 'current' : ''].filter(Boolean).join(' '),
          'aria-label': `Questão ${q.n}: ${estados}`,
          'aria-current': i === st.atual ? 'true' : null,
          onclick: () => { toggleDrawer(false); irPara(i); },
        }, String(q.n), resp ? h('small', resp) : null));
      }
      card.append(h('div.ac-group', h('h3', `${AREAS_CURTAS[a]} · ${contagemArea(a)}`), grid));
    }
    if (data.redacao) card.append(h('div.ac-group', h('h3', 'Redação'), h('button.btn.btn-sm', { type: 'button', style: 'width:100%', onclick: () => { toggleDrawer(false); irParaAba(RED); } }, `Abrir folha · ≈ ${contarLinhas(st.redacaoTexto)} linhas`)));
    card.append(h('div.ac-legend', h('span', h('i.l-ans'), 'respondida'), h('span', h('i.l-mark'), 'marcada'), h('span', h('i.l-cur'), 'atual'), h('span', h('i'), 'em branco')));
  }

  // ───── Redação
  function desenharRedacao() {
    const red = data.redacao;
    const motivadores = red.textos.map((t, i) => h('div.motivador', h('h3', `Texto ${['I', 'II', 'III', 'IV', 'V'][i] || i + 1}`), setRich(h('div.rich'), t.texto), h('p.fonte', t.fonte)));
    const ta = h('textarea#redacao', {
      'aria-label': 'Folha de redação', spellcheck: 'false', autocapitalize: 'sentences', maxlength: 20000,
      oninput: () => { st.redacaoTexto = ta.value; atualizarContador(); sujo(); },
      onscroll: () => { nums.style.transform = `translateY(${-ta.scrollTop}px)`; },
    });
    ta.value = st.redacaoTexto;
    const nums = h('div.sheet-numbers', { 'aria-hidden': 'true' }, Array.from({ length: 60 }, (_, i) => h('div', String(i + 1))));
    const contador = h('span.counter', { 'aria-live': 'polite' });
    const aviso = h('span', { 'aria-live': 'polite' });
    function atualizarContador() {
      const n = contarLinhas(st.redacaoTexto);
      const p = contarPalavras(st.redacaoTexto);
      contador.textContent = `≈ ${n} / 30 linhas · ${p} palavras`;
      aviso.className = '';
      if (n === 0) { aviso.textContent = 'Em branco: nota zero.'; aviso.className = 'counter-info'; }
      else if (n < 8) { aviso.textContent = 'Menos de 8 linhas: nota zero (texto insuficiente).'; aviso.className = 'counter-warn'; }
      else if (n > 30) { aviso.textContent = 'Acima de 30 linhas: o excesso não é considerado.'; aviso.className = 'counter-warn'; }
      else aviso.textContent = '';
      const tab = document.querySelector(`#tab-${RED} .tab-count`);
      if (tab) tab.textContent = `${n} lin.`;
    }
    atualizarContador();
    essayEl = h('div.essay-layout',
      h('section.essay-prompt', { role: 'tabpanel', 'aria-labelledby': `tab-${RED}` },
        h('h2', 'Proposta de redação'),
        h('div.proposta-box', red.proposta),
        h('p.small.muted', `Eixo: ${red.eixo}`),
        motivadores),
      h('div.sheet-wrap',
        h('div.sheet',
          h('div.sheet-head', h('b', 'Folha de redação'), h('span', 'Estimativa: ~80 caracteres por linha')),
          h('div.sheet-body', { style: 'overflow:hidden' }, nums, ta),
          h('div.sheet-foot', contador, aviso))));
    return essayEl;
  }

  function desenharTudo() {
    clear(body);
    desenharAbas();
    if (st.aba === RED) {
      body.append(desenharRedacao());
      btnCartao.hidden = true;
    } else {
      btnCartao.hidden = false;
      body.append(examLayout, backdrop);
      desenharQuestao();
      desenharCartao();
    }
    guardarPosicao();
  }

  // ───── Atalhos
  function onKey(e) {
    if (st.encerrado || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    if (document.querySelector('dialog[open]')) return;
    if (e.key === 'Escape' && card.classList.contains('open')) { toggleDrawer(false); return; }
    if (st.aba === RED) return;
    const k = e.key.toLowerCase();
    const idxLetra = 'abcde'.indexOf(k) >= 0 ? 'abcde'.indexOf(k) : '12345'.indexOf(k);
    if (k.length === 1 && idxLetra >= 0) { e.preventDefault(); responder(LETRAS[idxLetra]); return; }
    if (e.key === 'ArrowRight' && !t?.closest?.('.tabs')) { e.preventDefault(); irPara(st.atual + 1); return; }
    if (e.key === 'ArrowLeft' && !t?.closest?.('.tabs')) { e.preventDefault(); irPara(st.atual - 1); return; }
    if (k === 'm') { e.preventDefault(); alternarMarcada(); }
  }
  document.addEventListener('keydown', onKey);

  // ───── Timer
  let avisou30 = encerraEm - agoraServ() <= 30 * 60000;
  let avisou5 = encerraEm - agoraServ() <= 5 * 60000;
  let ultimoSeg = -1;
  function tick() {
    const rest = encerraEm - agoraServ();
    const seg = Math.floor(rest / 1000);
    if (seg !== ultimoSeg) {
      ultimoSeg = seg;
      timerText.textContent = fmtRelogio(rest);
      timerEl.className = `timer ${rest < 5 * 60000 ? 'timer-danger' : rest < 30 * 60000 ? 'timer-warn' : 'timer-ok'}`;
      timerEl.setAttribute('aria-label', `Tempo restante: ${fmtRelogio(rest)}`);
    }
    if (!avisou30 && rest <= 30 * 60000) { avisou30 = true; toast('Faltam 30 minutos.', 'warn', 7000); announce('Atenção: faltam 30 minutos para o fim da prova.'); }
    if (!avisou5 && rest <= 5 * 60000) { avisou5 = true; toast('Faltam 5 minutos!', 'danger', 9000); announce('Atenção: faltam 5 minutos para o fim da prova.'); }
    if (rest <= 0 && !st.encerrado) tempoEsgotado();
  }
  const timerInt = setInterval(tick, 250);
  tick();

  // ───── Finalização
  function travar() {
    st.encerrado = true;
    clearInterval(timerInt);
    btnFinalizar.disabled = true;
    body.querySelectorAll('button, textarea').forEach((el) => { el.disabled = true; });
  }

  async function entregar() {
    dirty = true;
    st.encerrado = false;
    await salvar();
    st.encerrado = true;
    try {
      await api.finalizar(id);
    } catch (e) {
      if (e.status !== 409) toast(`A entrega será concluída pelo servidor: ${e.message}`, 'warn');
    }
  }

  async function tempoEsgotado() {
    travar();
    timerText.textContent = '0:00:00';
    announce('Tempo esgotado. Sua prova está sendo entregue.');
    await entregar();
    await modal({ titulo: 'Tempo esgotado', corpo: h('p', 'Suas respostas e sua redação foram salvas e a prova foi entregue automaticamente. A correção já começou.'), acoes: [{ label: 'Acompanhar a correção', valor: true, primario: true }] });
    onFim();
  }

  async function encerrarPorServidor() {
    travar();
    await modal({ titulo: 'Prova encerrada', corpo: h('p', 'O tempo desta prova terminou e ela já foi entregue.'), acoes: [{ label: 'Continuar', valor: true, primario: true }] });
    onFim();
  }

  async function abrirFinalizar() {
    if (st.encerrado) return;
    const resp = questoes.filter((q) => st.respostas[q.id]).length;
    const linhas = contarLinhas(st.redacaoTexto);
    const corpo = h('div',
      h('p', 'Depois de finalizar, não será possível alterar respostas. A IA vai corrigir tudo e montar o seu relatório.'),
      h('div.summary-grid',
        h('div', h('b', String(resp)), h('span', 'respondidas')),
        h('div', h('b', String(questoes.length - resp)), h('span', 'em branco')),
        h('div', h('b', String(st.marcadas.size)), h('span', 'marcadas para revisar')),
        data.redacao ? h('div', h('b', `≈ ${linhas}`), h('span', 'linhas na redação')) : h('div', h('b', fmtRelogio(encerraEm - agoraServ())), h('span', 'restantes'))),
      data.redacao && linhas < 8 ? h('p.counter-warn', 'Sua redação tem menos de 8 linhas e receberá nota zero.') : null,
      questoes.length - resp > 0 ? h('p.small.muted', 'Dica: no Enem não há penalidade por chute; questões em branco contam como erro.') : null);
    const ok = await modal({ titulo: 'Finalizar a prova?', corpo, acoes: [{ label: 'Voltar à prova', valor: false }, { label: 'Finalizar e corrigir', valor: true, primario: true }] });
    if (!ok || st.encerrado) return;
    travar();
    await entregar();
    onFim();
  }

  desenharTudo();

  setCleanup(() => {
    beacon();
    clearInterval(timerInt);
    clearTimeout(saveTimer);
    clearTimeout(retryTimer);
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('pagehide', onPageHide);
    window.removeEventListener('beforeunload', onPageHide);
    document.removeEventListener('visibilitychange', onVis);
  });
}
