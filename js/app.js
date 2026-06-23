/* ============================================================
   app.js — Eisen (Matriz de Eisenhower PWA)
   MVP v1: captura rápida, caixa de entrada, matriz 2x2 adaptativa,
   visão Hoje, datas, etiquetas (#proj/@pessoa), links, busca/filtros,
   concluir/arquivar/lixeira, responsividade, offline-first, streak.
   ============================================================ */
(function () {
  'use strict';

  const DB = window.EisenDB;

  /* ---------- Constantes de domínio ---------- */
  const QUADRANTS = {
    Q1: { label: 'Urgente + Importante', action: 'Faça já', color: 'q1' },
    Q2: { label: 'Importante, não urgente', action: 'Agende / Decida', color: 'q2' },
    Q3: { label: 'Urgente, não importante', action: 'Delegue', color: 'q3' },
    Q4: { label: 'Nem urgente nem importante', action: 'Elimine', color: 'q4' },
  };
  const QORDER = ['Q1', 'Q2', 'Q3', 'Q4'];

  /* ---------- Estado em memória ---------- */
  const state = {
    tasks: [],
    view: 'today',
    query: '',
    mobileQuad: 'Q1', // quadrante atual no carrossel mobile
    editId: null,
    pendingQuadrant: '', // seleção no formulário
  };

  /* ---------- Utilidades ---------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const uid = () => 't_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const nowISO = () => new Date().toISOString();

  function todayStr(d = new Date()) {
    const x = new Date(d);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  }
  function parseDateLocal(s) { return s ? new Date(s + 'T00:00:00') : null; }
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /* Extrai #projeto e @pessoa do título -> tags + project */
  function parseTokens(title) {
    const tags = [];
    let project = '';
    const re = /([#@])([\p{L}\p{N}_\-]+)/gu;
    let m;
    while ((m = re.exec(title)) !== null) {
      const token = m[1] + m[2];
      tags.push(token);
      if (m[1] === '#' && !project) project = m[2];
    }
    return { tags, project };
  }

  /* ---------- Acesso a dados ---------- */
  async function loadTasks() {
    state.tasks = await DB.all();
  }
  function activeTasks() { return state.tasks.filter(t => t.status === 'active'); }

  async function saveTask(task) {
    task.updatedAt = nowISO();
    await DB.put(task);
    const i = state.tasks.findIndex(t => t.id === task.id);
    if (i >= 0) state.tasks[i] = task; else state.tasks.push(task);
  }

  function newTaskFromForm() {
    const title = $('#f_title').value.trim();
    if (!title) return null;
    const { tags, project } = parseTokens(title);
    const formProject = $('#f_project').value.trim();
    const links = $('#f_links').value.split('\n').map(s => s.trim()).filter(Boolean);
    const base = {
      id: state.editId || uid(),
      title,
      quadrant: state.pendingQuadrant || null,
      status: 'active',
      description: $('#f_desc').value.trim(),
      dueDate: $('#f_due').value || null,
      plannedDate: $('#f_planned').value || null,
      tags,
      project: formProject || project || '',
      links,
      createdAt: nowISO(),
      updatedAt: nowISO(),
      completedAt: null,
      deletedAt: null,
    };
    if (state.editId) {
      const existing = state.tasks.find(t => t.id === state.editId);
      if (existing) {
        base.createdAt = existing.createdAt;
        base.status = existing.status;
        base.completedAt = existing.completedAt;
      }
    }
    return base;
  }

  /* ============================================================
     STREAK (ofensiva gentil — nunca punitiva)
     ============================================================ */
  async function bumpStreak() {
    const today = todayStr();
    let s = await DB.getMeta('streak', { count: 0, last: null });
    if (s.last === today) return s; // já contou hoje
    const yest = todayStr(new Date(Date.now() - 86400000));
    s.count = (s.last === yest) ? (s.count + 1) : 1;
    s.last = today;
    await DB.setMeta('streak', s);
    renderStreak(s);
    return s;
  }
  async function renderStreak(s) {
    s = s || await DB.getMeta('streak', { count: 0, last: null });
    const badge = $('#streakBadge');
    const today = todayStr();
    const yest = todayStr(new Date(Date.now() - 86400000));
    const active = s.last === today || s.last === yest;
    if (active && s.count > 0) {
      $('#streakCount').textContent = s.count;
      badge.hidden = false;
    } else {
      badge.hidden = true;
    }
  }

  /* ============================================================
     RENDERIZAÇÃO DE VIEWS
     ============================================================ */
  const main = $('#main');

  function render() {
    // nav active state
    $$('.nav__item').forEach(b => b.setAttribute('aria-current', b.dataset.view === state.view ? 'page' : 'false'));
    updateBadges();
    switch (state.view) {
      case 'today': return renderToday();
      case 'matrix': return renderMatrix();
      case 'inbox': return renderInbox();
      case 'search': return renderSearch();
      case 'archive': return renderArchive();
      case 'settings': return renderSettings();
      default: return renderToday();
    }
  }

  function updateBadges() {
    const inboxCount = activeTasks().filter(t => !t.quadrant).length;
    const badge = $('#inboxBadge');
    if (inboxCount > 0) { badge.textContent = inboxCount; badge.hidden = false; }
    else badge.hidden = true;
  }

  /* ---------- Card de tarefa ---------- */
  function taskCard(t, opts = {}) {
    const overdue = t.dueDate && t.dueDate < todayStr() && t.status === 'active';
    const tagsHtml = (t.tags || []).map(tag =>
      `<span class="tag ${tag[0] === '@' ? 'tag--person' : ''}">${escapeHtml(tag)}</span>`).join('');
    const dueHtml = t.dueDate
      ? `<span class="meta ${overdue ? 'meta--overdue' : ''}" title="Vencimento">📅 ${formatShort(t.dueDate)}</span>` : '';
    const linkHtml = (t.links && t.links.length)
      ? `<span class="meta" title="${t.links.length} link(s)">🔗 ${t.links.length}</span>` : '';
    const qBadge = (opts.showQuadrant && t.quadrant)
      ? `<span class="qbadge qbadge--${QUADRANTS[t.quadrant].color}">${t.quadrant}</span>` : '';

    return `
      <article class="card ${t.status === 'done' ? 'card--done' : ''}" data-id="${t.id}" draggable="true" tabindex="0"
               aria-label="Tarefa: ${escapeHtml(t.title)}">
        <button class="card__check" data-act="toggle" aria-label="${t.status === 'done' ? 'Reabrir tarefa' : 'Concluir tarefa'}">
          ${t.status === 'done' ? '✓' : ''}
        </button>
        <div class="card__body" data-act="edit">
          <p class="card__title">${qBadge}${escapeHtml(t.title)}</p>
          <div class="card__meta">${dueHtml}${linkHtml}${tagsHtml}</div>
        </div>
        <div class="card__tools">
          <button class="iconbtn iconbtn--sm" data-act="archive" aria-label="Arquivar">🗄</button>
          <button class="iconbtn iconbtn--sm" data-act="trash" aria-label="Mover para a lixeira">🗑</button>
        </div>
      </article>`;
  }

  function formatShort(s) {
    const d = parseDateLocal(s);
    if (!d) return s;
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  }

  function emptyState(icon, title, sub) {
    return `<div class="empty"><div class="empty__icon" aria-hidden="true">${icon}</div>
      <p class="empty__title">${title}</p><p class="empty__sub">${sub}</p></div>`;
  }

  /* ---------- HOJE ---------- */
  function renderToday() {
    const today = todayStr();
    const tasks = activeTasks();
    const overdue = tasks.filter(t => t.dueDate && t.dueDate < today);
    const dueToday = tasks.filter(t => t.dueDate === today || t.plannedDate === today);
    const q1 = tasks.filter(t => t.quadrant === 'Q1' && !overdue.includes(t) && !dueToday.includes(t));

    const total = overdue.length + dueToday.length + q1.length;
    let html = `<div class="view view--today">
      <div class="view__head"><h2>☀ Hoje</h2><p class="view__sub">${new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</p></div>`;

    if (total === 0) {
      html += emptyState('🎉', 'Tudo limpo por hoje!', 'Sem tarefas atrasadas ou para hoje. Aproveite a clareza.');
    } else {
      if (overdue.length) html += section('⚠ Atrasadas', overdue, { showQuadrant: true });
      if (dueToday.length) html += section('📌 Para hoje', dueToday, { showQuadrant: true });
      if (q1.length) html += section('🔥 Urgente + Importante (Q1)', q1, { showQuadrant: false });
    }
    html += `</div>`;
    main.innerHTML = html;
  }
  function section(title, list, opts) {
    return `<section class="todo-section"><h3 class="todo-section__title">${title} <span class="count">${list.length}</span></h3>
      <div class="cardlist">${list.map(t => taskCard(t, opts)).join('')}</div></section>`;
  }

  /* ---------- MATRIZ (adaptativa) ---------- */
  function renderMatrix() {
    const tasks = activeTasks().filter(matchesQuery);
    const isMobile = window.matchMedia('(max-width: 640px)').matches;

    if (isMobile) return renderMatrixMobile(tasks);

    let cells = QORDER.map(q => quadrantCell(q, tasks.filter(t => t.quadrant === q))).join('');
    main.innerHTML = `<div class="view"><div class="view__head"><h2>▦ Matriz</h2>
        <p class="view__sub">Arraste tarefas entre os quadrantes</p></div>
      <div class="matrix">${cells}</div></div>`;
  }

  function quadrantCell(q, list) {
    const meta = QUADRANTS[q];
    return `<section class="quad quad--${meta.color}" data-quad="${q}" aria-label="${q}: ${meta.label}">
      <header class="quad__head"><span class="quad__tag">${q}</span>
        <span class="quad__name">${meta.label}</span><span class="quad__action">${meta.action}</span></header>
      <div class="quad__drop cardlist" data-drop="${q}">
        ${list.length ? list.map(t => taskCard(t)).join('') : `<p class="quad__empty">Solte ou crie uma tarefa aqui</p>`}
      </div></section>`;
  }

  function renderMatrixMobile(tasks) {
    const q = state.mobileQuad;
    const meta = QUADRANTS[q];
    const list = tasks.filter(t => t.quadrant === q);
    const tabs = QORDER.map(qq =>
      `<button class="qtab qtab--${QUADRANTS[qq].color} ${qq === q ? 'is-active' : ''}" data-qtab="${qq}"
        aria-pressed="${qq === q}">${qq}</button>`).join('');
    main.innerHTML = `<div class="view"><div class="view__head"><h2>▦ Matriz</h2></div>
      <div class="qtabs" role="tablist">${tabs}</div>
      <div class="quad quad--${meta.color} quad--full">
        <header class="quad__head"><span class="quad__name">${meta.label}</span><span class="quad__action">${meta.action}</span></header>
        <div class="quad__drop cardlist" data-drop="${q}">
          ${list.length ? list.map(t => taskCard(t)).join('') : emptyState('▦', 'Vazio', 'Toque no + para adicionar. Toque e segure um card para mudar de quadrante.')}
        </div></div></div>`;
  }

  /* ---------- CAIXA DE ENTRADA ---------- */
  function renderInbox() {
    const list = activeTasks().filter(t => !t.quadrant).filter(matchesQuery);
    main.innerHTML = `<div class="view"><div class="view__head"><h2>⬇ Caixa de Entrada</h2>
        <p class="view__sub">Jogue a tarefa agora, classifique depois</p></div>
      ${list.length ? `<div class="cardlist">${list.map(t => taskCard(t)).join('')}</div>`
        : emptyState('📥', 'Entrada vazia', 'Capture rápido com o botão + e organize quando puder.')}</div>`;
  }

  /* ---------- BUSCA / FILTROS ---------- */
  function renderSearch() {
    const q = state.query.trim().toLowerCase();
    const list = activeTasks().filter(matchesQuery);
    main.innerHTML = `<div class="view"><div class="view__head"><h2>⌕ Busca & Filtros</h2>
        <p class="view__sub">${q ? `Resultados para "${escapeHtml(state.query)}"` : 'Digite na barra de busca acima'}</p></div>
      ${list.length ? `<div class="cardlist">${list.map(t => taskCard(t, { showQuadrant: true })).join('')}</div>`
        : emptyState('🔍', 'Nada encontrado', 'Tente outro termo, #projeto ou @pessoa.')}</div>`;
  }

  function matchesQuery(t) {
    const q = state.query.trim().toLowerCase();
    if (!q) return true;
    const hay = [t.title, t.description, t.project, (t.tags || []).join(' ')].join(' ').toLowerCase();
    return hay.includes(q);
  }

  /* ---------- ARQUIVO / LIXEIRA ---------- */
  function renderArchive() {
    const archived = state.tasks.filter(t => t.status === 'archived');
    const trashed = state.tasks.filter(t => t.status === 'deleted');
    main.innerHTML = `<div class="view"><div class="view__head"><h2>🗄 Arquivo & Lixeira</h2></div>
      <section class="todo-section"><h3 class="todo-section__title">Arquivadas <span class="count">${archived.length}</span></h3>
        <div class="cardlist">${archived.length ? archived.map(t => archiveRow(t, 'archived')).join('') : '<p class="quad__empty">Nada arquivado</p>'}</div></section>
      <section class="todo-section"><h3 class="todo-section__title">🗑 Lixeira <span class="count">${trashed.length}</span>
        ${trashed.length ? `<button class="btn btn--ghost btn--sm" id="emptyTrash">Esvaziar lixeira</button>` : ''}</h3>
        <div class="cardlist">${trashed.length ? trashed.map(t => archiveRow(t, 'deleted')).join('') : '<p class="quad__empty">Lixeira vazia</p>'}</div></section>
      </div>`;
  }
  function archiveRow(t, kind) {
    return `<article class="card card--muted" data-id="${t.id}">
      <div class="card__body"><p class="card__title">${escapeHtml(t.title)}</p></div>
      <div class="card__tools">
        <button class="iconbtn iconbtn--sm" data-act="restore" aria-label="Restaurar">↩</button>
        ${kind === 'deleted' ? `<button class="iconbtn iconbtn--sm" data-act="purge" aria-label="Excluir definitivamente">✕</button>` : ''}
      </div></article>`;
  }

  /* ---------- CONFIGURAÇÕES ---------- */
  async function renderSettings() {
    const theme = await DB.getMeta('theme', 'auto');
    const count = state.tasks.length;
    main.innerHTML = `<div class="view"><div class="view__head"><h2>⚙ Configurações</h2></div>
      <section class="settings">
        <div class="setting">
          <div><b>Tema</b><p class="setting__sub">Claro, escuro ou automático</p></div>
          <select id="themeSelect" class="form__input form__input--sm">
            <option value="auto"${theme==='auto'?' selected':''}>Automático</option>
            <option value="light"${theme==='light'?' selected':''}>Claro</option>
            <option value="dark"${theme==='dark'?' selected':''}>Escuro</option>
          </select>
        </div>
        <div class="setting">
          <div><b>Notificações</b><p class="setting__sub">Lembretes (opt-in, nunca invasivos)</p></div>
          <button class="btn btn--ghost btn--sm" id="notifyBtn">Ativar</button>
        </div>
        <div class="setting setting--col">
          <div><b>Privacidade & dados</b>
            <p class="setting__sub">Seus dados ficam <b>no seu dispositivo</b> (IndexedDB). Nada é enviado a servidores nesta versão.</p></div>
          <div class="setting__row">
            <button class="btn btn--ghost btn--sm" id="exportBtn">Exportar backup (.json)</button>
            <label class="btn btn--ghost btn--sm" for="importInput">Importar backup</label>
            <input type="file" id="importInput" accept="application/json" hidden />
          </div>
        </div>
        <p class="setting__foot">${count} tarefa(s) armazenada(s) localmente · Eisen v1 (MVP) · offline-first PWA</p>
      </section></div>`;
  }

  /* ============================================================
     AÇÕES SOBRE TAREFAS
     ============================================================ */
  async function toggleDone(id) {
    const t = state.tasks.find(x => x.id === id);
    if (!t) return;
    if (t.status === 'done') {
      t.status = 'active'; t.completedAt = null;
    } else {
      t.status = 'done'; t.completedAt = nowISO();
      await bumpStreak();
      celebrate();
    }
    await saveTask(t);
    render();
  }
  async function setStatus(id, status) {
    const t = state.tasks.find(x => x.id === id);
    if (!t) return;
    t.status = status;
    if (status === 'deleted') t.deletedAt = nowISO();
    await saveTask(t);
    toast(status === 'archived' ? 'Arquivada' : status === 'deleted' ? 'Movida para a lixeira' : 'Restaurada',
      status === 'deleted' ? { label: 'Desfazer', fn: () => restore(id) } : null);
    render();
  }
  async function restore(id) {
    const t = state.tasks.find(x => x.id === id);
    if (!t) return;
    t.status = 'active'; t.deletedAt = null;
    await saveTask(t);
    render();
  }
  async function purge(id) {
    await DB.remove(id);
    state.tasks = state.tasks.filter(t => t.id !== id);
    render();
  }
  async function moveToQuadrant(id, q) {
    const t = state.tasks.find(x => x.id === id);
    if (!t || t.quadrant === q) return;
    t.quadrant = q;
    await saveTask(t);
    render();
  }

  /* ============================================================
     CAPTURA / EDIÇÃO (sheet)
     ============================================================ */
  const sheet = $('#sheet'), backdrop = $('#sheetBackdrop');

  function openSheet(task) {
    state.editId = task ? task.id : null;
    state.pendingQuadrant = task ? (task.quadrant || '') : (state.view === 'matrix' ? state.mobileQuad : '');
    $('#sheetTitle').textContent = task ? 'Editar tarefa' : 'Nova tarefa';
    $('#f_id').value = task ? task.id : '';
    $('#f_title').value = task ? task.title : '';
    $('#f_desc').value = task ? (task.description || '') : '';
    $('#f_due').value = task ? (task.dueDate || '') : '';
    $('#f_planned').value = task ? (task.plannedDate || '') : '';
    $('#f_project').value = task ? (task.project || '') : '';
    $('#f_links').value = task ? (task.links || []).join('\n') : '';
    $('#moreDetails').open = !!(task && (task.description || task.dueDate || task.plannedDate || task.project || (task.links||[]).length));
    syncQuadPick();
    backdrop.hidden = false;
    sheet.hidden = false;
    requestAnimationFrame(() => { sheet.classList.add('is-open'); backdrop.classList.add('is-open'); });
    setTimeout(() => $('#f_title').focus(), 120);
  }
  function closeSheet() {
    sheet.classList.remove('is-open'); backdrop.classList.remove('is-open');
    setTimeout(() => { sheet.hidden = true; backdrop.hidden = true; }, 220);
    state.editId = null;
  }
  function syncQuadPick() {
    $$('.quadpick__btn').forEach(b => b.classList.toggle('is-sel', (b.dataset.q || '') === state.pendingQuadrant));
  }

  async function submitForm(e) {
    e.preventDefault();
    const t = newTaskFromForm();
    if (!t) { $('#f_title').focus(); return; }
    await saveTask(t);
    closeSheet();
    if (!state.editId && !t.quadrant) { /* nova p/ inbox */ }
    toast(state.editId ? 'Tarefa atualizada' : 'Tarefa capturada ✓');
    render();
  }

  /* ============================================================
     CELEBRAÇÃO (recompensa de clareza — micro, não punitiva)
     ============================================================ */
  let celebTimer;
  function celebrate() {
    const remaining = activeTasks().filter(t => {
      const today = todayStr();
      return t.dueDate === today || t.plannedDate === today || (t.dueDate && t.dueDate < today) || t.quadrant === 'Q1';
    }).length;
    const el = $('#celebrate');
    const big = remaining === 0;
    el.innerHTML = big
      ? `<div class="celebrate__card"><div class="confetti">🎉</div><b>Hoje concluído!</b><span>Matriz organizada. Clareza conquistada.</span></div>`
      : `<div class="celebrate__pop">✓</div>`;
    el.hidden = false; el.classList.add('is-on');
    clearTimeout(celebTimer);
    celebTimer = setTimeout(() => { el.classList.remove('is-on'); setTimeout(() => el.hidden = true, 300); }, big ? 2200 : 700);
  }

  /* ============================================================
     TOASTS
     ============================================================ */
  function toast(msg, action) {
    const wrap = $('#toasts');
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `<span>${escapeHtml(msg)}</span>`;
    if (action) {
      const b = document.createElement('button');
      b.className = 'toast__act'; b.textContent = action.label;
      b.onclick = () => { action.fn(); el.remove(); };
      el.appendChild(b);
    }
    wrap.appendChild(el);
    requestAnimationFrame(() => el.classList.add('is-on'));
    setTimeout(() => { el.classList.remove('is-on'); setTimeout(() => el.remove(), 300); }, 3500);
  }

  /* ============================================================
     DRAG & DROP (PC/tablet)  +  LONG-PRESS (mobile)
     ============================================================ */
  let dragId = null;
  function setupDnD() {
    document.addEventListener('dragstart', (e) => {
      const card = e.target.closest('.card');
      if (!card) return;
      dragId = card.dataset.id;
      card.classList.add('is-dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    document.addEventListener('dragend', (e) => {
      const card = e.target.closest('.card');
      if (card) card.classList.remove('is-dragging');
      $$('.quad__drop.is-over').forEach(d => d.classList.remove('is-over'));
    });
    document.addEventListener('dragover', (e) => {
      const drop = e.target.closest('.quad__drop');
      if (!drop) return;
      e.preventDefault();
      drop.classList.add('is-over');
    });
    document.addEventListener('dragleave', (e) => {
      const drop = e.target.closest('.quad__drop');
      if (drop && !drop.contains(e.relatedTarget)) drop.classList.remove('is-over');
    });
    document.addEventListener('drop', (e) => {
      const drop = e.target.closest('.quad__drop');
      if (!drop || !dragId) return;
      e.preventDefault();
      moveToQuadrant(dragId, drop.dataset.drop);
      dragId = null;
    });
  }

  /* Long-press para abrir seletor de quadrante no mobile */
  let pressTimer = null;
  function setupLongPress() {
    main.addEventListener('touchstart', (e) => {
      const card = e.target.closest('.card');
      if (!card) return;
      pressTimer = setTimeout(() => {
        navigator.vibrate && navigator.vibrate(15);
        openQuadrantChooser(card.dataset.id);
      }, 480);
    }, { passive: true });
    ['touchend', 'touchmove', 'touchcancel'].forEach(ev =>
      main.addEventListener(ev, () => clearTimeout(pressTimer), { passive: true }));
  }
  function openQuadrantChooser(id) {
    const t = state.tasks.find(x => x.id === id);
    if (!t) return;
    const wrap = document.createElement('div');
    wrap.className = 'chooser';
    wrap.innerHTML = `<div class="chooser__sheet">
      <p class="chooser__title">Mover "${escapeHtml(t.title)}" para…</p>
      ${QORDER.map(q => `<button data-mq="${q}" class="chooser__opt chooser__opt--${QUADRANTS[q].color}">
        <b>${q}</b> ${QUADRANTS[q].label} <em>(${QUADRANTS[q].action})</em></button>`).join('')}
      <button data-mq="" class="chooser__opt">⬇ Caixa de Entrada</button>
      <button class="chooser__cancel">Cancelar</button></div>`;
    document.body.appendChild(wrap);
    requestAnimationFrame(() => wrap.classList.add('is-on'));
    wrap.addEventListener('click', (e) => {
      const opt = e.target.closest('[data-mq]');
      if (opt) { moveToQuadrant(id, opt.dataset.mq || null); }
      if (opt || e.target.classList.contains('chooser__cancel') || e.target === wrap) {
        wrap.classList.remove('is-on'); setTimeout(() => wrap.remove(), 200);
      }
    });
  }

  /* ============================================================
     EVENTOS GLOBAIS
     ============================================================ */
  function setupEvents() {
    // Navegação
    $('#nav').addEventListener('click', (e) => {
      const btn = e.target.closest('.nav__item');
      if (!btn) return;
      state.view = btn.dataset.view;
      render();
    });

    // FAB
    $('#fab').addEventListener('click', () => openSheet(null));

    // Sheet
    $('#sheetCancel').addEventListener('click', closeSheet);
    backdrop.addEventListener('click', closeSheet);
    $('#taskForm').addEventListener('submit', submitForm);
    $('.quadpick').addEventListener('click', (e) => {
      const b = e.target.closest('.quadpick__btn');
      if (!b) return;
      state.pendingQuadrant = b.dataset.q || '';
      syncQuadPick();
    });

    // Busca
    $('#searchInput').addEventListener('input', (e) => {
      state.query = e.target.value;
      if (state.view !== 'search' && state.query) state.view = 'search';
      render();
    });

    // Tema toggle rápido
    $('#themeToggle').addEventListener('click', cycleTheme);

    // Delegação de cliques em cards / listas / configurações
    main.addEventListener('click', onMainClick);

    // Tabs do mobile na matriz
    main.addEventListener('click', (e) => {
      const tab = e.target.closest('[data-qtab]');
      if (tab) { state.mobileQuad = tab.dataset.qtab; render(); }
    });

    // Atalhos de teclado (PC)
    document.addEventListener('keydown', onKeydown);

    setupDnD();
    setupLongPress();
  }

  async function onMainClick(e) {
    const actBtn = e.target.closest('[data-act]');
    if (actBtn) {
      const card = actBtn.closest('[data-id]');
      const id = card && card.dataset.id;
      const act = actBtn.dataset.act;
      if (act === 'toggle') return toggleDone(id);
      if (act === 'archive') return setStatus(id, 'archived');
      if (act === 'trash') return setStatus(id, 'deleted');
      if (act === 'restore') return restore(id);
      if (act === 'purge') return purge(id);
      if (act === 'edit') { const t = state.tasks.find(x => x.id === id); return openSheet(t); }
    }
    // Settings handlers
    if (e.target.id === 'emptyTrash') {
      await DB.clearStatus('deleted');
      state.tasks = state.tasks.filter(t => t.status !== 'deleted');
      return render();
    }
    if (e.target.id === 'exportBtn') return exportBackup();
    if (e.target.id === 'notifyBtn') return requestNotify();
  }

  function onKeydown(e) {
    if (e.target.matches('input, textarea, select')) {
      if (e.key === 'Escape') e.target.blur();
      return;
    }
    if (!sheet.hidden && e.key === 'Escape') return closeSheet();
    switch (e.key.toLowerCase()) {
      case 'n': e.preventDefault(); openSheet(null); break;
      case '/': e.preventDefault(); $('#searchInput').focus(); break;
      case 't': state.view = 'today'; render(); break;
      case 'm': state.view = 'matrix'; render(); break;
      case 'i': state.view = 'inbox'; render(); break;
      case '1': case '2': case '3': case '4':
        if (state.view === 'matrix') { state.mobileQuad = 'Q' + e.key; render(); }
        break;
    }
  }

  /* ============================================================
     TEMA
     ============================================================ */
  async function applyTheme(theme) {
    document.body.dataset.theme = theme;
    await DB.setMeta('theme', theme);
  }
  async function cycleTheme() {
    const cur = await DB.getMeta('theme', 'auto');
    const next = cur === 'auto' ? 'light' : cur === 'light' ? 'dark' : 'auto';
    await applyTheme(next);
  }

  /* ============================================================
     BACKUP / NOTIFICAÇÕES
     ============================================================ */
  async function exportBackup() {
    const data = await DB.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `eisen-backup-${todayStr()}.json`;
    a.click(); URL.revokeObjectURL(url);
    toast('Backup exportado');
  }
  async function importBackup(file) {
    try {
      const data = JSON.parse(await file.text());
      await DB.importAll(data);
      await loadTasks();
      toast('Backup importado ✓');
      render();
    } catch (err) { toast('Falha ao importar: ' + err.message); }
  }
  async function requestNotify() {
    if (!('Notification' in window)) return toast('Notificações não suportadas neste navegador');
    const p = await Notification.requestPermission();
    toast(p === 'granted' ? 'Notificações ativadas' : 'Permissão negada');
  }

  // import input (delegado pois o elemento é recriado)
  document.addEventListener('change', (e) => {
    if (e.target.id === 'importInput' && e.target.files[0]) importBackup(e.target.files[0]);
    if (e.target.id === 'themeSelect') applyTheme(e.target.value);
  });

  /* ============================================================
     SERVICE WORKER (offline-first)
     ============================================================ */
  function registerSW() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(() => {/* offline mesmo assim via IndexedDB */});
      });
    }
  }

  /* ============================================================
     SEED (primeira execução — exemplos didáticos, removíveis)
     ============================================================ */
  async function maybeSeed() {
    const seeded = await DB.getMeta('seeded', false);
    if (seeded || state.tasks.length) return;
    const samples = [
      { title: 'Bem-vindo! Toque no ＋ para capturar uma tarefa', quadrant: 'Q2' },
      { title: 'Arraste-me para outro quadrante (toque e segure no celular)', quadrant: 'Q1' },
      { title: 'Pagar conta de luz #financeiro', quadrant: 'Q1', dueDate: todayStr() },
      { title: 'Estudar para a certificação @eu', quadrant: 'Q2' },
      { title: 'Responder e-mails não essenciais', quadrant: 'Q3' },
      { title: 'Rolar feed sem objetivo', quadrant: 'Q4' },
    ];
    for (const s of samples) {
      const { tags, project } = parseTokens(s.title);
      await DB.put({
        id: uid(), title: s.title, quadrant: s.quadrant || null, status: 'active',
        description: '', dueDate: s.dueDate || null, plannedDate: null, tags, project,
        links: [], createdAt: nowISO(), updatedAt: nowISO(), completedAt: null, deletedAt: null,
      });
    }
    await DB.setMeta('seeded', true);
    await loadTasks();
  }

  /* ============================================================
     INIT
     ============================================================ */
  async function init() {
    const theme = await DB.getMeta('theme', 'auto');
    document.body.dataset.theme = theme;
    await loadTasks();
    await maybeSeed();
    await renderStreak();
    setupEvents();
    registerSW();
    render();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
