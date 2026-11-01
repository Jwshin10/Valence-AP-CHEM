/* Graphing calculator modeled on the Desmos graphing calculator built into Bluebook
   (the calculator on the digital AP Chemistry exam): an expression list, a graph,
   sliders, tables, regressions with ~, points of interest and the Desmos keypad.
   GraphCalc.create(el) builds one inside el. Dependency-free and works offline. */
'use strict';
const GraphCalc = (function () {
  const COLORS = ['#c74440', '#2d70b3', '#388c46', '#6042a6', '#fa7e19', '#000000'];
  const FUNCS = ['arcsin', 'arccos', 'arctan', 'nthroot', 'length', 'stdev', 'total', 'floor', 'round', 'sqrt', 'mean', 'ceil', 'sin', 'cos', 'tan', 'exp', 'abs', 'log', 'min', 'max', 'ln'];
  const CONSTS = { pi: Math.PI, e: Math.E, tau: 2 * Math.PI };
  class CalcError extends Error { constructor(msg, extra) { super(msg); Object.assign(this, extra || {}); } }
  const fail = (msg, extra) => { throw new CalcError(msg, extra); };

  /* ================= parsing ================= */
  function tokenize(src) {
    const s = src.replace(/[·×⋅]/g, '*').replace(/÷/g, '/').replace(/[−–]/g, '-').replace(/π/g, 'pi').replace(/τ/g, 'tau')
      .replace(/√/g, 'sqrt').replace(/²/g, '^2').replace(/³/g, '^3').replace(/≤/g, '<=').replace(/≥/g, '>=');
    const t = [];
    let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (/\s/.test(c)) { i++; continue; }
      const rest = s.slice(i);
      let m;
      if ((m = /^(\d+\.?\d*|\.\d+)/.exec(rest))) { t.push({ t: 'num', v: parseFloat(m[0]), raw: m[0] }); i += m[0].length; continue; }
      if (/[a-zA-Z]/.test(c)) {
        const f = FUNCS.find(n => rest.startsWith(n));
        if (f) {
          i += f.length;
          let base = null;
          if (f === 'log' && s[i] === '_') {
            const bm = /^_(\{([^}]*)\}|\d+\.?\d*|[a-zA-Z])/.exec(s.slice(i));
            if (bm) { base = bm[2] != null ? bm[2] : bm[1]; i += bm[0].length; }
          }
          t.push({ t: 'fn', v: f, base });
          continue;
        }
        const k = ['pi', 'tau'].find(n => rest.startsWith(n));
        if (k) { t.push({ t: 'id', v: k }); i += k.length; continue; }
        let name = c; i++;
        const sm = /^_(\{([a-zA-Z0-9]+)\}|\d+|[a-zA-Z]\d*)/.exec(s.slice(i));
        if (sm) { name += '_' + (sm[2] || sm[1]); i += sm[0].length; }
        t.push({ t: 'id', v: name });
        continue;
      }
      if (rest.startsWith('<=') || rest.startsWith('>=')) { t.push({ t: 'cmp' }); i += 2; continue; }
      if ('<>'.includes(c)) { t.push({ t: 'cmp' }); i++; continue; }
      if ('+-*/^(),|=~![]'.includes(c)) { t.push({ t: c }); i++; continue; }
      fail(`“${c}” isn’t something the calculator understands.`);
    }
    return t;
  }

  function parseExpr(toks) {
    let k = 0, absDepth = 0;
    const peek = () => toks[k], next = () => toks[k++];
    const starts = p => p && (p.t === 'num' || p.t === 'id' || p.t === 'fn' || p.t === '(' || p.t === '[' || (p.t === '|' && absDepth === 0));
    function expr() {
      let n = product();
      while (peek() && (peek().t === '+' || peek().t === '-')) { const op = next().t; n = { k: 'bin', op, a: n, b: product() }; }
      return n;
    }
    function product() {
      let n = unary();
      for (;;) {
        const p = peek();
        if (p && (p.t === '*' || p.t === '/')) { next(); n = { k: 'bin', op: p.t, a: n, b: unary() }; }
        else if (starts(p)) n = { k: 'bin', op: '*', imp: true, a: n, b: power() };
        else return n;
      }
    }
    function unary() {
      const p = peek();
      if (p && p.t === '-') { next(); return { k: 'neg', a: unary() }; }
      if (p && p.t === '+') { next(); return unary(); }
      return power();
    }
    function power() {
      const b = postfix();
      if (peek() && peek().t === '^') { next(); if (!peek()) fail('Add an exponent after “^”.'); return { k: 'pow', a: b, b: unary() }; }
      return b;
    }
    function postfix() {
      let n = primary();
      while (peek() && peek().t === '!') { next(); n = { k: 'fact', a: n }; }
      return n;
    }
    function group(close) {
      const saved = absDepth; absDepth = 0;
      const items = [];
      if (peek() && peek().t === close) { next(); absDepth = saved; return items; }
      for (;;) {
        items.push(expr());
        const p = next();
        if (!p) fail(close === ')' ? 'Close every “(” with a “)”.' : 'Close the list with “]”.');
        if (p.t === close) { absDepth = saved; return items; }
        if (p.t !== ',') fail(p.t === ')' || p.t === ']' ? `There is an extra “${p.t}”.` : 'Something is out of place here.');
      }
    }
    function primary() {
      const p = next();
      if (!p) fail('The expression ends too early.');
      if (p.t === 'num') return { k: 'num', v: p.v, raw: p.raw };
      if (p.t === 'id') {
        if (peek() && peek().t === '(') { next(); return { k: 'call', name: p.v, args: group(')') }; }
        return { k: 'var', name: p.v };
      }
      if (p.t === 'fn') {
        let args;
        if (peek() && peek().t === '(') { next(); args = group(')'); }
        else { if (!starts(peek())) fail(`Put something after ${p.v}, for example ${p.v}(2).`); args = [power()]; }
        return { k: 'fn', name: p.v, base: p.base, args };
      }
      if (p.t === '(') { const items = group(')'); if (!items.length) fail('The parentheses are empty.'); return items.length === 1 ? { k: 'paren', a: items[0] } : { k: 'tuple', items }; }
      if (p.t === '[') return { k: 'list', items: group(']') };
      if (p.t === '|') {
        absDepth++;
        const a = expr();
        if (!peek() || peek().t !== '|') fail('Close the absolute value with “|”.');
        next(); absDepth--;
        return { k: 'fn', name: 'abs', args: [a], bars: true };
      }
      if (p.t === ')' || p.t === ']') fail(`There is an extra “${p.t}”.`);
      fail(`Something is missing before “${p.t}”.`);
    }
    const n = expr();
    if (k < toks.length) { const p = toks[k]; fail(p.t === ')' || p.t === ']' ? `There is an extra “${p.t}”.` : p.t === '|' ? 'There is an extra “|”.' : 'Something is out of place here.'); }
    return n;
  }

  /** "lhs", "lhs = rhs" or "lhs ~ rhs" */
  function parseStatement(src) {
    const toks = tokenize(src);
    if (!toks.length) return { empty: true };
    let depth = 0, at = -1;
    toks.forEach((tk, i) => {
      if (tk.t === '(' || tk.t === '[') depth++;
      else if (tk.t === ')' || tk.t === ']') depth--;
      else if (depth === 0 && (tk.t === '=' || tk.t === '~' || tk.t === 'cmp')) {
        if (tk.t === 'cmp') fail('Inequalities aren’t supported in this calculator.');
        if (at >= 0) fail('Use only one “=” or “~” per line.');
        at = i;
      }
    });
    if (at < 0) return { rel: null, lhs: parseExpr(toks) };
    if (at === 0 || at === toks.length - 1) fail(`Put something on both sides of “${toks[at].t}”.`);
    return { rel: toks[at].t, lhs: parseExpr(toks.slice(0, at)), rhs: parseExpr(toks.slice(at + 1)) };
  }

  /* ================= evaluation ================= */
  const lift1 = (a, f) => Array.isArray(a) ? a.map(f) : f(a);
  const lift2 = (a, b, f) => {
    if (Array.isArray(a) && Array.isArray(b)) { const n = Math.min(a.length, b.length); const r = []; for (let i = 0; i < n; i++) r.push(f(a[i], b[i])); return r; }
    if (Array.isArray(a)) return a.map(x => f(x, b));
    if (Array.isArray(b)) return b.map(y => f(a, y));
    return f(a, b);
  };
  function gamma(z) { // Lanczos
    if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * gamma(1 - z));
    z -= 1;
    const g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    let x = c[0];
    for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
    const t = z + g + 0.5;
    return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
  }
  const fact = v => (Number.isInteger(v) && v >= 0 && v < 171) ? (() => { let r = 1; for (let i = 2; i <= v; i++) r *= i; return r; })() : gamma(v + 1);
  const LISTF = {
    mean: a => a.reduce((s, v) => s + v, 0) / a.length,
    total: a => a.reduce((s, v) => s + v, 0),
    length: a => a.length,
    stdev: a => { const m = LISTF.mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1)); },
    min: a => Math.min(...a), max: a => Math.max(...a),
  };
  const UNARY = {
    sqrt: Math.sqrt, ln: Math.log, exp: Math.exp, abs: Math.abs, sin: Math.sin, cos: Math.cos, tan: Math.tan,
    arcsin: Math.asin, arccos: Math.acos, arctan: Math.atan, floor: Math.floor, ceil: Math.ceil, round: Math.round,
  };

  /** evaluation context for one recompute of the whole expression list */
  function makeContext(defs) {
    const memo = new Map(), busy = new Set();
    const ctx = {
      lookup(name) {
        if (name in defs.cols) return defs.cols[name];
        if (memo.has(name)) return memo.get(name);
        const d = defs.vars[name] || defs.params[name];
        if (!d) fail(`“${name}” isn’t defined.`, { undef: name });
        if (busy.has(name)) fail(`“${name}” is defined in terms of itself.`);
        busy.add(name);
        try { const v = d.get(ctx); memo.set(name, v); return v; }
        finally { busy.delete(name); }
      },
      ev(n, L) {
        switch (n.k) {
          case 'num': return n.v;
          case 'paren': return ctx.ev(n.a, L);
          case 'var':
            if (L && n.name in L) return L[n.name];
            if (n.name in CONSTS && !defs.vars[n.name]) return CONSTS[n.name];
            if (n.name === 'x' || n.name === 'y') fail(`“${n.name}” isn’t defined here.`, { undef: n.name });
            return ctx.lookup(n.name);
          case 'neg': return lift1(ctx.ev(n.a, L), v => -v);
          case 'bin': {
            const a = ctx.ev(n.a, L), b = ctx.ev(n.b, L);
            return lift2(a, b, n.op === '+' ? (x, y) => x + y : n.op === '-' ? (x, y) => x - y : n.op === '*' ? (x, y) => x * y : (x, y) => x / y);
          }
          case 'pow': return lift2(ctx.ev(n.a, L), ctx.ev(n.b, L), Math.pow);
          case 'fact': return lift1(ctx.ev(n.a, L), fact);
          case 'fn': {
            const args = n.args.map(a => ctx.ev(a, L));
            if (n.name in LISTF) {
              const flat = args.length === 1 && Array.isArray(args[0]) ? args[0] : args.flat();
              if (!flat.length) fail(`${n.name} needs at least one number.`);
              return LISTF[n.name](flat.filter(v => !Number.isNaN(v)));
            }
            if (n.name === 'log') {
              if (args.length !== 1) fail('log takes one number.');
              if (n.base == null) return lift1(args[0], Math.log10);
              const b = /^[a-zA-Z]$/.test(n.base) ? ctx.ev({ k: 'var', name: n.base }, L) : parseFloat(n.base);
              return lift1(args[0], v => Math.log(v) / Math.log(b));
            }
            if (n.name === 'nthroot') {
              if (args.length !== 2) fail('nthroot takes two numbers: nthroot(8, 3).');
              return lift2(args[0], args[1], (v, r) => (v < 0 && Math.round(r) === r && r % 2) ? -Math.pow(-v, 1 / r) : Math.pow(v, 1 / r));
            }
            if (args.length !== 1) fail(`${n.name} takes one number.`);
            return lift1(args[0], UNARY[n.name]);
          }
          case 'call': {
            const f = defs.funcs[n.name];
            if (f) {
              if (n.args.length !== f.params.length) fail(`${n.name} takes ${f.params.length} input${f.params.length > 1 ? 's' : ''}.`);
              const local = Object.create(null);
              f.params.forEach((p, i) => { local[p] = ctx.ev(n.args[i], L); });
              if (busy.has('fn:' + n.name)) fail(`${n.name} is defined in terms of itself.`);
              busy.add('fn:' + n.name);
              try { return ctx.ev(f.body, local); } finally { busy.delete('fn:' + n.name); }
            }
            if (n.args.length !== 1) fail(`“${n.name}” isn’t a function.`);
            return lift2(ctx.ev({ k: 'var', name: n.name }, L), ctx.ev(n.args[0], L), (x, y) => x * y);
          }
          case 'list': return n.items.map(it => { const v = ctx.ev(it, L); if (Array.isArray(v)) fail('Lists can’t contain lists.'); return v; });
          case 'tuple': fail('Points can be plotted but not used in arithmetic.');
        }
        fail('Something is out of place here.');
      },
    };
    return ctx;
  }

  /** variable names used in a tree (calls to non-functions count as variables) */
  function names(n, out = new Set()) {
    if (!n) return out;
    if (n.k === 'var') out.add(n.name);
    if (n.k === 'call') out.add('call:' + n.name);
    if (n.k === 'fn' && n.base && /^[a-zA-Z]$/.test(n.base)) out.add(n.base);
    for (const key of ['a', 'b']) if (n[key]) names(n[key], out);
    for (const key of ['args', 'items']) if (n[key]) n[key].forEach(c => names(c, out));
    return out;
  }

  /* least squares fit of y ~ f(params) with Levenberg–Marquardt */
  function fit(resid, p0) {
    let p = p0.slice(), lambda = 1e-3;
    const sse = r => r.reduce((s, v) => s + v * v, 0);
    let r = resid(p), E = sse(r);
    if (!isFinite(E)) fail('The model can’t be evaluated at the starting values.');
    for (let it = 0; it < 200; it++) {
      const J = p.map((_, j) => { const h = 1e-6 * Math.max(1, Math.abs(p[j])); const q = p.slice(); q[j] += h; const rq = resid(q); return rq.map((v, i) => (v - r[i]) / h); });
      const n = p.length, A = [], g = [];
      for (let a = 0; a < n; a++) { A.push([]); g.push(-J[a].reduce((s, v, i) => s + v * r[i], 0)); for (let b = 0; b < n; b++) A[a].push(J[a].reduce((s, v, i) => s + v * J[b][i], 0)); }
      let improved = false;
      for (let tries = 0; tries < 12; tries++) {
        const M = A.map((row, a) => row.map((v, b) => v + (a === b ? lambda * (v || 1) : 0)));
        const d = solve(M, g);
        if (!d) { lambda *= 10; continue; }
        const q = p.map((v, j) => v + d[j]), rq = resid(q), Eq = sse(rq);
        if (isFinite(Eq) && Eq <= E) { const done = Math.abs(E - Eq) <= 1e-15 * (1 + E); p = q; r = rq; E = Eq; lambda = Math.max(lambda / 10, 1e-12); improved = true; if (done) it = 1e9; break; }
        lambda *= 10;
      }
      if (!improved) break;
    }
    return { p, sse: E };
  }
  function solve(A, b) {
    const n = b.length, M = A.map((r, i) => [...r, b[i]]);
    for (let c = 0; c < n; c++) {
      let piv = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
      if (Math.abs(M[piv][c]) < 1e-300) return null;
      [M[c], M[piv]] = [M[piv], M[c]];
      for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
    }
    return M.map((r, i) => r[n] / r[i]);
  }

  /* ================= formatting ================= */
  const sup = s => `<sup>${s}</sup>`;
  function fmtNum(v, digits = 12) {
    if (Array.isArray(v)) return '[' + v.slice(0, 12).map(x => fmtNum(x, 6)).join(', ') + (v.length > 12 ? ', …' : '') + ']';
    if (typeof v === 'boolean') return String(v);
    if (Number.isNaN(v)) return 'undefined';
    if (!isFinite(v)) return v > 0 ? '∞' : '−∞';
    if (v === 0) return '0';
    const a = Math.abs(v);
    if (a >= 1e12 || a < 1e-6) {
      let [m, e] = v.toExponential(digits - 1).split('e');
      m = m.includes('.') ? m.replace(/\.?0+$/, '') : m;
      return `${m.replace('-', '−')} × 10${sup((+e).toString().replace('-', '−'))}`;
    }
    let s = String(+v.toPrecision(digits));
    if (/e/.test(s)) { const [m, e] = s.split('e'); return `${m.replace('-', '−')} × 10${sup((+e).toString().replace('-', '−'))}`; }
    return s.replace('-', '−');
  }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function varHtml(name) {
    if (name === 'pi') return 'π';
    if (name === 'tau') return 'τ';
    const [b, s] = name.split('_');
    return `<i>${esc(b)}</i>${s ? `<sub>${esc(s)}</sub>` : ''}`;
  }
  const strip = n => (n && n.k === 'paren' ? n.a : n);
  function pretty(n) {
    switch (n.k) {
      case 'num': return esc(n.raw);
      case 'var': return varHtml(n.name);
      case 'paren': return `(${pretty(n.a)})`;
      case 'neg': return '−' + pretty(n.a);
      case 'bin':
        if (n.op === '/') return `<span class="gfrac"><span>${pretty(strip(n.a))}</span><span>${pretty(strip(n.b))}</span></span>`;
        if (n.op === '*') return n.imp ? pretty(n.a) + pretty(n.b) : `${pretty(n.a)}<span class="gop">·</span>${pretty(n.b)}`;
        return `${pretty(n.a)}<span class="gop">${n.op === '-' ? '−' : '+'}</span>${pretty(n.b)}`;
      case 'pow': return pretty(n.a) + sup(pretty(strip(n.b)));
      case 'fact': return pretty(n.a) + '!';
      case 'fn':
        if (n.name === 'sqrt' && n.args.length === 1) return `<span class="gsqrt">√<span>${pretty(strip(n.args[0]))}</span></span>`;
        if (n.name === 'abs' && n.args.length === 1) return `|${pretty(strip(n.args[0]))}|`;
        if (n.name === 'nthroot' && n.args.length === 2) return `<sup class="gidx">${pretty(n.args[1])}</sup><span class="gsqrt">√<span>${pretty(strip(n.args[0]))}</span></span>`;
        return `<span class="gfn">${n.name === 'log' && n.base != null ? 'log' + `<sub>${esc(n.base)}</sub>` : n.name}</span>(${n.args.map(pretty).join(', ')})`;
      case 'call': return `${varHtml(n.name)}(${n.args.map(pretty).join(', ')})`;
      case 'tuple': return `(${n.items.map(pretty).join(', ')})`;
      case 'list': return `[${n.items.map(pretty).join(', ')}]`;
    }
    return '';
  }
  const prettyStatement = st => st.rel ? `${pretty(st.lhs)}<span class="grel">${st.rel === '~' ? '~' : '='}</span>${pretty(st.rhs)}` : pretty(st.lhs);

  /* ================= analysis of the whole list ================= */
  const isVar = (n, name) => n && n.k === 'var' && (name == null || n.name === name);
  const RESERVED = new Set(['x', 'y', 'e', 'pi', 'tau']);

  function analyze(rows) {
    const defs = { vars: Object.create(null), funcs: Object.create(null), params: Object.create(null), cols: Object.create(null) };
    const out = new Map();
    let tableN = 0;
    // tables first: their columns are lists named x_n and y_n
    for (const r of rows) {
      if (r.type !== 'table') continue;
      tableN++;
      r.xName = 'x_' + tableN; r.yName = 'y_' + tableN;
      const num = s => { s = (s || '').trim(); if (!s) return NaN; const v = Number(s.replace(/[−–]/g, '-')); if (!Number.isNaN(v)) return v; try { const c = makeContext(defs); const st = parseStatement(s); return st.rel ? NaN : +c.ev(st.lhs); } catch (e) { return NaN; } };
      const xs = r.data.map(d => num(d[0])), ys = r.data.map(d => num(d[1]));
      defs.cols[r.xName] = xs; defs.cols[r.yName] = ys;
      out.set(r.id, { kind: 'table', xs, ys });
    }
    // parse expressions and collect definitions
    const parsed = [];
    for (const r of rows) {
      if (r.type !== 'expr') continue;
      let st;
      try { st = parseStatement(r.text); } catch (e) { out.set(r.id, { kind: 'error', msg: e.message }); continue; }
      if (st.empty) { out.set(r.id, { kind: 'empty' }); continue; }
      parsed.push({ r, st });
      if (st.rel === '=') {
        const L = st.lhs, R = st.rhs;
        const def = (side, other) => {
          if (isVar(side) && !RESERVED.has(side.name)) return { kind: 'var', name: side.name, body: other };
          if (side.k === 'call' && side.args.length && side.args.every(a => isVar(a)) && !RESERVED.has(side.name)) {
            const params = side.args.map(a => a.name);
            if (new Set(params).size === params.length) return { kind: 'fn', name: side.name, params, body: other };
          }
          return null;
        };
        const d = def(L, R);
        if (isVar(L) && RESERVED.has(L.name) && L.name !== 'x' && L.name !== 'y') { parsed[parsed.length - 1].preErr = `You can’t redefine ${L.name === 'pi' ? 'π' : L.name}.`; continue; }
        if (d) {
          const bucket = d.kind === 'var' ? defs.vars : defs.funcs;
          if (bucket[d.name] || (d.kind === 'var' ? defs.funcs[d.name] : defs.vars[d.name]) || defs.cols[d.name]) {
            const prev = bucket[d.name] || defs.vars[d.name] || defs.funcs[d.name];
            if (prev) prev.dup = true;
            d.dup = true;
          }
          d.row = r;
          if (d.kind === 'var') d.get = c => { if (d.dup) fail(`“${d.name}” is defined more than once.`); const v = c.ev(d.body); return v; };
          bucket[d.name] = d;
          parsed[parsed.length - 1].def = d;
        }
      }
    }
    // regressions: unknowns on the right side become parameters
    for (const p of parsed) {
      if (p.st.rel !== '~') continue;
      const used = [...names(p.st.rhs)].filter(n => !n.startsWith('call:') || !defs.funcs[n.slice(5)]).map(n => n.replace(/^call:/, ''));
      const unknown = [...new Set(used)].filter(n => !(n in defs.cols) && !defs.vars[n] && !RESERVED.has(n));
      if (!unknown.length) { p.regErr = 'Add at least one unknown to fit, such as m and b in y₁ ~ mx₁ + b.'; continue; }
      const reg = { names: unknown, result: null, err: null };
      p.reg = reg;
      reg.run = c => {
        if (reg.result || reg.err) { if (reg.err) fail(reg.err); return reg.result; }
        try {
          const Y = c.ev(p.st.lhs);
          if (!Array.isArray(Y)) fail('The left side of ~ should be a list, such as y₁ from a table.');
          const local = p0 => Object.fromEntries(unknown.map((n, i) => [n, p0[i]]));
          const evalAt = q => { const v = c.ev(p.st.rhs, local(q)); return Array.isArray(v) ? v : Y.map(() => v); };
          const first = evalAt(unknown.map(() => 1));
          const idx = Y.map((_, i) => i).filter(i => Number.isFinite(Y[i]) && Number.isFinite(first[i]));
          if (idx.length < unknown.length) fail(`Add at least ${unknown.length} data points to fit ${unknown.length} unknown${unknown.length > 1 ? 's' : ''}.`);
          const resid = q => { const f = evalAt(q); return idx.map(i => Y[i] - f[i]); };
          const { p: best, sse } = fit(resid, unknown.map(() => 1));
          const ys = idx.map(i => Y[i]), mean = ys.reduce((s, v) => s + v, 0) / ys.length;
          const sst = ys.reduce((s, v) => s + (v - mean) ** 2, 0);
          const R2 = sst > 0 ? 1 - sse / sst : 1;
          // linear in the parameters and a straight line in one column: report r as well
          const z = evalAt(unknown.map(() => 0)), e1 = evalAt(unknown.map((_, i) => (i === 0 ? 2 : 0))), e2 = evalAt(unknown.map((_, i) => (i === 0 ? 1 : 0)));
          const linearParams = idx.every(i => Math.abs(e1[i] - 2 * e2[i] + z[i]) < 1e-9 * (1 + Math.abs(e1[i])));
          const cols = [...names(p.st.rhs)].filter(n => n in defs.cols);
          let r = null;
          if (linearParams && unknown.length === 2 && cols.length === 1) {
            const X = defs.cols[cols[0]], xs = idx.map(i => X[i]);
            const mx = xs.reduce((s, v) => s + v, 0) / xs.length;
            const sxy = xs.reduce((s, v, j) => s + (v - mx) * (ys[j] - mean), 0), sxx = xs.reduce((s, v) => s + (v - mx) ** 2, 0);
            if (sxx > 0 && sst > 0) r = sxy / Math.sqrt(sxx * sst);
          }
          reg.result = { values: local(best), R2, r: r != null && Math.abs(r * r - R2) < 1e-6 ? r : null, cols };
          return reg.result;
        } catch (e) { reg.err = e.message; throw e; }
      };
      for (const n of unknown) if (!defs.params[n]) defs.params[n] = { get: c => reg.run(c).values[n] };
    }

    const ctx = makeContext(defs);
    // probe whether an expression depends on x
    const dependsOnX = node => {
      let used = false;
      const L = {}; Object.defineProperty(L, 'x', { get() { used = true; return 0.5; }, enumerable: true });
      try { ctx.ev(node, L); } catch (e) { if (e.undef && e.undef !== 'x') throw e; }
      return used;
    };
    const missing = e => e.undef && e.undef !== 'x' && e.undef !== 'y' ? [e.undef] : [];
    const curveOf = node => xv => { try { const v = ctx.ev(node, { x: xv }); return typeof v === 'number' ? v : NaN; } catch (e) { return NaN; } };

    for (const { r, st, def, reg, regErr, preErr } of parsed) {
      try {
        if (preErr) fail(preErr);
        if (st.rel === '~') {
          if (regErr) fail(regErr);
          const res = reg.run(ctx);
          const info = { kind: 'reg', res, names: reg.names };
          if (res.cols.length === 1) {
            const col = res.cols[0];
            info.curve = xv => { try { const v = ctx.ev(st.rhs, Object.assign({}, res.values, { [col]: xv })); return typeof v === 'number' ? v : NaN; } catch (e) { return NaN; } };
          }
          out.set(r.id, info);
          continue;
        }
        if (def && def.dup) fail(`“${def.name}” is defined more than once.`);
        if (def && def.kind === 'fn') {
          const info = { kind: 'fn' };
          if (def.params.length === 1 && def.params[0] === 'x') info.curve = xv => { try { const v = ctx.ev(def.body, { x: xv }); return typeof v === 'number' ? v : NaN; } catch (e) { return NaN; } };
          // check the body for undefined names
          const L = Object.fromEntries(def.params.map(p => [p, 0.5]));
          try { ctx.ev(def.body, L); } catch (e) { if (e.undef && !def.params.includes(e.undef)) throw e; if (!e.undef && !/undefined|isn’t defined/.test(e.message)) { /* runtime only */ } }
          out.set(r.id, info);
          continue;
        }
        if (def && def.kind === 'var') {
          if (dependsOnX(def.body)) fail(`${def.name} can’t depend on x. To graph it, write y = …`);
          const v = ctx.lookup(def.name);
          const lit = def.body.k === 'num' || (def.body.k === 'neg' && def.body.a.k === 'num');
          out.set(r.id, { kind: lit ? 'slider' : 'value', name: def.name, value: v });
          continue;
        }
        if (st.rel === '=') {
          const sides = [[st.lhs, st.rhs], [st.rhs, st.lhs]];
          let done = false;
          for (const [a, b] of sides) {
            if (isVar(a, 'y')) { const bn = names(b); if (bn.has('y')) fail('Only y = f(x) graphs are supported.'); dependsOnX(b); out.set(r.id, { kind: 'curve', curve: curveOf(b) }); done = true; break; }
            if (isVar(a, 'x')) { const bn = names(b); if (bn.has('x') || bn.has('y')) fail('Only x = a number makes a vertical line.'); const v = ctx.ev(b); if (Array.isArray(v)) fail('Use a single number for a vertical line.'); out.set(r.id, { kind: 'vline', x: v }); done = true; break; }
          }
          if (!done) {
            // an equation in x alone: Desmos draws a vertical line at each solution
            const all = new Set([...names(st.lhs), ...names(st.rhs)]);
            if (!all.has('y') && (dependsOnX(st.lhs) || dependsOnX(st.rhs))) {
              const fl = curveOf(st.lhs), fr = curveOf(st.rhs);
              out.set(r.id, { kind: 'xsolve', fn: xv => fl(xv) - fr(xv) });
              done = true;
            }
          }
          if (!done) fail('This equation isn’t a definition or a graph. Try y = …, a = …, or an equation in x.');
          continue;
        }
        // bare expression
        const n = st.lhs;
        if (n.k === 'tuple') {
          if (n.items.length !== 2) fail('Points need two coordinates: (x, y).');
          const xs = ctx.ev(n.items[0]), ys = ctx.ev(n.items[1]);
          const X = Array.isArray(xs) ? xs : null, Y = Array.isArray(ys) ? ys : null;
          const len = X && Y ? Math.min(X.length, Y.length) : X ? X.length : Y ? Y.length : 1;
          const pts = [];
          for (let i = 0; i < len; i++) pts.push([X ? X[i] : xs, Y ? Y[i] : ys]);
          out.set(r.id, { kind: 'points', pts });
          continue;
        }
        if (names(n).has('y')) fail('Only y = f(x) graphs are supported. Try writing y = … instead.');
        if (dependsOnX(n)) { out.set(r.id, { kind: 'curve', curve: curveOf(n) }); continue; }
        out.set(r.id, { kind: 'value', value: ctx.ev(n) });
      } catch (e) {
        out.set(r.id, { kind: 'error', msg: e.message, add: missing(e) });
      }
      const o = out.get(r.id);
      if (o) o.html = prettyStatement(st);
    }
    for (const { r, st } of parsed) { const o = out.get(r.id); if (o && !o.html) o.html = prettyStatement(st); }
    return out;
  }

  /* ================= user interface ================= */
  const SVG = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICONS = {
    plus: SVG('<path d="M12 5v14M5 12h14"/>'), minus: SVG('<path d="M5 12h14"/>'), home: SVG('<path d="M4 11l8-7 8 7M6 9.5V20h12V9.5"/>'),
    x: SVG('<path d="M6 6l12 12M18 6L6 18"/>'), keypad: SVG('<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h.01M18 14h.01M9 14h6"/>'),
    expand: SVG('<path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/>'), shrink: SVG('<path d="M20 10h-6V4M4 14h6v6M14 10l7-7M10 14l-7 7"/>'),
    warn: SVG('<path d="M12 3l9.5 17h-19z"/><path d="M12 10v4M12 17h.01"/>'),
  };

  function create(root, opts = {}) {
    const h = U.h;
    const saved = U.store.get('gcState', null);
    let nextId = 1, colorI = 0;
    const newColor = () => COLORS[colorI++ % COLORS.length];
    const mkExpr = (text = '') => ({ id: nextId++, type: 'expr', text, color: newColor(), hidden: false });
    const mkTable = () => ({ id: nextId++, type: 'table', color: newColor(), hidden: false, data: [['', ''], ['', ''], ['', '']] });
    let rows, view;
    if (saved && Array.isArray(saved.rows)) {
      rows = saved.rows.filter(r => r && (r.type === 'expr' || r.type === 'table'));
      rows.forEach(r => { r.id = nextId++; if (r.type === 'table' && !Array.isArray(r.data)) r.data = [['', '']]; });
      colorI = saved.colorI || rows.length;
      view = saved.view;
    }
    if (!rows || !rows.length) rows = [mkExpr()];
    if (!view || !isFinite(view.cx) || !(view.scale > 0)) view = null;
    let results = new Map(), selected = null, focusId = null, keypadOpen = U.store.get('gcKeypad', matchMedia('(hover: none)').matches);
    let lastInput = null, poi = [], poiTargets = [], hoverPt = null, pinned = null;

    /* ---------- layout ---------- */
    const el = h('div', { class: 'gc' });
    const graphWrap = h('div', { class: 'gc-graph' });
    const canvas = h('canvas', { class: 'gc-canvas', 'aria-label': 'Graph', role: 'img' });
    const zoomIn = h('button', { type: 'button', class: 'gc-zbtn', 'aria-label': 'Zoom in', html: ICONS.plus });
    const zoomOut = h('button', { type: 'button', class: 'gc-zbtn', 'aria-label': 'Zoom out', html: ICONS.minus });
    const zoomHome = h('button', { type: 'button', class: 'gc-zbtn', 'aria-label': 'Default viewport', html: ICONS.home });
    graphWrap.append(canvas, h('div', { class: 'gc-zoom' }, zoomIn, zoomOut, zoomHome));
    const addBtn = h('button', { type: 'button', class: 'gc-tool', 'aria-label': 'Add item', 'aria-haspopup': 'true', html: ICONS.plus });
    const addMenu = h('div', { class: 'gc-menu', hidden: true });
    const addExprBtn = h('button', { type: 'button' }, 'Expression');
    const addTableBtn = h('button', { type: 'button' }, 'Table');
    addMenu.append(addExprBtn, addTableBtn);
    const clearBtn = h('button', { type: 'button', class: 'gc-tool gc-clear' }, 'Clear all');
    const expandBtn = opts.onExpand ? h('button', { type: 'button', class: 'gc-tool', 'aria-label': 'Make the calculator wider', title: 'Make the calculator wider', html: ICONS.expand }) : null;
    const list = h('div', { class: 'gc-list', role: 'list' });
    const keypadBtn = h('button', { type: 'button', class: 'gc-tool gc-kbtn', 'aria-label': 'Show keypad', 'aria-pressed': String(keypadOpen), html: ICONS.keypad });
    const keypad = h('div', { class: 'gc-keypad', hidden: !keypadOpen });
    const exprPane = h('div', { class: 'gc-exprs' },
      h('div', { class: 'gc-toolbar' }, h('div', { class: 'gc-add' }, addBtn, addMenu), h('div', { class: 'gc-toolbar-r' }, clearBtn, expandBtn)),
      list, h('div', { class: 'gc-foot' }, keypadBtn));
    el.append(exprPane, graphWrap, keypad);
    root.appendChild(el);

    addBtn.addEventListener('click', () => { addMenu.hidden = !addMenu.hidden; });
    document.addEventListener('pointerdown', e => { if (!addMenu.hidden && !addMenu.contains(e.target) && e.target !== addBtn && !addBtn.contains(e.target)) addMenu.hidden = true; });
    addExprBtn.addEventListener('click', () => { addMenu.hidden = true; insertRow(mkExpr(), rows.length - (isBlank(rows[rows.length - 1]) ? 1 : 0), true); });
    addTableBtn.addEventListener('click', () => { addMenu.hidden = true; insertRow(mkTable(), rows.length - (isBlank(rows[rows.length - 1]) ? 1 : 0), true); });
    let clearArm = 0;
    clearBtn.addEventListener('click', () => {
      if (!clearArm) { clearArm = setTimeout(() => { clearArm = 0; clearBtn.textContent = 'Clear all'; }, 3000); clearBtn.textContent = 'Click again to clear'; return; }
      clearTimeout(clearArm); clearArm = 0; clearBtn.textContent = 'Clear all';
      colorI = 0; rows = [mkExpr()]; selected = null; pinned = null; renderList(); recompute(); focusRow(rows[0].id);
    });
    if (expandBtn) expandBtn.addEventListener('click', () => { const wide = opts.onExpand(); expandBtn.innerHTML = wide ? ICONS.shrink : ICONS.expand; expandBtn.setAttribute('aria-label', wide ? 'Make the calculator narrower' : 'Make the calculator wider'); expandBtn.title = expandBtn.getAttribute('aria-label'); });
    keypadBtn.addEventListener('click', () => setKeypad(!keypadOpen));
    function setKeypad(on) {
      keypadOpen = on; U.store.set('gcKeypad', on);
      keypad.hidden = !on; keypadBtn.setAttribute('aria-pressed', String(on));
      el.querySelectorAll('input.gc-in, input.gc-cell').forEach(i => { i.inputMode = on ? 'none' : 'text'; });
    }

    /* ---------- expression list ---------- */
    const isBlank = r => r && r.type === 'expr' && !r.text.trim();
    const dom = new Map();
    function insertRow(r, at, focus) { rows.splice(at, 0, r); renderList(); recompute(); if (focus) focusRow(r.id); }
    function removeRow(id, focusPrev) {
      const i = rows.findIndex(r => r.id === id);
      if (i < 0) return;
      rows.splice(i, 1);
      if (!rows.length) rows.push(mkExpr());
      if (selected === id) selected = null;
      renderList(); recompute();
      if (focusPrev) focusRow(rows[Math.max(0, i - 1)].id, true);
    }
    function ensureTrailingBlank() { if (!isBlank(rows[rows.length - 1])) { rows.push(mkExpr()); return true; } return false; }
    function focusRow(id, atEnd) {
      const d = dom.get(id);
      if (!d) return;
      const inp = d.input || (d.cells && d.cells[0] && d.cells[0][0]);
      if (!inp) return;
      inp.focus();
      if (atEnd && inp.setSelectionRange) { const n = inp.value.length; inp.setSelectionRange(n, n); }
    }
    function renderList() {
      ensureTrailingBlank();
      U.clear(list); dom.clear();
      rows.forEach((r, i) => {
        const d = r.type === 'table' ? tableRow(r) : exprRow(r);
        d.num.textContent = i + 1;
        dom.set(r.id, d); list.appendChild(d.el);
      });
      save();
    }
    function iconButton(r) {
      const b = h('button', { type: 'button', class: 'gc-icon', 'aria-label': 'Show or hide on the graph', style: { color: r.color } });
      b.addEventListener('click', () => { r.hidden = !r.hidden; updateRows(); draw(); save(); });
      return b;
    }
    function exprRow(r) {
      const num = h('span', { class: 'gc-num' });
      const icon = iconButton(r);
      const input = h('input', { type: 'text', class: 'gc-in', value: r.text, spellcheck: 'false', autocomplete: 'off', autocapitalize: 'off', 'aria-label': 'Expression' });
      input.inputMode = keypadOpen ? 'none' : 'text';
      const show = h('div', { class: 'gc-show', tabindex: '-1' });
      const sub = h('div', { class: 'gc-sub' });
      const del = h('button', { type: 'button', class: 'gc-del', 'aria-label': 'Delete expression', html: ICONS.x });
      const rowEl = h('div', { class: 'gc-row', role: 'listitem' }, h('div', { class: 'gc-gut' }, num, icon), h('div', { class: 'gc-main' }, input, show, sub), del);
      show.addEventListener('mousedown', e => { e.preventDefault(); input.focus(); });
      show.addEventListener('click', () => input.focus());
      input.addEventListener('focus', () => { focusId = r.id; lastInput = input; selected = r.id; rowEl.classList.add('focus'); draw(); });
      input.addEventListener('blur', () => { rowEl.classList.remove('focus'); if (focusId === r.id) focusId = null; });
      input.addEventListener('input', () => {
        r.text = input.value;
        const wasLast = rows[rows.length - 1] === r;
        recompute();
        if (wasLast && r.text.trim()) { rows.push(mkExpr()); const d = exprRow(rows[rows.length - 1]); d.num.textContent = rows.length; dom.set(rows[rows.length - 1].id, d); list.appendChild(d.el); }
        save();
      });
      input.addEventListener('keydown', e => {
        const i = rows.indexOf(r);
        if (e.key === 'Enter') { e.preventDefault(); const nx = rows[i + 1]; if (nx && isBlank(nx)) focusRow(nx.id); else insertRow(mkExpr(), i + 1, true); }
        else if (e.key === 'Backspace' && !input.value && rows.length > 1) { e.preventDefault(); removeRow(r.id, true); }
        else if (e.key === 'ArrowUp' && i > 0) { e.preventDefault(); focusRow(rows[i - 1].id, true); }
        else if (e.key === 'ArrowDown' && i < rows.length - 1) { e.preventDefault(); focusRow(rows[i + 1].id, true); }
      });
      del.addEventListener('click', () => removeRow(r.id));
      return { el: rowEl, num, icon, input, show, sub, row: r };
    }
    function tableRow(r) {
      const num = h('span', { class: 'gc-num' });
      const icon = iconButton(r);
      const del = h('button', { type: 'button', class: 'gc-del', 'aria-label': 'Delete table', html: ICONS.x });
      const head = h('div', { class: 'gc-thead' }, h('span', { class: 'gc-th' }), h('span', { class: 'gc-th' }));
      const grid = h('div', { class: 'gc-tbody' });
      const sub = h('div', { class: 'gc-sub' });
      const rowEl = h('div', { class: 'gc-row gc-table', role: 'listitem' }, h('div', { class: 'gc-gut' }, num, icon), h('div', { class: 'gc-main' }, h('div', { class: 'gc-tbl' }, head, grid), sub), del);
      const d = { el: rowEl, num, icon, head, grid, sub, row: r, cells: [] };
      const build = () => {
        U.clear(grid); d.cells = [];
        r.data.forEach((pair, ri) => {
          const cs = pair.map((v, ci) => {
            const c = h('input', { type: 'text', class: 'gc-cell', value: v, spellcheck: 'false', autocomplete: 'off', 'aria-label': (ci ? 'y' : 'x') + ' value, row ' + (ri + 1) });
            c.inputMode = keypadOpen ? 'none' : 'decimal';
            c.addEventListener('focus', () => { lastInput = c; selected = r.id; focusId = r.id; });
            c.addEventListener('input', () => {
              r.data[ri][ci] = c.value;
              if (ri === r.data.length - 1 && c.value.trim()) { r.data.push(['', '']); build(); d.cells[ri][ci].focus(); const n = c.value.length; d.cells[ri][ci].setSelectionRange(n, n); }
              recompute(); save();
            });
            c.addEventListener('keydown', e => {
              const go = (rr, cc) => { const t = d.cells[rr] && d.cells[rr][cc]; if (t) { e.preventDefault(); t.focus(); } };
              if (e.key === 'Enter' || e.key === 'ArrowDown') go(ri + 1, ci);
              else if (e.key === 'ArrowUp') go(ri - 1, ci);
              else if (e.key === 'ArrowRight' && c.selectionStart === c.value.length) go(ri, ci + 1);
              else if (e.key === 'ArrowLeft' && c.selectionStart === 0) go(ri, ci - 1);
            });
            grid.appendChild(c);
            return c;
          });
          d.cells.push(cs);
        });
      };
      build();
      del.addEventListener('click', () => removeRow(r.id));
      return d;
    }
    function updateRows(skipId) {
      rows.forEach((r, i) => {
        const d = dom.get(r.id);
        if (!d) return;
        d.num.textContent = i + 1;
        const res = results.get(r.id) || { kind: 'empty' };
        const plots = res.curve || res.kind === 'curve' || res.kind === 'xsolve' || res.kind === 'vline' || res.kind === 'points' || res.kind === 'table';
        d.icon.className = 'gc-icon' + (res.kind === 'error' ? ' err' : plots ? (r.hidden ? ' off' : ' on') : '') + (r.type === 'table' ? ' pts' : '');
        d.icon.innerHTML = res.kind === 'error' ? ICONS.warn : '';
        d.icon.title = res.kind === 'error' ? res.msg : plots ? (r.hidden ? 'Show on graph' : 'Hide from graph') : '';
        d.icon.disabled = !plots;
        if (r.type === 'table') {
          U.clear(d.sub);
          d.head.children[0].innerHTML = varHtml(r.xName); d.head.children[1].innerHTML = varHtml(r.yName);
          return;
        }
        d.show.innerHTML = res.html || esc(r.text);
        d.el.classList.toggle('blank', !r.text.trim());
        if (r.id === skipId) return;
        U.clear(d.sub); d.sub.className = 'gc-sub'; d.solHtml = null;
        if (res.kind === 'value') d.sub.append(h('div', { class: 'gc-val', html: '= ' + fmtNum(res.value) }));
        else if (res.kind === 'slider') d.sub.appendChild(slider(r, res));
        else if (res.kind === 'reg') {
          const box = h('div', { class: 'gc-reg' });
          box.appendChild(h('div', { class: 'gc-reg-h' }, 'Parameters'));
          for (const n of res.names) box.appendChild(h('div', { class: 'gc-reg-p', html: `${varHtml(n)} = ${fmtNum(res.res.values[n], 6)}` }));
          if (res.res.r != null) { box.appendChild(h('div', { class: 'gc-reg-h' }, 'Statistics')); box.appendChild(h('div', { class: 'gc-reg-p', html: `<i>r</i>${sup(2)} = ${fmtNum(res.res.R2, 6)}` })); box.appendChild(h('div', { class: 'gc-reg-p', html: `<i>r</i> = ${fmtNum(res.res.r, 6)}` })); }
          else { box.appendChild(h('div', { class: 'gc-reg-h' }, 'Statistics')); box.appendChild(h('div', { class: 'gc-reg-p', html: `<i>R</i>${sup(2)} = ${fmtNum(res.res.R2, 6)}` })); }
          d.sub.appendChild(box);
        } else if (res.kind === 'error') {
          d.sub.className = 'gc-sub gc-err';
          d.sub.append(h('span', null, res.msg));
          if (res.add && res.add.length) {
            const b = h('button', { type: 'button', class: 'gc-addslider' }, 'add slider: ', h('span', { html: res.add.map(varHtml).join(', ') }));
            b.addEventListener('click', () => { const at = rows.indexOf(r); res.add.forEach((n, k) => rows.splice(at + k, 0, mkExpr(`${n}=1`))); renderList(); recompute(); });
            d.sub.appendChild(b);
          }
        }
      });
    }
    function slider(r, res) {
      r.slider = r.slider || {};
      const v = res.value;
      let { min, max } = r.slider;
      if (!(min < max)) { min = -10; max = 10; }
      if (v < min) min = -Math.pow(10, Math.ceil(Math.log10(Math.abs(v) + 1e-12)));
      if (v > max) max = Math.pow(10, Math.ceil(Math.log10(Math.abs(v) + 1e-12)));
      r.slider.min = min; r.slider.max = max;
      const range = h('input', { type: 'range', min, max, step: 'any', value: v, 'aria-label': `${res.name} slider` });
      const lo = h('input', { type: 'text', class: 'gc-lim', value: fmtPlain(min), 'aria-label': 'Slider minimum' });
      const hi = h('input', { type: 'text', class: 'gc-lim', value: fmtPlain(max), 'aria-label': 'Slider maximum' });
      range.addEventListener('input', () => {
        const step = (r.slider.max - r.slider.min) / 200, dec = Math.max(0, -Math.floor(Math.log10(step)));
        const val = (+(+range.value).toFixed(dec)).toString();
        r.text = `${res.name}=${val}`;
        const d = dom.get(r.id); if (d) d.input.value = r.text;
        recompute(true); save();
      });
      const lim = (inp, key) => inp.addEventListener('change', () => { const x = Number(inp.value); if (Number.isFinite(x)) { r.slider[key] = x; if (r.slider.min >= r.slider.max) r.slider[key === 'min' ? 'max' : 'min'] = x + (key === 'min' ? 1 : -1); } recompute(); save(); });
      lim(lo, 'min'); lim(hi, 'max');
      return h('div', { class: 'gc-slider' }, lo, range, hi);
    }
    const fmtPlain = v => String(+v.toPrecision(6));

    let rafSkip = false;
    function recompute(fromSlider) {
      results = analyze(rows);
      // while a slider is being dragged, leave its own row alone so the drag isn't interrupted
      const act = document.activeElement;
      const skip = fromSlider ? rows.find(r => { const d = dom.get(r.id); return d && d.sub.contains(act); }) : null;
      updateRows(skip && skip.id);
      if (!rafSkip) { rafSkip = true; requestAnimationFrame(() => { rafSkip = false; draw(); }); }
    }

    /* ---------- keypad (layout follows the Desmos keypad) ---------- */
    const KP_MAIN = [
      [['x', 'x', 'v'], ['y', 'y', 'v'], ['a²', '^2'], ['a<sup>b</sup>', '^'], ['7', '7', 'n'], ['8', '8', 'n'], ['9', '9', 'n'], ['÷', '/'], ['<span class="k-long">functions</span><span class="k-short">func</span>', 'page', 'fnk']],
      [['(', '('], [')', ')'], ['~', '~'], [',', ','], ['4', '4', 'n'], ['5', '5', 'n'], ['6', '6', 'n'], ['×', '*'], [['←', 'left'], ['→', 'right']]],
      [['|a|', 'abs('], ['ln', 'ln('], ['log', 'log('], ['√', 'sqrt('], ['1', '1', 'n'], ['2', '2', 'n'], ['3', '3', 'n'], ['−', '-'], ['⌫', 'back']],
      [['π', 'pi'], ['e', 'e'], ['e<sup>x</sup>', 'e^'], ['10<sup>x</sup>', '10^'], ['0', '0', 'n'], ['.', '.', 'n'], ['=', '='], ['+', '+'], ['↵', 'enter', 'go']],
    ];
    const KP_FN = [
      [['ln', 'ln('], ['log', 'log('], ['log<sub>a</sub>', 'log_'], ['√', 'sqrt('], ['<sup>n</sup>√', 'nthroot('], ['|a|', 'abs('], ['e<sup>x</sup>', 'e^'], ['10<sup>x</sup>', '10^'], ['123', 'page', 'fnk']],
      [['sin', 'sin('], ['cos', 'cos('], ['tan', 'tan('], ['x!', '!'], ['mean', 'mean('], ['stdev', 'stdev('], ['total', 'total('], ['length', 'length('], [['←', 'left'], ['→', 'right']]],
      [['x<sub>1</sub>', 'x_1', 'v'], ['y<sub>1</sub>', 'y_1', 'v'], ['a<sub>b</sub>', '_'], ['~', '~'], ['[', '['], [']', ']'], [',', ','], ['round', 'round('], ['⌫', 'back']],
      [['min', 'min('], ['max', 'max('], ['floor', 'floor('], ['ceil', 'ceil('], ['arcsin', 'arcsin('], ['arccos', 'arccos('], ['arctan', 'arctan('], ['=', '='], ['↵', 'enter', 'go']],
    ];
    let kpPage = 0;
    const kpLabel = (label, val) => val === 'page' ? (kpPage ? 'Numbers' : 'Functions') : val === 'back' ? 'Backspace' : val === 'enter' ? 'Enter' : val === 'left' ? 'Move left' : val === 'right' ? 'Move right' : label.replace(/<[^>]+>/g, '');
    function kpButton([label, val, cls]) {
      const b = h('button', { type: 'button', class: 'gc-key' + (cls ? ' k-' + cls : '') + (val.length > 3 && /\($/.test(val) ? ' k-word' : ''), html: label, 'aria-label': kpLabel(label, val) });
      b.addEventListener('pointerdown', e => e.preventDefault());
      b.addEventListener('click', () => key(val));
      return b;
    }
    function drawKeypad() {
      U.clear(keypad);
      const grid = h('div', { class: 'gc-kp' });
      for (const row of (kpPage ? KP_FN : KP_MAIN)) {
        row.forEach((cell, i) => {
          const node = Array.isArray(cell[0]) ? h('div', { class: 'gc-key-pair' }, cell.map(kpButton)) : kpButton(cell);
          if (i === 4 || i === 8) node.classList.add('k-gap');
          grid.appendChild(node);
        });
      }
      keypad.appendChild(grid);
    }
    function target() {
      if (lastInput && lastInput.isConnected) return lastInput;
      const blank = rows[rows.length - 1];
      const d = dom.get(blank.id);
      return d && d.input;
    }
    function key(val) {
      if (val === 'page') { kpPage = 1 - kpPage; drawKeypad(); return; }
      const inp = target();
      if (!inp) return;
      if (document.activeElement !== inp) inp.focus();
      const a = inp.selectionStart ?? inp.value.length, b = inp.selectionEnd ?? a;
      const set = (v, caret) => { inp.value = v; inp.setSelectionRange(caret, caret); inp.dispatchEvent(new Event('input', { bubbles: true })); };
      if (val === 'left') { const p = Math.max(0, a - 1); inp.setSelectionRange(p, p); return; }
      if (val === 'right') { const p = Math.min(inp.value.length, b + 1); inp.setSelectionRange(p, p); return; }
      if (val === 'back') {
        if (a !== b) return set(inp.value.slice(0, a) + inp.value.slice(b), a);
        if (a > 0) return set(inp.value.slice(0, a - 1) + inp.value.slice(a), a - 1);
        if (inp.classList.contains('gc-in')) inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));
        return;
      }
      if (val === 'enter') { inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return; }
      let txt = val;
      // functions close their parenthesis like Desmos does
      if (/\($/.test(txt) && !inp.classList.contains('gc-cell')) { set(inp.value.slice(0, a) + txt + ')' + inp.value.slice(b), a + txt.length); return; }
      set(inp.value.slice(0, a) + txt + inp.value.slice(b), a + txt.length);
    }
    drawKeypad();

    /* ---------- graph ---------- */
    const g = canvas.getContext('2d');
    let W = 0, H = 0;
    const defaultView = () => ({ cx: 0, cy: 0, scale: Math.max(10, Math.min(W, H) / 24) });
    const sx = x => W / 2 + (x - view.cx) * view.scale, sy = y => H / 2 - (y - view.cy) * view.scale;
    const ux = px => view.cx + (px - W / 2) / view.scale, uy = py => view.cy - (py - H / 2) / view.scale;
    function resize() {
      const r = graphWrap.getBoundingClientRect();
      W = Math.max(50, Math.round(r.width)); H = Math.max(50, Math.round(r.height));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!view) view = defaultView();
      draw();
    }
    const ro = new ResizeObserver(resize);
    ro.observe(graphWrap);
    const live = { draw: () => draw() };
    U.liveCanvases.add(live);

    function niceStep(px) {
      const raw = px / view.scale, p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p;
      const k = m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10;
      return { step: k * p, minor: (k === 2 ? 4 : 5) };
    }
    const cssVar = (n, d) => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || d;
    function plotColor(c) { return c === '#000000' ? cssVar('--ink', '#1b2434') : c; }
    function axisLabel(v, step) {
      if (Math.abs(v) < step / 1e6) return '0';
      const a = Math.abs(step);
      if (a >= 1e5 || a < 1e-4) { const [m, e] = v.toExponential(3).split('e'); return `${+m}e${+e}`; }
      const dec = Math.max(0, -Math.floor(Math.log10(a) + 1e-9));
      return (+v.toFixed(dec)).toString().replace('-', '−');
    }
    function draw() {
      if (!W || !view) return;
      poiTargets = [];
      const bg = cssVar('--paper-2', '#fff'), ink = cssVar('--ink', '#000'), ink2 = cssVar('--ink-2', '#555'), ink3 = cssVar('--ink-3', '#888'), rule = cssVar('--rule', '#ddd');
      g.fillStyle = bg; g.fillRect(0, 0, W, H);
      const { step, minor } = niceStep(110);
      const x0 = ux(0), x1 = ux(W), y0 = uy(H), y1 = uy(0);
      // grid
      const lines = (s, color, width) => {
        g.strokeStyle = color; g.lineWidth = width; g.beginPath();
        for (let x = Math.ceil(x0 / s) * s; x <= x1; x += s) { const p = Math.round(sx(x)) + 0.5; g.moveTo(p, 0); g.lineTo(p, H); }
        for (let y = Math.ceil(y0 / s) * s; y <= y1; y += s) { const p = Math.round(sy(y)) + 0.5; g.moveTo(0, p); g.lineTo(W, p); }
        g.stroke();
      };
      g.globalAlpha = 0.45; lines(step / minor, rule, 1); g.globalAlpha = 1;
      lines(step, rule, 1);
      // axes
      g.strokeStyle = ink2; g.lineWidth = 1.5; g.beginPath();
      const ax = sx(0), ay = sy(0);
      if (ax >= 0 && ax <= W) { g.moveTo(ax, 0); g.lineTo(ax, H); }
      if (ay >= 0 && ay <= H) { g.moveTo(0, ay); g.lineTo(W, ay); }
      g.stroke();
      // tick labels, pinned to the edges when an axis is off screen
      g.font = `500 12px ${U.FONT}`; g.fillStyle = ink2;
      const lx = U.clamp(ay + 4, 4, H - 16), labelHalo = t => { g.save(); g.strokeStyle = bg; g.lineWidth = 3; g.strokeText(t.s, t.x, t.y); g.restore(); g.fillText(t.s, t.x, t.y); };
      g.textBaseline = 'top'; g.textAlign = 'center';
      for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) { if (Math.abs(x) < step / 2) continue; labelHalo({ s: axisLabel(x, step), x: sx(x), y: lx }); }
      g.textBaseline = 'middle';
      const yLabelX = ax + 6;
      for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) {
        if (Math.abs(y) < step / 2) continue;
        const s = axisLabel(y, step), tw = g.measureText(s).width;
        let px = ax - 6 - tw;
        if (px < 4) px = Math.max(4, yLabelX); if (px + tw > W - 4) px = W - 4 - tw;
        g.textAlign = 'left'; labelHalo({ s, x: px, y: sy(y) });
      }
      if (ax >= 0 && ax <= W && ay >= 0 && ay <= H) { g.textAlign = 'right'; g.textBaseline = 'top'; labelHalo({ s: '0', x: ax - 5, y: ay + 4 }); }

      // curves, lines and points
      poi = [];
      const curves = [];
      for (const r of rows) {
        if (r.hidden) continue;
        const res = results.get(r.id);
        if (!res) continue;
        const col = plotColor(r.color), sel = selected === r.id;
        const f = res.curve;
        if (f) { plotCurve(f, col, sel ? 3.2 : 2.5); curves.push({ f, r, col }); }
        if (res.kind === 'vline' && isFinite(res.x)) { g.strokeStyle = col; g.lineWidth = sel ? 3.2 : 2.5; g.beginPath(); g.moveTo(sx(res.x), 0); g.lineTo(sx(res.x), H); g.stroke(); }
        if (res.kind === 'xsolve') {
          const sols = solveVisible(res.fn);
          g.strokeStyle = col; g.lineWidth = sel ? 3.2 : 2.5; g.beginPath();
          for (const x of sols) { g.moveTo(sx(x), 0); g.lineTo(sx(x), H); }
          g.stroke();
          showSolutions(r, sols);
        }
        if (res.kind === 'points') res.pts.forEach(([x, y]) => dot(x, y, col, r));
        if (res.kind === 'table') res.xs.forEach((x, i) => dot(x, res.ys[i], col, r));
      }
      // points of interest for the selected curve: intercepts, extrema and intersections
      const selCurve = curves.find(c => c.r.id === selected);
      if (selCurve) findPOI(selCurve, curves);
      g.fillStyle = cssVar('--ink-3', '#888');
      for (const p of poi) { g.beginPath(); g.arc(sx(p.x), sy(p.y), 4.5, 0, 7); g.fillStyle = ink3; g.fill(); g.strokeStyle = bg; g.lineWidth = 1.5; g.stroke(); }
      const show = hoverPt || pinned;
      if (show) {
        const X = sx(show.x), Y = sy(show.y);
        g.beginPath(); g.arc(X, Y, 6, 0, 7); g.fillStyle = show.col || ink; g.fill(); g.strokeStyle = bg; g.lineWidth = 2; g.stroke();
        const label = `(${fmtShort(show.x)}, ${fmtShort(show.y)})`;
        g.font = `600 13px ${U.FONT}`;
        const tw = g.measureText(label).width + 14;
        let bx = X + 10, by = Y - 32;
        if (bx + tw > W - 4) bx = X - 10 - tw;
        if (by < 4) by = Y + 10;
        g.fillStyle = bg; g.strokeStyle = rule; g.lineWidth = 1;
        g.beginPath(); g.roundRect ? g.roundRect(bx, by, tw, 24, 5) : g.rect(bx, by, tw, 24); g.fill(); g.stroke();
        g.fillStyle = ink; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(label, bx + 7, by + 12);
      }
      function dot(x, y, col, r) {
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        g.beginPath(); g.arc(sx(x), sy(y), selected === r.id ? 5.5 : 4.5, 0, 7); g.fillStyle = col; g.fill();
        poiTargets.push({ x, y, col, kind: 'pt' });
      }
    }
    /* roots of fn in [x0, x1]: sign changes, plus pairs of roots hidden between two samples
       (found where the function turns back toward zero without crossing at the samples) */
    function rootsIn(fn, x0, x1, n) {
      const dx = (x1 - x0) / n, xs = [], vs = [], out = [];
      for (let i = 0; i <= n; i++) { const x = x0 + i * dx; xs.push(x); vs.push(fn(x)); }
      const bisect = (a, b) => {
        let fa = fn(a);
        for (let k = 0; k < 90; k++) { const m = (a + b) / 2, fm = fn(m); if (!Number.isFinite(fm)) return null; if (fm === 0) return m; if ((fm < 0) === (fa < 0)) { a = m; fa = fm; } else b = m; }
        return (a + b) / 2;
      };
      const accept = r => {
        if (r == null) return;
        const scale = Math.max(1e-300, Math.abs(fn(r - dx)), Math.abs(fn(r + dx)));
        if (Math.abs(fn(r)) <= 1e-6 * scale + 1e-300 && !out.some(q => Math.abs(q - r) < dx * 1e-3 + 1e-15)) out.push(r);
      };
      for (let i = 1; i <= n; i++) {
        const a = vs[i - 1], b = vs[i];
        if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
        if (a === 0) accept(xs[i - 1]);
        else if ((a < 0) !== (b < 0) && b !== 0) accept(bisect(xs[i - 1], xs[i]));
        if (i < n && Number.isFinite(vs[i + 1]) && b !== 0) {
          const c = vs[i + 1];
          // b is closer to zero than both neighbours and on the same side: look for a dip across zero
          if ((a < 0) === (b < 0) && (c < 0) === (b < 0) && Math.abs(b) < Math.abs(a) && Math.abs(b) < Math.abs(c)) {
            let lo = xs[i - 1], hi = xs[i + 1];
            const toward = b > 0 ? 1 : -1;
            for (let k = 0; k < 90; k++) { const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3; (toward * fn(m1) > toward * fn(m2)) ? (lo = m1) : (hi = m2); }
            const xm = (lo + hi) / 2, vm = fn(xm);
            if (Number.isFinite(vm) && (vm < 0) !== (b < 0)) { accept(bisect(xs[i - 1], xm)); accept(bisect(xm, xs[i + 1])); }
            else if (Math.abs(vm) < 1e-12 * Math.max(Math.abs(a), Math.abs(c))) accept(xm);
          }
        }
      }
      return out.sort((p, q) => p - q);
    }
    const solveVisible = fn => rootsIn(fn, ux(0), ux(W), 800);
    function showSolutions(r, sols) {
      const d = dom.get(r.id);
      if (!d) return;
      const html = sols.length ? sols.slice(0, 6).map(x => `<span><i>x</i> = ${fmtNum(x, 6)}</span>`).join('') : 'No solutions in view. Zoom out or pan to look for one.';
      if (d.solHtml === html) return;
      d.solHtml = html;
      U.clear(d.sub); d.sub.className = 'gc-sub';
      d.sub.appendChild(h('div', { class: sols.length ? 'gc-val gc-sols' : 'gc-hint', html }));
    }
    const fmtShort = v => { if (Math.abs(v) < 1e-12) return '0'; const a = Math.abs(v); if (a >= 1e6 || a < 1e-4) { const [m, e] = v.toExponential(3).split('e'); return `${+m}×10^${+e}`.replace('-', '−'); } return String(+v.toPrecision(5)).replace('-', '−'); };
    function plotCurve(f, col, width) {
      g.strokeStyle = col; g.lineWidth = width; g.lineJoin = 'round'; g.lineCap = 'round';
      g.beginPath();
      let pen = false, prevY = null;
      const n = Math.ceil(W * 1.5);
      for (let i = 0; i <= n; i++) {
        const px = (i / n) * W, y = f(ux(px));
        if (!Number.isFinite(y)) { pen = false; prevY = null; continue; }
        const py = sy(y);
        if (prevY != null && Math.abs(py - prevY) > H * 1.5) pen = false; // asymptote
        const cy = U.clamp(py, -H * 2, H * 3);
        if (pen) g.lineTo(px, cy); else g.moveTo(px, cy);
        pen = true; prevY = py;
      }
      g.stroke();
    }
    function findPOI(c, all) {
      const x0 = ux(0), x1 = ux(W), n = 600, dx = (x1 - x0) / n;
      const add = (x, y, kind) => { if (Number.isFinite(x) && Number.isFinite(y) && sy(y) > -10 && sy(y) < H + 10 && !poi.some(p => Math.abs(sx(p.x) - sx(x)) < 3 && Math.abs(sy(p.y) - sy(y)) < 3)) poi.push({ x, y, kind, col: c.col }); };
      const roots = fn => rootsIn(fn, x0, x1, n).forEach(r => add(r, c.f(r), 'root'));
      roots(c.f); // x-intercepts
      // y-intercept
      const y0 = c.f(0); if (Number.isFinite(y0)) add(0, y0, 'yint');
      // extrema: sign change of the slope
      let prevS = null;
      for (let i = 1; i <= n; i++) {
        const xa = x0 + (i - 1) * dx, xb = x0 + i * dx, s = c.f(xb) - c.f(xa);
        if (Number.isFinite(s) && prevS != null && Number.isFinite(prevS) && s !== 0 && (s < 0) !== (prevS < 0)) {
          let a = xa - dx, b = xb, max = prevS > 0;
          for (let k = 0; k < 80; k++) { const m1 = a + (b - a) / 3, m2 = b - (b - a) / 3; ((c.f(m1) < c.f(m2)) === max) ? (a = m1) : (b = m2); }
          const xm = (a + b) / 2, ym = c.f(xm);
          if (Math.abs(sy(c.f(xm - dx)) - sy(ym)) < H) add(xm, ym, max ? 'max' : 'min');
        }
        if (Number.isFinite(s) && s !== 0) prevS = s;
      }
      for (const o of all) if (o !== c) roots(x => c.f(x) - o.f(x)); // intersections
    }

    // pointer: pan, pinch zoom, wheel zoom, trace along curves
    const pointers = new Map();
    let mode = null, panStart = null, pinchStart = null;
    const pos = e => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    function nearest(p, radius = 14) {
      let best = null, bd = radius;
      for (const t of poi) { const d = Math.hypot(sx(t.x) - p.x, sy(t.y) - p.y); if (d < bd + 4) { best = t; bd = d - 4; } }
      for (const t of poiTargets) { const d = Math.hypot(sx(t.x) - p.x, sy(t.y) - p.y); if (d < bd) { best = t; bd = d; } }
      if (best) return best;
      for (const r of rows) {
        const res = results.get(r.id);
        if (r.hidden || !res || !res.curve) continue;
        const xv = ux(p.x), yv = res.curve(xv);
        if (!Number.isFinite(yv)) continue;
        const d = Math.abs(sy(yv) - p.y);
        if (d < bd) { bd = d; best = { x: xv, y: yv, col: plotColor(r.color), row: r.id, trace: res.curve }; }
      }
      return best;
    }
    canvas.addEventListener('pointerdown', e => {
      canvas.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, pos(e));
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        mode = 'pinch'; hoverPt = null;
        pinchStart = { d: Math.hypot(a.x - b.x, a.y - b.y), scale: view.scale, cx: ux((a.x + b.x) / 2), cy: uy((a.y + b.y) / 2) };
        return;
      }
      const p = pos(e), hit = nearest(p, e.pointerType === 'touch' ? 22 : 14);
      if (hit) { mode = 'trace'; hoverPt = hit; if (hit.row) { selected = hit.row; } draw(); return; }
      mode = 'pan'; panStart = { p, cx: view.cx, cy: view.cy };
      pinned = null;
    });
    canvas.addEventListener('pointermove', e => {
      const p = pos(e);
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, p);
      if (mode === 'pinch' && pointers.size === 2) {
        const [a, b] = [...pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
        view.scale = U.clamp(pinchStart.scale * d / pinchStart.d, 1e-6, 1e9);
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        view.cx = pinchStart.cx - (mx - W / 2) / view.scale; view.cy = pinchStart.cy + (my - H / 2) / view.scale;
        draw(); return;
      }
      if (mode === 'pan') { view.cx = panStart.cx - (p.x - panStart.p.x) / view.scale; view.cy = panStart.cy + (p.y - panStart.p.y) / view.scale; draw(); return; }
      if (mode === 'trace' && hoverPt) {
        if (hoverPt.trace) { const xv = ux(p.x), yv = hoverPt.trace(xv); if (Number.isFinite(yv)) hoverPt = Object.assign({}, hoverPt, { x: xv, y: yv }); }
        else { const n = nearest(p, 30); if (n) hoverPt = n; }
        draw(); return;
      }
      if (e.pointerType === 'mouse' && !mode) {
        const n = nearest(p);
        canvas.style.cursor = n ? 'pointer' : 'grab';
        if ((n && n.kind) !== (hoverPt && hoverPt.kind) || (n && hoverPt && (n.x !== hoverPt.x || n.y !== hoverPt.y)) || (!n && hoverPt)) { hoverPt = n && n.kind ? n : null; draw(); }
      }
    });
    const end = e => {
      pointers.delete(e.pointerId);
      if (mode === 'trace' && hoverPt && hoverPt.kind) pinned = hoverPt;
      if (mode === 'trace') { if (!hoverPt || !hoverPt.kind) hoverPt = null; }
      if (pointers.size === 0) { mode = null; save(); }
      else if (mode === 'pinch') mode = null;
      draw();
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('pointerleave', e => { if (!mode && hoverPt && e.pointerType === 'mouse') { hoverPt = null; draw(); } });
    canvas.style.touchAction = 'none';
    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      const p = pos(e), k = Math.exp(-e.deltaY * 0.0015);
      const ax = ux(p.x), ay = uy(p.y);
      view.scale = U.clamp(view.scale * k, 1e-6, 1e9);
      view.cx = ax - (p.x - W / 2) / view.scale; view.cy = ay + (p.y - H / 2) / view.scale;
      draw(); clearTimeout(wheelSave); wheelSave = setTimeout(save, 300);
    }, { passive: false });
    let wheelSave = 0;
    zoomIn.addEventListener('click', () => { view.scale *= 1.5; draw(); save(); });
    zoomOut.addEventListener('click', () => { view.scale /= 1.5; draw(); save(); });
    zoomHome.addEventListener('click', () => { view = defaultView(); pinned = null; draw(); save(); });

    function save() { U.store.set('gcState', { rows: rows.filter(r => !isBlank(r)).map(r => r.type === 'table' ? { type: 'table', color: r.color, hidden: r.hidden, data: r.data.filter(d => d[0] || d[1]).concat([['', '']]) } : { type: 'expr', text: r.text, color: r.color, hidden: r.hidden, slider: r.slider }), colorI, view }); }

    renderList();
    recompute();
    if (keypadOpen) setKeypad(true);
    return { el, redraw: () => draw(), resize, destroy() { ro.disconnect(); U.liveCanvases.delete(live); } };
  }

  return { create, parseStatement, analyze, fmtNum, prettyStatement };
})();
