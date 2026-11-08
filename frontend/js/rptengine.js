/* Draws the reports in the page, from the design read out of the Crystal .rpt files (rptdefs.js) and the data sent by
   /api/fast/...: same sections, positions, fonts, lines, formulas, groups, summaries and running totals. A report opens
   as soon as the data arrives (Crystal took 3-12 seconds, more on phones) and prints with the browser. */
'use strict';

const RptEngine = (() => {
  // ------------------------------------------------------------------ Crystal formula language (the part the reports use)
  function tokens(src) {
    const t = [];
    const re = /\s+|\/\/[^\n]*|"([^"]*)"|'([^']*)'|\{([^}]*)\}|(\d+\.?\d*|\.\d+)|(<=|>=|<>|[-+*\/=<>(),])|([A-Za-z_][A-Za-z_0-9]*)/g;
    let m;
    while ((m = re.exec(src))) {
      if (m[1] !== undefined) t.push({ s: m[1] });
      else if (m[2] !== undefined) t.push({ s: m[2] });
      else if (m[3] !== undefined) t.push({ f: m[3] });
      else if (m[4] !== undefined) t.push({ v: Number(m[4]) });
      else if (m[5] !== undefined) t.push({ o: m[5] });
      else if (m[6] !== undefined) t.push({ w: m[6] });
    }
    return t;
  }
  const num = v => (v === null || v === undefined || v === '' ? 0 : Number(v) || 0);
  const isDate = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v);

  // the amount in words is Marathi (Crystal's NoToWords printed English)
  const words = n => MarathiWords(num(n));

  // ------------------------------------------------------------------ one report run
  function create(def, data, pars, title, over) {
    const cols = new Map((data.cols || []).map((c, i) => [c.toUpperCase(), i]));
    let rows = data.rows || [];
    const parsLc = Object.fromEntries(Object.entries(pars || {}).map(([k, v]) => [k.toLowerCase(), v]));
    const compiled = new Map(), formulas = new Map();
    const e = { i: 0, page: 1 };

    // group levels (outer first)
    const gh = def.areas.filter(a => a.k === 3);
    const gf = def.areas.filter(a => a.k === 5);
    const levels = gh.map(a => {
      const fn = compile(a.c.startsWith('{') ? a.c : '{' + a.c + '}');
      return { cond: a.c, head: a.s, foot: (gf.find(x => x.c === a.c) || { s: [] }).s, key: fn };
    });
    // Crystal sorts the records by the groups itself (the SQL often orders by the first groups only)
    if (levels.length && rows.length) {
      const all = rows, cmp = (a, b) => (a === b ? 0 : a === null || a === undefined ? -1 : b === null || b === undefined ? 1 : a < b ? -1 : 1);
      const keys = all.map((_, i) => { e.i = i; return levels.map(l => l.key()); });
      rows = all.map((r, i) => i).sort((x, y) => {
        for (let l = 0; l < levels.length; l++) { const c = cmp(keys[x][l], keys[y][l]); if (c) return c; }
        return x - y;
      }).map(i => all[i]);
      e.i = 0;
    }
    const keyOf = (lv, i) => { const sv = e.i; e.i = i; const v = levels[lv].key(); e.i = sv; return isDate(v) ? v.slice(0, 10) : v; };
    // start / end row of each group
    const starts = levels.map((_, lv) => {
      const a = new Array(rows.length); let st = 0;
      for (let i = 0; i < rows.length; i++) {
        let changed = i === 0;
        for (let l = 0; l <= lv && !changed; l++) if (keyOf(l, i) !== keyOf(l, i - 1)) changed = true;
        if (changed) st = i;
        a[i] = st;
      }
      return a;
    });
    const ends = starts.map(a => { const r = new Array(a.length); let en = a.length - 1; for (let i = a.length - 1; i >= 0; i--) { r[i] = en; if (a[i] === i) en = i - 1; } return r; });
    const levelOf = cond => levels.findIndex(l => l.cond.toUpperCase() === String(cond).toUpperCase());

    const memo = new Map();
    function sum(id, fn, cond, kind) {
      const lv = cond ? levelOf(cond) : -1;
      const st = lv >= 0 ? (starts[lv][e.i] ?? 0) : 0, en = lv >= 0 ? (ends[lv][e.i] ?? -1) : rows.length - 1;
      const key = id + '|' + lv + '|' + st;
      if (memo.has(key)) return memo.get(key);
      const sv = e.i; let s = 0, n = 0;
      for (let i = st; i <= en; i++) { e.i = i; const v = fn(); if (v !== null && v !== undefined && v !== '') { s += num(v); n++; } }
      e.i = sv;
      const r = kind === 'avg' ? (n ? s / n : 0) : kind === 'count' ? n : n ? s : null;
      memo.set(key, r);
      return r;
    }

    function field(name) {
      if (name.startsWith('@')) { const f = name.slice(1).toLowerCase(); return () => formula(f)(); }
      if (name.startsWith('#')) { const n = '{' + name + '}'; return () => { const r = running.get(n.toLowerCase()); return r ? r[e.i] : 0; }; }
      if (name.startsWith('?')) { const p = name.slice(1).toLowerCase(); return () => (p in parsLc ? parsLc[p] : null); }
      const ix = cols.get(name.toUpperCase());
      if (ix === undefined) return () => null;
      return () => (rows[e.i] ? rows[e.i][ix] : null);
    }
    function formula(name) {
      if (!formulas.has(name)) { formulas.set(name, () => null); formulas.set(name, parse(def.formulas[name] || '')); }
      return formulas.get(name);
    }

    function parse(src) {
      const t = tokens(src); let p = 0;
      const peek = () => t[p];
      const isW = w => t[p] && t[p].w && t[p].w.toLowerCase() === w;
      const isO = o => t[p] && t[p].o === o;
      function expr() {
        if (isW('if')) {
          p++; const c = expr(); if (isW('then')) p++;
          const a = expr(); let b = () => null;
          if (isW('else')) { p++; b = expr(); }
          return () => (c() ? a() : b());
        }
        return or();
      }
      function or() { let a = and(); while (isW('or')) { p++; const x = a, y = and(); a = () => x() || y(); } return a; }
      function and() { let a = not(); while (isW('and')) { p++; const x = a, y = not(); a = () => x() && y(); } return a; }
      function not() { if (isW('not')) { p++; const x = not(); return () => !x(); } return cmp(); }
      function cmp() {
        const a = add();
        const o = peek() && peek().o;
        if (o && ['=', '<>', '<', '>', '<=', '>='].includes(o)) {
          p++; const b = add();
          const norm = v => (v === null || v === undefined ? 0 : v);
          return () => {
            let x = norm(a()), y = norm(b());
            if (typeof x === 'string' && typeof y === 'number') y = String(y);
            if (typeof y === 'string' && typeof x === 'number') x = String(x);
            return o === '=' ? x === y : o === '<>' ? x !== y : o === '<' ? x < y : o === '>' ? x > y : o === '<=' ? x <= y : x >= y;
          };
        }
        return a;
      }
      function add() {
        let a = mul();
        while (isO('+') || isO('-')) {
          const o = t[p++].o, x = a, y = mul();
          a = o === '+' ? () => { const u = x(), v = y(); return typeof u === 'string' || typeof v === 'string' ? (u ?? '') + (v ?? '') : num(u) + num(v); } : () => num(x()) - num(y());
        }
        return a;
      }
      function mul() {
        let a = unary();
        while (isO('*') || isO('/')) {
          const o = t[p++].o, x = a, y = unary();
          a = o === '*' ? () => num(x()) * num(y()) : () => { const d = num(y()); return d ? num(x()) / d : 0; };
        }
        return a;
      }
      function unary() { if (isO('-')) { p++; const x = unary(); return () => -num(x()); } return prim(); }
      function args() {
        const list = []; p++;
        while (t[p] && !isO(')')) { if (isO(',')) { p++; continue; } const st = p; list.push({ fn: expr(), tok: t[st] }); }
        p++;
        return list;
      }
      function prim() {
        const k = t[p];
        if (!k) return () => null;
        if (k.v !== undefined) { p++; return () => k.v; }
        if (k.s !== undefined) { p++; return () => k.s; }
        if (k.f !== undefined) { p++; return field(k.f); }
        if (k.o === '(') { p++; const x = expr(); if (isO(')')) p++; return x; }
        if (k.w) {
          p++;
          const w = k.w.toLowerCase();
          if (isO('(')) {
            const a = args();
            const id = src + '#' + p;
            switch (w) {
              case 'sum': case 'average': case 'count': {
                const cond = a[1] && a[1].tok.f ? '{' + a[1].tok.f + '}' : null;
                return () => sum(id, a[0].fn, cond, w === 'average' ? 'avg' : w);
              }
              case 'round': return () => { const f = Math.pow(10, a[1] ? num(a[1].fn()) : 0); return Math.round((num(a[0].fn()) + Number.EPSILON) * f) / f; };
              case 'notowords': return () => words(a[0].fn());
              case 'month': return () => { const d = a[0].fn(); return d ? Number(String(d).slice(5, 7)) : 0; };
              case 'year': return () => { const d = a[0].fn(); return d ? Number(String(d).slice(0, 4)) : 0; };
              case 'groupname': return a[0].fn;
              default: return () => '';
            }
          }
          if (w === 'printdate') return () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 19); };
          if (w === 'pagenumber') return () => e.page;
          if (w === 'totalpagecount') return () => '\u0001';
          if (w === 'reporttitle') return () => title || '';
          if (w === 'recordnumber') return () => e.i + 1;
          return () => null;
        }
        p++;
        return () => null;
      }
      return expr();
    }
    function compile(src) { if (!compiled.has(src)) compiled.set(src, parse(src)); return compiled.get(src); }

    // running totals: the value after each record
    const running = new Map();
    for (const r of def.running || []) {
      const of = compile(r.of || '0');
      const ev = r.ev === 3 && r.evf ? compile(r.evf) : null;
      const out = new Array(rows.length);
      let s = 0, n = 0, seen = new Set(), prev = null;
      for (let i = 0; i < rows.length; i++) {
        e.i = i;
        if (r.rs === 2 && r.rsg > 0 && levels[r.rsg - 1] && starts[r.rsg - 1][i] === i) { s = 0; n = 0; seen = new Set(); }
        if (!ev || ev()) {
          const v = of();
          if (r.op === 6) { seen.add(v); } else if (v !== null && v !== undefined) { s += num(v); n++; }
        }
        out[i] = r.op === 1 ? (n ? s / n : 0) : r.op === 6 ? seen.size : r.op === 0 ? s : n;
      }
      running.set(String(r.n).toLowerCase(), out);
    }
    e.i = 0;

    // ---------------------------------------------------------------- output
    const pt = v => (v / 20).toFixed(2) + 'pt';
    const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const color = c => { const v = Number(c) >>> 0; if (v === 0xFFFFFFFF) return null; return '#' + [v & 255, (v >> 8) & 255, (v >> 16) & 255].map(x => x.toString(16).padStart(2, '0')).join(''); };
    const fmtDate = (v, o) => {
      const d = v.slice(8, 10), m = v.slice(5, 7), y = v.slice(0, 4);
      if (o.dord === 1 && !o.sysd) return d + (o.ds1 ?? '/') + m + (o.ds2 ?? '/') + (o.yt === 0 ? y.slice(2) : y);
      return d + '/' + m + '/' + y;
    };
    const fmtNum = (v, o) => {
      const dp = o.dp ?? 2;
      const f = Math.pow(10, dp);
      const r = Math.round((Math.abs(v) + 1e-9) * f) / f;
      let s = r.toFixed(dp);
      if (o.ts) { const [a, b] = s.split('.'); s = a.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (b ? '.' + b : ''); }
      return (v < 0 && r !== 0 ? '-' : '') + s;
    };
    const numericField = f => { const m = /^\{[^.}]+\.([^}]+)\}$/.exec(f); return !!m && !/^(V|D|CB)/i.test(m[1]); };
    const shown = o => { const c = (over.cond || {})[o.n]; if (c) return c(parsLc); return !(o.s && !(over.show || []).includes(o.n)); };
    const dvbText = (t, o) => dvbSoftNa(t, o.font);
    const prevVal = new Map();
    const canvas = document.createElement('canvas').getContext('2d');
    /** the object with the font size that keeps the text on one line in its box */
    function fitted(o, txt) {
      canvas.font = (o.bold ? 'bold ' : '') + '100pt \'' + (o.font || 'Arial') + '\'';
      const at100 = canvas.measureText(dvbText(txt, o)).width * 0.75;   // points at 100 pt
      const room = o.w / 20 - 1;
      return { ...o, g: 0, size: Math.max(5, Math.min(o.size || 10, 100 * room / at100)).toFixed(2) };
    }
    function wrapCount(txt, o) {
      canvas.font = (o.bold ? 'bold ' : '') + (o.size || 10) + "pt '" + (o.font || 'Arial') + "'";
      const max = o.w / 15;
      let lines = 1, w = 0;
      for (const word of String(txt).split(/(\s+)/)) {
        const m = canvas.measureText(word).width * 96 / 72 / (96 / 72);
        if (w + m > max && w > 0) { lines++; w = 0; }
        w += m;
      }
      return lines;
    }

    function textObj(out, o, oy, txt, numeric, ox) {
      const css = [`left:${pt(o.x + ox)}`, `top:${pt(o.y + oy)}`, `width:${pt(o.w)}`, `height:${pt(o.h)}`];
      if (o.font) {
        css.push(`font-family:'${o.font}'`, `font-size:${o.size}pt`);
        if (o.bold) css.push('font-weight:bold');
        if (o.ital) css.push('font-style:italic');
        if (o.und) css.push('text-decoration:underline');
      }
      const c = color(o.c ?? 0); if (c && c !== '#000000') css.push('color:' + c);
      const bg = o.bg !== undefined ? color(o.bg) : null; if (bg) css.push('background:' + bg);
      const al = o.al === 1 ? 'left' : o.al === 2 ? 'center' : o.al === 3 ? 'right' : numeric ? 'right' : 'left';
      if (al !== 'left') css.push('text-align:' + al);
      if (o.b) { ['left', 'right', 'top', 'bottom'].forEach((s, i) => { if (o.b[i]) css.push(`border-${s}:1px solid #000`); }); }
      if (o.g) css.push('white-space:pre-wrap', 'height:auto');
      const html = esc(dvbText(txt, o)).replace(/[\u0900-\u097F]+(?:\s+[\u0900-\u097F]+)*/g, m => `<span class="fr-uni">${m}</span>`);
      out.push(`<div class="fr-o" style="${css.join(';')}">${html}</div>`);
    }
    function lineObj(o, y1, y2, ox) {
      const th = Math.max((o.lt || 20) / 20, 0.5);
      const c = color(o.lc ?? o.bc ?? 0) || 'transparent';
      const x = o.x + ox, r = (o.r ?? o.x) + ox;
      if (o.k === 3) {
        if (Math.abs(r - x) < 20) return `<div class="fr-l" style="left:${pt(x)};top:${pt(y1)};height:${pt(Math.max(y2 - y1, 0))};border-left:${th}pt solid ${c}"></div>`;
        return `<div class="fr-l" style="left:${pt(x)};top:${pt(y1)};width:${pt(r - x)};border-top:${th}pt solid ${c}"></div>`;
      }
      const fill = o.fc !== undefined ? color(o.fc) : null;
      return `<div class="fr-l" style="left:${pt(x)};top:${pt(y1)};width:${pt(r - x)};height:${pt(Math.max(y2 - y1, 0))};border:${th}pt solid ${c}${fill ? ';background:' + fill : ''}"></div>`;
    }

    // ---------------------------------------------------------------- page flow
    const landscape = def.orient === 2;
    const W = landscape ? 16838 : 11906, H = landscape ? 11906 : 16838;
    const [ml0, , mt, mb] = over.nested ? [0, 0, 0, 0] : def.m;
    // over.filing: the spare width of the page goes to the left, for punching and filing
    const contentRight = () => Math.max(...Object.values(def.secs).filter(x => !x.sup).flatMap(x => x.o.map(o => Math.max(o.x + (o.w || 0), o.r || 0))));
    const ml = over.filing ? Math.max(ml0, W - contentRight() - 120) : ml0;
    const areaSecs = k => def.areas.filter(a => a.k === k).flatMap(a => a.s).filter(s => def.secs[s] && !def.secs[s].sup);
    const secsOf = list => list.filter(s => def.secs[s] && !def.secs[s].sup);
    const pfH = secsOf(areaSecs(7)).reduce((a, s) => a + def.secs[s].h, 0);
    const detailSecs = new Set(areaSecs(4));
    const pages = [];
    let cur = null, y = 0, lastY = 0;

    function closeSpans(all) {
      cur.spans.forEach(sp => { if (all) cur.html[sp.at] = lineObj(sp.o, sp.y, sp.last ?? lastY, sp.ox); });
      if (all) cur.spans = [];
    }
    function newPage(firstRow) {
      if (cur) finishPage();
      e.page = pages.length + 1;
      cur = { html: [], spans: [] };
      pages.push(cur);
      y = mt; lastY = y;
      const sv = e.i; if (firstRow !== undefined) e.i = firstRow;
      if (pages.length === 1) areaSecs(1).forEach(s => draw(s, true));
      areaSecs(2).forEach(s => draw(s, true));
      e.i = sv;
    }
    function finishPage() {
      closeSpans(true);
      if (pfH) { const sv = y; y = H - mb - pfH; areaSecs(7).forEach(s => draw(s, true)); y = sv; }
    }
    function draw(name, noBreak) {
      const sec = def.secs[name];
      let extra = 0;
      const subs = sec.o.filter(o => o.k === 5 && !o.s);
      const subOut = [];
      subs.forEach(o => {
        const d = def.subs && def.subs[o.sub]; if (!d) return;
        const r = create(d, (over.subs || {})[o.sub] || {}, pars, title, { nested: 1 }).run();
        subOut.push({ o, r });
        extra = Math.max(extra, o.y + r.bottom - sec.h);
      });
      for (const o of sec.o) {
        if (!o.g || o.k > 2 || !shown(o) || (over.fit || []).includes(o.n)) continue;
        const txt = o.k === 2 ? o.t : compile(o.f)();
        if (typeof txt !== 'string' || !txt) continue;
        const lines = wrapCount(txt, o);
        extra = Math.max(extra, o.y + lines * (o.size || 10) * 23 - sec.h);
      }
      const h = sec.h + Math.max(extra, 0);
      if (!noBreak && !over.nested && y + h > H - mb - pfH && y > mt) newPage();
      const out = cur.html, top = y;
      for (const o of sec.o) {
        if (!shown(o)) continue;
        if (o.k === 2) {
          let txt = String(o.t || '').replace(/[\u0080-\u009f]/g, '').replace(/\r\n?/g, '\n');
          const fill = (over.fill || {})[o.n];
          if (fill) { let i = 0; txt = txt.replace(/\[\]/g, () => { const x = fill[i++]; const v = x ? compile(x)() : ''; return typeof v === 'number' ? fmtNum(v, { dp: 2 }) : isDate(v) ? fmtDate(v, {}) : String(v ?? ''); }); }
          textObj(out, o, top, txt, false, ml);
        }
        else if (o.k === 1) {
          let v = compile(o.f)();
          if (typeof v === 'number' && (over.abs || []).includes(o.f)) v = Math.abs(v);
          if (o.sz && !num(v) && typeof v !== 'string') continue;
          let txt, numeric = false;
          if ((v === null || v === undefined) && numericField(o.f)) { txt = fmtNum(0, o); numeric = true; }
          else if (v === null || v === undefined || v === '') txt = '';
          else if (typeof v === 'number') { txt = fmtNum(v, o); numeric = true; }
          else if (isDate(v)) txt = fmtDate(v, o);
          else if (typeof v === 'boolean') txt = v ? 'True' : 'False';
          else txt = String(v);
          if (o.sd) { const k = name + o.n; if (prevVal.get(k) === txt) continue; prevVal.set(k, txt); }
          if (txt !== '') textObj(out, (over.fit || []).includes(o.n) ? fitted(o, txt) : o, top, txt, numeric, ml);
        } else if (o.k === 3 || o.k === 4) {
          const y1 = top + o.y;
          if (o.end && o.end !== name) { cur.spans.push({ o, y: y1, ox: ml, end: o.end, at: out.length }); out.push(''); }
          else out.push(lineObj(o, y1, top + (o.bt ?? o.y), ml));
        }
      }
      subOut.forEach(({ o, r }) => { out.push(`<div class="fr-l" style="left:${pt(o.x + ml)};top:${pt(top + o.y)};width:${pt(o.w)};height:${pt(r.bottom)}">${r.html}</div>`); });
      // lines and boxes that end in this section
      cur.spans = cur.spans.filter(sp => {
        if (sp.end !== name) return true;
        const bottom = top + (sp.o.bt ?? 0);
        if (detailSecs.has(name)) { sp.last = bottom; return true; }
        cur.html[sp.at] = lineObj(sp.o, sp.y, bottom, sp.ox);
        return false;
      });
      y = top + h; lastY = y;
    }

    function run() {
      e.i = 0;
      newPage(0);
      const details = secsOf(areaSecs(4));
      const heads = levels.map(l => secsOf(l.head)), feet = levels.map(l => secsOf(l.foot));
      for (let i = 0; i < rows.length; i++) {
        e.i = i;
        // group headers that start here (outer first)
        levels.forEach((_, lv) => { if (starts[lv][i] === i) heads[lv].forEach(s => draw(s)); });
        details.forEach(s => draw(s));
        // group footers that end here (inner first)
        for (let lv = levels.length - 1; lv >= 0; lv--) {
          if (ends[lv][i] === i) {
            feet[lv].forEach(s => draw(s));
            if (feet[lv].some(s => (over.breakAfter || []).includes(s)) && i < rows.length - 1) newPage(i + 1);
          }
        }
      }
      e.i = Math.max(rows.length - 1, 0);
      areaSecs(8).forEach(s => draw(s));
      if (over.nested) { closeSpans(true); return { html: cur.html.join(''), bottom: y }; }
      finishPage();
      return { pages: pages.map(p => p.html.join('')), width: W, height: H };
    }
    return { run };
  }

  // What the .rpt keeps in conditional formulas, which the runtime does not hand out
  const OVER = {
    bill_report: { show: ['Text2', 'Field49'], breakAfter: ['Section12'] },
    bill_registar: { filing: true },
    milk_Sub_Led: { breakAfter: ['Section8'], abs: ['{#Balance}'], fit: ['Field4', 'Field6', 'Field12'] },
    milk_Sub_Led_list: { abs: ['{#grand balance}'] },
    milk_cattel_Led: { abs: ['{#Balance}', '{#grandbalance}'], show: ['Field7', 'Field8'], fit: ['Field4'] },
    daily_moring_report: { cond: { Text11: p => Number(p.ptime) === 1, Text12: p => Number(p.ptime) === 2, Box1: () => false } },
    bank_ltr: { fill: { Text4: ['{?fdate}', '{?tdate}'], Text8: ['{?amt}', '{@wamt}', '{?fdate}', '{?tdate}'] } }
  };

  return {
    /** the fonts of a report, loaded before its text widths are measured */
    async fonts(name) {
      const set = new Set();
      const add = d => Object.values(d.secs).forEach(s => s.o.forEach(o => { if (o.font) set.add((o.bold ? 'bold ' : '') + "12pt '" + o.font + "'"); }));
      const def = window.RPT[name];
      if (!def) return;
      add(def); Object.values(def.subs || {}).forEach(add);
      await Promise.all(Array.from(set).map(f => document.fonts.load(f).catch(() => null)));
    },
    /** report: name in window.RPT; res: the answer of /api/fast/... */
    build(res) {
      const def = window.RPT[res.report];
      const over = Object.assign({}, OVER[res.report] || {}, { subs: res.subs || {} });
      return create(def, res.data || {}, res.pars || {}, res.title, over).run();
    }
  };
})();

