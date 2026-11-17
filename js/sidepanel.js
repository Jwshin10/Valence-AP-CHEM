/* Side panel with quick tools (periodic table, reference sheet, calculator).
   Opens from the top bar, the right-edge tabs or a key, on every page, and stays open
   while you move between topics. */
'use strict';
(function () {
  const h = U.h, $ = s => document.querySelector(s);
  const body = document.body;
  const SVG = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const TOOLS = [
    { id: 'table', label: 'Periodic table', key: 'p', glyph: 'H', color: '#78b4ec', build: buildTable,
      icon: SVG('<path d="M3 4h4v4H3zM17 4h4v4h-4zM3 8h4v4H3zM7 8h4v4H7zM13 8h4v4h-4zM17 8h4v4h-4zM3 12h18v4H3zM6 18.5h12"/>') },
    { id: 'ref', label: 'Reference', key: 'r', glyph: 'Rf', color: '#9fc7a8', build: buildRef,
      icon: SVG('<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4M9 11h7M9 14.5h7M9 18h4"/>') },
    { id: 'calc', label: 'Calculator', key: 'c', glyph: '±', color: '#e8c75a', build: buildCalc,
      icon: SVG('<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8.5 11h.01M12 11h.01M15.5 11h.01M8.5 14.5h.01M12 14.5h.01M15.5 14.5h.01M8.5 18h.01M12 18h3.5"/>') },
  ];
  const byId = Object.fromEntries(TOOLS.map(t => [t.id, t]));
  let current = byId[U.store.get('sideTab', 'table')] ? U.store.get('sideTab', 'table') : 'table';

  /* ---------- shell ---------- */
  const panel = h('aside', { class: 'pt-panel', id: 'sidePanel', 'aria-label': 'Quick tools', hidden: true });
  const closeBtn = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Close panel', html: SVG('<path d="M6 6l12 12M18 6L6 18"/>') });
  const tabBar = h('div', { class: 'sp-tabs', role: 'tablist' });
  panel.append(h('div', { class: 'pt-head' }, tabBar, closeBtn));
  const edges = h('div', { class: 'pt-edges' });
  const scrim = h('div', { class: 'pt-scrim' });
  body.append(panel, edges, scrim);
  const topGroup = $('#toolBtns');

  for (const t of TOOLS) {
    t.tab = h('button', { type: 'button', role: 'tab', class: 'sp-tab', 'aria-controls': 'sp-' + t.id }, t.label);
    t.tab.addEventListener('click', () => show(t.id));
    tabBar.appendChild(t.tab);
    t.view = h('div', { class: 'pt-body', id: 'sp-' + t.id, role: 'tabpanel', hidden: true });
    panel.appendChild(t.view);
    t.edge = h('button', { type: 'button', class: 'pt-edge', 'aria-controls': 'sidePanel', title: `${t.label} (${t.key.toUpperCase()})` },
      h('span', { class: 'pt-edge-sym', style: { background: t.color } }, t.glyph), h('span', null, t.label));
    t.edge.addEventListener('click', () => open(t.id));
    edges.appendChild(t.edge);
    if (topGroup) {
      t.top = h('button', { type: 'button', class: 'pt-btn', 'aria-controls': 'sidePanel', 'aria-expanded': 'false', title: `${t.label} (${t.key.toUpperCase()})`, 'aria-label': t.label, html: t.icon + `<span>${t.label}</span>` });
      t.top.addEventListener('click', () => (isOpen() && current === t.id ? close() : open(t.id)));
      topGroup.appendChild(t.top);
    }
  }

  const isOpen = () => body.classList.contains('pt-open');
  function show(id) {
    current = id;
    U.store.set('sideTab', id);
    for (const t of TOOLS) {
      const on = t.id === id;
      if (on && !t.built) { t.built = true; t.build(t.view); }
      t.view.hidden = !on;
      t.tab.classList.toggle('on', on);
      t.tab.setAttribute('aria-selected', on);
    }
    body.classList.toggle('sp-on-calc', id === 'calc');
    sync();
  }
  function sync() {
    for (const t of TOOLS) if (t.top) t.top.setAttribute('aria-expanded', isOpen() && current === t.id ? 'true' : 'false');
  }
  function open(id) {
    show(id || current);
    panel.hidden = false;
    requestAnimationFrame(() => { body.classList.add('pt-open'); sync(); });
    U.store.set('sideOpen', true);
  }
  function close() {
    body.classList.remove('pt-open');
    sync();
    U.store.set('sideOpen', false);
    setTimeout(() => { if (!isOpen()) panel.hidden = true; }, 220);
  }
  closeBtn.addEventListener('click', close);
  scrim.addEventListener('click', close);
  document.addEventListener('keydown', e => {
    const a = document.activeElement;
    const typing = a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || a.isContentEditable);
    if (e.key === 'Escape' && isOpen() && (!typing || panel.contains(a))) { close(); const t = byId[current]; (t.top || t.edge).focus(); return; }
    if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = TOOLS.find(x => x.key === e.key.toLowerCase());
    if (t) { e.preventDefault(); isOpen() && current === t.id ? close() : open(t.id); }
  });

  /* ---------- periodic table ---------- */
  function buildTable(view) {
    let selZ = U.store.get('ptPanelSel', 6), query = '';
    const cells = {};
    const find = h('input', { type: 'text', class: 'pt-find', placeholder: 'Find by name, symbol or number', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Find an element' });
    const grid = h('div', { class: 'pt-mini' });
    for (const e of ELEMENTS.list) {
      const row = e.fblock ? (e.period === 6 ? 9 : 10) : e.period;
      const col = e.fblock ? 3 + e.fcol : e.group;
      const c = h('button', { type: 'button', class: 'pt-cell', title: `${e.name}, ${e.mass}`, 'aria-label': `${e.Z} ${e.name}`, style: { gridRow: row, gridColumn: col, background: ELEMENTS.CAT_COLORS[e.cat] } },
        h('span', { class: 'z' }, e.Z), h('span', { class: 's' }, e.sym), h('span', { class: 'm' }, e.mass < 100 ? e.mass.toFixed(2) : e.mass.toFixed(1)));
      c.addEventListener('click', () => select(e.Z));
      cells[e.Z] = c; grid.appendChild(c);
    }
    grid.appendChild(h('div', { class: 'pt-cell ph', style: { gridRow: 6, gridColumn: 3 } }, '57–71'));
    grid.appendChild(h('div', { class: 'pt-cell ph', style: { gridRow: 7, gridColumn: 3 } }, '89–103'));
    grid.appendChild(h('div', { class: 'pt-gap', style: { gridRow: 8, gridColumn: '1 / span 18' } }));
    const legend = h('div', { class: 'legend pt-legend' }, Object.keys(ELEMENTS.CAT_NAMES).map(k => h('span', null, h('i', { style: { background: ELEMENTS.CAT_COLORS[k] } }), ELEMENTS.CAT_NAMES[k])));
    const info = h('div', { class: 'pt-info' });
    view.append(find, grid, legend, info, pageLink('#periodic-table', 'Open the full table with trend maps'));

    find.addEventListener('input', () => { query = find.value.trim().toLowerCase(); filter(); });
    find.addEventListener('keydown', e => { if (e.key === 'Enter') { const m = matches(); if (m.length) select(m[0].Z); } });

    function matches() {
      if (!query) return [];
      return ELEMENTS.list.filter(e => String(e.Z) === query || e.sym.toLowerCase() === query || e.name.toLowerCase().startsWith(query))
        .concat(ELEMENTS.list.filter(e => e.name.toLowerCase().includes(query) && !e.name.toLowerCase().startsWith(query) && e.sym.toLowerCase() !== query))
        .sort((a, b) => (b.sym.toLowerCase() === query) - (a.sym.toLowerCase() === query));
    }
    function filter() {
      const m = new Set(matches().map(e => e.Z));
      for (const z in cells) cells[z].classList.toggle('dim', !!query && !m.has(+z));
      if (m.size === 1) select([...m][0]);
    }
    function select(Z) {
      selZ = Math.max(1, Math.min(118, Z));
      U.store.set('ptPanelSel', selZ);
      for (const z in cells) cells[z].classList.toggle('sel', +z === selZ);
      detail();
    }
    function detail() {
      U.clear(info);
      const e = ELEMENTS.byZ[selZ];
      const tile = h('div', { class: 'pt-big', style: { background: ELEMENTS.CAT_COLORS[e.cat] } },
        h('span', { class: 'z' }, e.Z), h('b', null, e.sym), h('span', { class: 'm' }, e.mass));
      const step = d => U.btn(d < 0 ? 'Previous' : 'Next', () => select(selZ + d), 'sm');
      const kv = h('dl', { class: 'kv' });
      const add = (k, v) => kv.append(h('dt', null, k), h('dd', { html: v == null || v === '' ? '—' : String(v) }));
      add('Molar mass', e.mass + ' g/mol');
      add('Group, period', (e.group ? 'Group ' + e.group : 'f-block') + ', period ' + e.period);
      add('Electron configuration', ELEMENTS.configString(e.Z));
      add('Valence electrons', e.valence ?? (e.cat === 'transition' ? 'varies' : null));
      add('Electronegativity', e.en);
      add('Atomic radius', e.radius ? e.radius + ' pm' : null);
      add('First ionization energy', e.ie ? e.ie + ' kJ/mol' : null);
      add('Electron affinity', e.ea != null ? (e.ea > 0 ? e.ea + ' kJ/mol released' : 'not stable (≤ 0)') : null);
      add('State at 25 °C', e.state);
      info.append(h('div', { class: 'pt-id' }, tile, h('div', { class: 'stack', style: { gap: '4px' } }, h('h3', null, e.name), h('span', { class: 'small muted' }, e.catName),
        h('div', { class: 'row' }, step(-1), step(1)))), kv);
    }
    select(selZ);
  }

  /* ---------- reference sheet (same content as the Reference Sheet topic) ---------- */
  function buildRef(view) {
    const box = h('div', { class: 'stack sp-ref' });
    view.append(box, pageLink('#reference', 'Open the reference sheet as a full page'));
    App.byId.reference.render(box, new U.Scope());
  }

  /* ---------- graphing calculator (works like the Desmos calculator in Bluebook) ---------- */
  function buildCalc(view) {
    const toggleWide = () => { const on = !body.classList.contains('sp-wide'); body.classList.toggle('sp-wide', on); U.store.set('sideWide', on); return on; };
    GraphCalc.create(view, { onExpand: toggleWide });
    view.appendChild(h('p', { class: 'small muted gc-note' }, 'Works like the Desmos graphing calculator in Bluebook, the one on the digital AP Chemistry exam. Type numbers and expressions, define variables (a = 2), graph y = …, and fit table data with ~, such as y₁ ~ mx₁ + b. For scientific notation type 6.022·10^23.'));
  }

  function pageLink(href, text) {
    const a = h('a', { href, class: 'small sp-link' }, text);
    a.addEventListener('click', () => { if (innerWidth < 1500) close(); });
    return a;
  }

  if (U.store.get('sideOpen', U.store.get('ptPanelOpen', false)) && innerWidth >= 1500) open();
  if (U.store.get('sideWide', false)) body.classList.add('sp-wide');
  window.SidePanel = { open, close };
})();
