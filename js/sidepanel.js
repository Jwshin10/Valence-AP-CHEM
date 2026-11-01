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

  /* ---------- calculator ---------- */
  function buildCalc(view) {
    let ans = U.store.get('calcAns', 0), sig = U.store.get('calcSig', 'auto'), caret = null;
    let hist = U.store.get('calcHist', []);
    if (!Array.isArray(hist)) hist = [];
    const touch = matchMedia('(hover: none)').matches;
    const input = h('input', { type: 'text', class: 'calc-input', placeholder: '0', autocomplete: 'off', spellcheck: 'false', autocapitalize: 'off', 'aria-label': 'Expression' });
    const out = h('div', { class: 'calc-out', 'aria-live': 'polite' });
    const screen = h('div', { class: 'calc-screen' }, input, out);
    const sigSeg = U.seg({ options: [{ value: 'auto', label: 'Auto' }, { value: 2, label: '2' }, { value: 3, label: '3' }, { value: 4, label: '4' }, { value: 5, label: '5' }], value: sig, onChange: v => { sig = v; U.store.set('calcSig', v); preview(); } });
    const keys = h('div', { class: 'calc-keys' });
    const KEYS = [
      ['log', 'log(', 'fn'], ['ln', 'ln(', 'fn'], ['10ˣ', '10^(', 'fn'], ['eˣ', 'exp(', 'fn'], ['√', 'sqrt(', 'fn'],
      ['x²', '^2', 'fn'], ['xʸ', '^', 'fn'], ['(', '(', 'fn'], [')', ')', 'fn'], ['÷', '/', 'op'],
      ['7', '7'], ['8', '8'], ['9', '9'], ['×', '*', 'op'], ['⌫', 'back', 'ctl', 'Delete'],
      ['4', '4'], ['5', '5'], ['6', '6'], ['−', '-', 'op'], ['AC', 'clear', 'ctl', 'Clear'],
      ['1', '1'], ['2', '2'], ['3', '3'], ['+', '+', 'op'], ['Ans', 'ans', 'ctl', 'Previous answer'],
      ['0', '0'], ['.', '.'], ['×10ⁿ', 'E', 'fn', 'Times ten to the power'], ['(−)', '-', 'fn', 'Negative'], ['=', 'eval', 'eq', 'Equals'],
    ];
    for (const [label, val, kind, aria] of KEYS) {
      const b = h('button', { type: 'button', class: 'calc-key' + (kind ? ' ' + kind : ''), 'aria-label': aria || label }, label);
      b.addEventListener('pointerdown', e => e.preventDefault()); // keep the caret where it was
      b.addEventListener('click', () => press(val));
      keys.appendChild(b);
    }
    const CONSTS = [
      ['N<sub>A</sub>', '6.022E23', 'Avogadro’s number, 6.022 × 10²³ mol⁻¹'], ['R', '8.314', 'Gas constant, 8.314 J/(mol·K)'], ['R', '0.08206', 'Gas constant, 0.08206 L·atm/(mol·K)'],
      ['h', '6.626E-34', 'Planck’s constant, 6.626 × 10⁻³⁴ J·s'], ['c', '2.998E8', 'Speed of light, 2.998 × 10⁸ m/s'], ['F', '96485', 'Faraday’s constant, 96,485 C/mol'], ['K<sub>w</sub>', '1.0E-14', 'Kw at 25 °C, 1.0 × 10⁻¹⁴'],
    ];
    const consts = h('div', { class: 'calc-consts' }, CONSTS.map(([l, v, t]) => {
      const b = h('button', { type: 'button', class: 'chip', title: t, 'aria-label': t, html: `<b>${l}</b> <span>${v.replace(/E(-?\d+)/, (m, p) => ' × 10' + U.supText(p))}</span>` });
      b.addEventListener('pointerdown', e => e.preventDefault());
      b.addEventListener('click', () => insert(v));
      return b;
    }));
    const mmBtn = U.btn('Molar mass', () => insert('mm()', -1), 'sm');
    mmBtn.addEventListener('pointerdown', e => e.preventDefault());
    const histBox = h('div', { class: 'calc-hist' });
    view.append(screen,
      h('div', { class: 'flex-between calc-bar' }, h('div', { class: 'field calc-sig' }, h('span', { class: 'lbl' }, 'Significant figures'), sigSeg.el), mmBtn),
      keys,
      h('div', { class: 'stack', style: { gap: '6px' } }, h('span', { class: 'lbl small' }, 'Constants'), consts),
      h('p', { class: 'small muted' }, 'Type with your keyboard or tap the keys. Write powers of ten with E (6.022E23). For molar mass, type mm(H2SO4) and use it in a calculation, such as 25/mm(NaCl).'),
      histBox);

    input.addEventListener('input', preview);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); run(); } });
    ['keyup', 'click', 'select', 'blur'].forEach(ev => input.addEventListener(ev, () => { caret = [input.selectionStart, input.selectionEnd]; }));

    function insert(txt, back = 0) {
      const v = input.value;
      const [a, b] = caret || [v.length, v.length];
      input.value = v.slice(0, a) + txt + v.slice(b);
      const p = a + txt.length + back;
      caret = [p, p];
      if (!touch) input.focus();
      try { input.setSelectionRange(p, p); } catch (e) { /* ignore */ }
      preview();
    }
    function press(v) {
      if (v === 'eval') return run();
      if (v === 'clear') { input.value = ''; caret = [0, 0]; out.textContent = ''; out.className = 'calc-out'; return; }
      if (v === 'back') {
        const [a, b] = caret || [input.value.length, input.value.length];
        if (a !== b) { input.value = input.value.slice(0, a) + input.value.slice(b); caret = [a, a]; }
        else if (a > 0) { input.value = input.value.slice(0, a - 1) + input.value.slice(a); caret = [a - 1, a - 1]; }
        if (!touch) { input.focus(); input.setSelectionRange(caret[0], caret[0]); }
        return preview();
      }
      if (v === 'ans' && !input.value.trim()) return insert('ans');
      insert(v);
    }
    function preview() {
      out.className = 'calc-out';
      const s = input.value.trim();
      if (!s) { out.textContent = ''; return; }
      try { out.innerHTML = '= ' + fmt(evaluate(s, ans), sig); out.classList.add('soft'); }
      catch (e) { out.textContent = ''; }
    }
    function run() {
      const s = input.value.trim();
      if (!s) return;
      try {
        const v = evaluate(s, ans);
        ans = v; U.store.set('calcAns', v);
        hist.unshift([s, v]); hist = hist.slice(0, 12); U.store.set('calcHist', hist);
        out.className = 'calc-out';
        out.innerHTML = '= ' + fmt(v, sig);
        input.value = ''; caret = [0, 0];
        input.placeholder = 'ans';
        drawHist();
      } catch (e) { out.className = 'calc-out bad'; out.textContent = e.message; }
    }
    function drawHist() {
      U.clear(histBox);
      if (!hist.length) return;
      const clr = h('button', { type: 'button', class: 'linkish small' }, 'Clear history');
      clr.addEventListener('click', () => { hist = []; U.store.set('calcHist', hist); drawHist(); });
      histBox.append(h('div', { class: 'flex-between' }, h('span', { class: 'lbl small' }, 'History'), clr),
        h('ol', null, hist.map(([s, v]) => {
          const b = h('button', { type: 'button', title: 'Use this answer' }, h('span', { class: 'e' }, s), h('span', { class: 'v', html: fmt(v, sig) }));
          b.addEventListener('pointerdown', e => e.preventDefault());
          b.addEventListener('click', () => insert(raw(v)));
          return h('li', null, b);
        })));
    }
    drawHist();
  }

  /* number shown on the calculator: scientific notation for very large or small values */
  function fmt(v, sig) {
    if (v === 0) return '0';
    const n = sig === 'auto' ? null : +sig;
    const a = Math.abs(v);
    if (a >= 1e6 || a < 1e-3) {
      let [m, e] = v.toExponential(n ? n - 1 : 6).split('e');
      if (!n) m = m.replace(/\.?0+$/, '');
      return `${m.replace('-', '−')} × 10<sup>${(+e).toString().replace('-', '−')}</sup>`;
    }
    const s = n ? v.toPrecision(n) : String(+v.toPrecision(10));
    if (/e/.test(s)) { const [m, e] = s.split('e'); return `${m.replace('-', '−')} × 10<sup>${(+e).toString().replace('-', '−')}</sup>`; }
    return s.replace('-', '−');
  }
  const raw = v => String(+v.toPrecision(10)).replace('e+', 'E').replace('e', 'E');

  /* safe expression evaluator: + − × ÷ ^, parentheses, log ln sqrt exp, pi e ans, mm(formula) */
  function evaluate(src, ansVal) {
    const s = src.replace(/[×·]/g, '*').replace(/÷/g, '/').replace(/[−–]/g, '-').replace(/π/g, 'pi').replace(/√/g, 'sqrt');
    const toks = [];
    let i = 0;
    while (i < s.length) {
      const ch = s[i];
      if (/\s/.test(ch)) { i++; continue; }
      const num = /^(\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(s.slice(i));
      if (num) {
        const after = s.slice(i + num[0].length);
        if (/^[eE]([+-]|$|[^a-zA-Z])/.test(after)) throw new Error('Finish the power of ten after E, for example 6.022E23.');
        toks.push({ t: 'n', v: parseFloat(num[0]) }); i += num[0].length; continue;
      }
      const id = /^[a-zA-Z]+/.exec(s.slice(i));
      if (id) {
        const w = id[0].toLowerCase();
        i += id[0].length;
        if (w === 'mm') {
          while (s[i] === ' ') i++;
          if (s[i] !== '(') throw new Error('Write a molar mass as mm(formula), for example mm(H2O).');
          let depth = 1, j = i + 1;
          while (j < s.length && depth) { if (s[j] === '(') depth++; else if (s[j] === ')') depth--; j++; }
          if (depth) throw new Error('Close the parenthesis after the formula in mm( ).');
          const f = s.slice(i + 1, j - 1).trim();
          toks.push({ t: 'n', v: molar(f) }); i = j; continue;
        }
        toks.push({ t: 'id', v: w }); continue;
      }
      if ('+-*/^()'.includes(ch)) { toks.push({ t: ch }); i++; continue; }
      throw new Error(`“${ch}” isn’t something the calculator understands.`);
    }
    let k = 0;
    const peek = () => toks[k], next = () => toks[k++];
    const FN = { log: Math.log10, ln: Math.log, sqrt: Math.sqrt, exp: Math.exp, abs: Math.abs };
    const CONST = { pi: Math.PI, e: Math.E, ans: ansVal };
    function expr() {
      let v = term();
      while (peek() && (peek().t === '+' || peek().t === '-')) v = next().t === '+' ? v + term() : v - term();
      return v;
    }
    function term() {
      let v = unary();
      for (;;) {
        const p = peek();
        if (p && (p.t === '*' || p.t === '/')) { next(); const r = unary(); v = p.t === '*' ? v * r : v / r; }
        else if (p && (p.t === '(' || p.t === 'id')) v *= unary(); // implicit: 2(3), 2pi, 3ans
        else return v;
      }
    }
    function unary() {
      const p = peek();
      if (p && p.t === '-') { next(); return -unary(); }
      if (p && p.t === '+') { next(); return unary(); }
      return power();
    }
    function power() {
      const b = primary();
      if (peek() && peek().t === '^') { next(); return Math.pow(b, unary()); }
      return b;
    }
    function primary() {
      const p = next();
      if (!p) throw new Error('The expression ends too early.');
      if (p.t === 'n') return p.v;
      if (p.t === '(') { const v = expr(); if (!peek() || peek().t !== ')') throw new Error('Close every “(” with a “)”.'); next(); return v; }
      if (p.t === 'id') {
        if (p.v in FN) {
          if (!peek() || peek().t !== '(') throw new Error(`Put the number after ${p.v} in parentheses, like ${p.v}(2).`);
          next(); const v = expr(); if (!peek() || peek().t !== ')') throw new Error('Close every “(” with a “)”.'); next(); return FN[p.v](v);
        }
        if (p.v in CONST) return CONST[p.v];
        throw new Error(`“${p.v}” isn’t a function or constant. Try log, ln, sqrt, exp, pi, e or ans.`);
      }
      throw new Error(`Something is missing before “${p.t}”.`);
    }
    if (!toks.length) throw new Error('Type an expression first.');
    const v = expr();
    if (k < toks.length) throw new Error(toks[k].t === ')' ? 'There is an extra “)”.' : 'Check the expression: something is out of place.');
    if (!isFinite(v)) throw new Error('No real answer (for example, dividing by zero or taking the log of a negative number).');
    return v;
  }
  function molar(f) {
    if (!f) throw new Error('Put a formula inside mm( ), for example mm(H2O).');
    let c;
    try { c = U.parseFormula(f); } catch (e) { throw new Error(`Couldn’t read “${f}” as a formula. ${e.message}`); }
    for (const el in c) if (!ELEMENTS.bySym[el]) throw new Error(`“${el}” isn’t an element symbol (capitalization matters).`);
    return U.molarMass(f);
  }

  function pageLink(href, text) {
    const a = h('a', { href, class: 'small sp-link' }, text);
    a.addEventListener('click', () => { if (innerWidth < 1500) close(); });
    return a;
  }

  if (U.store.get('sideOpen', U.store.get('ptPanelOpen', false)) && innerWidth >= 1500) open();
  window.SidePanel = { open, close, evaluate, fmt };
})();