/** Shows a report inside the form, like the Crystal viewer: Print / Close, whole pages, one below the other. */
const FastReport = {
  async show(frame, url, params) {
    const surface = frame.closest('.vbform-surface') || frame;
    surface.querySelectorAll('.fr-view').forEach(x => x.remove());
    const view = h('div', { class: 'rpt-view rc-view fr-view' });
    view.appendChild(h('div', { class: 'rpt-wait' }, h('div', { class: 'spinner' }), 'Please wait...'));
    surface.appendChild(view);
    try {
      let r;
      if (url === 'ratechart') r = await FastReport.rateChart(params);
      else { const res = await API.get('/api/fast/' + url, params); await RptEngine.fonts(res.report); r = RptEngine.build(res); }
      if (!view.isConnected) return;
      const pagesEl = h('div', { class: 'fr-pages' });
      pagesEl.innerHTML = r.pages.map((p, i) => `<div class="fr-page" style="width:${r.width / 20}pt;height:${r.height / 20}pt">${p.replace(/\u0001/g, r.pages.length)}</div>`).join('');
      const print = () => FastReport.print(pagesEl, r);
      const wrap = h('div', { class: 'fr-scroll' }, pagesEl);
      view.replaceChildren(FastReport.toolbar(view, wrap, pagesEl, r, print), wrap);
      // whole page width fits the view
      const zoom = Math.min(1.25, (wrap.clientWidth - 16) / (r.width / 15));
      pagesEl.style.zoom = zoom > 0 ? zoom : 1;
      if (typeof VBMobile !== 'undefined' && VBMobile.is()) view.scrollIntoView({ block: 'start' });
    } catch (e) {
      view.remove();
      if (e.status === 404 && url !== 'ratechart') return Crystal.show(frame, '/api/crystal/' + url, params);
      UI.error(e);
    }
  },
  /** Print / Close, first - previous - page no. - next - last, and Find (code, amount, name in Marathi or English). */
  toolbar(view, wrap, pagesEl, r, print) {
    const pages = () => Array.from(pagesEl.children);
    const total = r.pages.length;
    const pageNo = h('input', { type: 'text', class: 'fr-pageno', inputmode: 'numeric' });
    const go = n => {
      n = Math.max(1, Math.min(total, n));
      pages()[n - 1].scrollIntoView({ block: 'start' });
      pageNo.value = n;
    };
    const current = () => {
      const list = pages(), mid = wrap.getBoundingClientRect().top + wrap.clientHeight / 3;
      let lo = 0, hi = list.length - 1;
      while (lo < hi) { const m = Math.ceil((lo + hi) / 2); if (list[m].getBoundingClientRect().top <= mid) lo = m; else hi = m - 1; }
      return lo + 1;
    };
    let tick = 0;
    wrap.addEventListener('scroll', () => { if (tick) return; tick = requestAnimationFrame(() => { tick = 0; if (document.activeElement !== pageNo) pageNo.value = current(); }); });
    pageNo.value = 1;
    pageNo.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); const n = parseInt(FastReport.digits(pageNo.value), 10); if (n) go(n); } });
    pageNo.addEventListener('focus', () => pageNo.select());
    const nav = (t, title, fn) => h('button', { type: 'button', class: 'vb-btn fr-nav', title, onclick: fn }, t);

    // ------------------------------------------------- find
    const box = h('input', { type: 'text', class: 'fr-find', placeholder: 'कोड / नाव / रक्कम', autocomplete: 'off' });
    const info = h('span', { class: 'fr-info' }, '');
    let hits = [], at = -1, lastQ = null;
    const cache = new Map();
    const clear = () => { hits.forEach(x => x.classList.remove('fr-hit', 'fr-hit-now')); hits = []; at = -1; };
    const search = async q => {
      clear();
      const all = Array.from(pagesEl.querySelectorAll('.fr-o'));
      const text = e => e.textContent.trim();
      if (typeof DVBSearch !== 'undefined' && DVBSearch.hasDevanagari(q) && !/^[\d\s.,०-९]+$/.test(q)) {
        hits = all.filter(e => DVBSearch.match(text(e), q, cache));
      } else if (/[a-z]/i.test(q)) {
        const lq = q.toLowerCase();
        // English name -> the Marathi name printed in the report
        const sup = await Lookups.suppliers().catch(() => []);
        const names = new Set(sup.filter(x => (x.e || '').toLowerCase().includes(lq)).map(x => x.t));
        hits = all.filter(e => names.has(text(e)) || text(e).toLowerCase().includes(lq));
      } else {
        const d = FastReport.digits(q);
        hits = all.filter(e => text(e) === d || text(e) === q);        // the code or bill no. itself
        if (!hits.length) hits = all.filter(e => text(e).includes(d) || text(e).includes(q));
      }
      hits.forEach(x => x.classList.add('fr-hit'));
    };
    const find = async dir => {
      const q = box.value.trim();
      if (!q) { clear(); lastQ = null; info.textContent = ''; return; }
      if (q !== lastQ) { await search(q); lastQ = q; at = -1; }
      if (!hits.length) { info.textContent = 'Not found'; return; }
      if (at >= 0) hits[at].classList.remove('fr-hit-now');
      at = at < 0 ? 0 : (at + dir + hits.length) % hits.length;
      const e = hits[at];
      e.classList.add('fr-hit-now');
      e.scrollIntoView({ block: 'center' });
      info.textContent = (at + 1) + ' / ' + hits.length;
      pageNo.value = current();
    };
    box.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); find(e.shiftKey ? -1 : 1); }
      else if (e.key === 'Escape') { box.value = ''; find(1); }
    });

    const many = total > 1;
    return h('div', { class: 'rpt-toolbar fr-toolbar' },
      h('button', { type: 'button', class: 'vb-btn', onclick: print }, 'Print'),
      h('button', { type: 'button', class: 'vb-btn', onclick: () => view.remove() }, 'Close'),
      many ? h('span', { class: 'fr-group' },
        nav('|<', 'First page', () => go(1)), nav('<', 'Previous page', () => go(current() - 1)),
        pageNo, h('span', { class: 'fr-of' }, '/ ' + total),
        nav('>', 'Next page', () => go(current() + 1)), nav('>|', 'Last page', () => go(total))) : null,
      h('span', { class: 'fr-group' }, box,
        h('button', { type: 'button', class: 'vb-btn', onclick: () => find(1) }, 'Find'),
        nav('<', 'Previous match', () => find(-1)), nav('>', 'Next match', () => find(1)), info));
  },
  /** Marathi digits typed on a phone -> the digits of the report */
  digits: t => String(t).replace(/[०-९]/g, ch => String(ch.charCodeAt(0) - 0x966)),
  /** The rate charts are cross-tabs: fat in rows, snf in columns, the whole chart on one A4 page. */
  async rateChart(p) {
    const r = await API.get('/api/ratechart/chart', p);
    if (!r.rates.length) throw new Error('Record Not Found');
    const k = (f, s) => Math.round(f * 10) * 1000 + Math.round(s * 10);
    const map = new Map(r.rates.map(x => [k(x.fat, x.snf), x.rate]));
    const snfs = r.snfs.slice().sort((a, b) => b - a), fats = r.fats.slice().sort((a, b) => a - b);
    const land = snfs.length > 18;
    const width = land ? 16838 : 11906, height = land ? 11906 : 16838;
    const rowH = Math.min(18, (height / 20 - 72) / (fats.length + 1));
    const font = Math.min(9, rowH * 0.72, (width / 20 - 40) / (snfs.length + 1) / 3.1);
    const head = '<tr><th>Fat / SNF</th>' + snfs.map(s => '<th>' + Number(s).toFixed(1) + '</th>').join('') + '</tr>';
    const body = fats.map(f => '<tr><th>' + Number(f).toFixed(1) + '</th>' + snfs.map(s => { const v = map.get(k(f, s)); return '<td>' + (v === undefined ? '' : Number(v).toFixed(2)) + '</td>'; }).join('') + '</tr>').join('');
    const dairy = p.dairy ? Fmt.dairy(p.dairy) : '';
    const title = '<div class="fr-rc-h"><span class="mr">' + MR.title + '</span><br><span class="mr">' + dairy + '</span> ' + VBDate.text(p.from) + ' - ' + VBDate.text(p.to) + '</div>';
    const tbl = '<table class="fr-rc" style="font-size:' + font.toFixed(1) + 'pt"><thead>' + head + '</thead><tbody>' + body.replace(/<tr>/g, '<tr style="height:' + rowH.toFixed(1) + 'pt">') + '</tbody></table>';
    return { pages: ['<div class="fr-rc-page">' + title + tbl + '</div>'], width, height };
  },
  print(pagesEl, r) {
    const area = document.getElementById('print-area');
    area.innerHTML = pagesEl.innerHTML;
    document.getElementById('print-orient').textContent = `@page { size: A4 ${r.width > r.height ? 'landscape' : 'portrait'}; margin: 0; }`;
    document.body.classList.add('print-mode');
    const done = () => { document.body.classList.remove('print-mode'); area.replaceChildren(); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    window.print();
    setTimeout(done, 1000);
  }
};
