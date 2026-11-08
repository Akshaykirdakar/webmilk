/* Draws the VB6 forms (from vbforms.js) in the browser: same position, size, font, font size, colours and TabIndex.
   Also provides the txtcbo-style combo box, VB-like key validation (Tag) and Enter / arrow-key movement. */
'use strict';

// ------------------------------------------------------------------ colours & fonts
const SYS_COLORS = ['#c8c8c8', '#000000', '#99b4d1', '#bfcddb', '#f0f0f0', '#ffffff', '#646464', '#000000', '#000000', '#000000',
  '#b4b4b4', '#f4f7fc', '#ababab', '#0078d7', '#ffffff', '#f0f0f0', '#a0a0a0', '#6d6d6d', '#000000', '#000000', '#ffffff',
  '#696969', '#e3e3e3', '#000000', '#ffffe1'];
function vbColor(v) {
  if (v === undefined || v === null || v === '') return null;
  let n;
  const s = String(v).trim();
  const m = /^&H([0-9A-F]+)&?$/i.exec(s);
  if (m) n = parseInt(m[1], 16); else n = Number(s);
  if (isNaN(n)) return null;
  if (n < 0) n = n >>> 0;
  if (n >= 0x80000000) return SYS_COLORS[n & 0xff] || '#f0f0f0';
  const r = n & 0xff, g = (n >> 8) & 0xff, b = (n >> 16) & 0xff;
  return `rgb(${r},${g},${b})`;
}
function vbFont(f) {
  if (!f) return '"Microsoft Sans Serif", Arial, sans-serif';
  if (f === 'MS Sans Serif') return '"Microsoft Sans Serif", Arial, sans-serif';
  if (f === 'Courier') return '"Courier New", monospace';
  if (/^DV/.test(f)) return `'${f}', 'DVBW-TTSurekh'`;
  return `"${f}", Arial, sans-serif`;
}
const isDvb = f => /^DV/.test(f || '');
const DVB_SCALE = 1.12;
// U+00AD is the letter na in the DVB fonts, but a browser hides it as a soft hyphen. The same glyph is at U+2212 in the
// DVB-TT fonts; the DVBW-TT fonts have no U+00AD and draw na at U+00AE.
const dvbSoftNa = (t, f) => (/^DVBW/i.test(f || '') ? String(t).replace(/\u00AD/g, '\u00AE') : /^DVB/i.test(f || '') ? String(t).replace(/\u00AD/g, '\u2212') : String(t));
const dvbScale = (f, s) => (isDvb(f) && (s || 8.25) < 20 ? DVB_SCALE : 1);   // headings (20 pt and up) stay as they are

// ------------------------------------------------------------------ dates (VB text boxes use dd/mm/yyyy)
const VBDate = {
  /** dd/mm/yyyy or dd-mm-yyyy (2 or 4 digit year) -> yyyy-mm-dd, '' if invalid */
  iso(t) {
    const m = /^\s*(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2}|\d{4})\s*$/.exec(t || '');
    if (!m) return /^\d{4}-\d{2}-\d{2}/.test(t || '') ? String(t).slice(0, 10) : '';
    let [, d, mo, y] = m; if (y.length === 2) y = '20' + y;
    const dt = new Date(+y, +mo - 1, +d);
    if (dt.getFullYear() !== +y || dt.getMonth() !== +mo - 1 || dt.getDate() !== +d) return '';
    return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  },
  text(iso) { if (!iso) return ''; const s = String(iso).slice(0, 10).split('-'); return s.length === 3 ? `${s[2]}/${s[1]}/${s[0]}` : String(iso); }
};

/** Calendar button next to a dd/mm/yyyy text box: opens the browser's date picker (PC and phone) and
 *  writes the chosen date back into the box as dd/mm/yyyy. */
function vbCalendar(input) {
  const pick = h('input', { type: 'date', class: 'vb-cal-pick', tabindex: '-1', 'aria-hidden': 'true' });
  const btn = h('button', { type: 'button', class: 'vb-cal-btn', tabindex: '-1', title: 'Calendar' }, '📅');
  if (input.style.position === 'absolute' || getComputedStyle(input).position === 'absolute' || input.style.left) {
    const x = parseFloat(input.style.left) || 0, y = parseFloat(input.style.top) || 0, w = parseFloat(input.style.width) || 100, ht = parseFloat(input.style.height) || 21;
    Object.assign(btn.style, { left: (x + w + 3) + 'px', top: y + 'px', height: Math.max(ht, 22) + 'px', width: Math.max(ht, 24) + 'px' });
    Object.assign(pick.style, { left: x + 'px', top: (y + ht) + 'px' });
  }
  btn.addEventListener('mousedown', e => e.preventDefault());
  btn.addEventListener('click', () => {
    if (input.disabled || input.readOnly) return;
    pick.value = VBDate.iso(input.value) || '';
    try { pick.showPicker(); } catch { pick.focus(); pick.click(); }
  });
  pick.addEventListener('change', () => {
    if (!pick.value) return;
    input.value = VBDate.text(pick.value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.focus();
  });
  input.after(btn, pick);
  return btn;
}

// ------------------------------------------------------------------ txtcbo: text box + drop down list, filters by code or name
function vbCombo(opts = {}) {
  let items = [];        // [{v, t, e?}]  value, display text, extra search text
  let selected = null;
  let shown = [], hi = -1;
  const input = h('input', { type: 'text', class: 'vb-cbo-text', autocomplete: 'off', spellcheck: 'false' });
  const arrow = h('button', { type: 'button', class: 'vb-cbo-btn', tabindex: '-1' }, '▼');
  const el = h('div', { class: 'vb-combo' }, input, arrow);
  const list = h('div', { class: 'vb-cbo-list' });
  const listeners = [];
  let font = '';
  const keys = new Map();  // DVB text -> search key

  const open = () => {
    if (!list.isConnected) document.body.appendChild(list);
    const r = el.getBoundingClientRect();
    list.style.left = r.left + 'px';
    list.style.minWidth = Math.max(r.width, opts.listWidth || 0) + 'px';
    // visible height: on a phone the on-screen keyboard covers the bottom of the window
    const vv = window.visualViewport, vh = vv ? vv.height + vv.offsetTop : window.innerHeight;
    const below = vh - r.bottom;
    list.style.maxHeight = Math.max(120, Math.min(320, below > 150 || below > r.top ? below - 8 : r.top - 8)) + 'px';
    if (below > 150 || below > r.top) { list.style.top = r.bottom + 'px'; list.style.bottom = ''; }
    else { list.style.top = ''; list.style.bottom = (window.innerHeight - r.top) + 'px'; }
    list.style.fontFamily = font; list.style.fontSize = input.style.fontSize;
    list.style.display = 'block';
  };
  const close = () => { list.style.display = 'none'; };
  const isOpen = () => list.style.display === 'block';
  const render = () => {
    list.replaceChildren(...shown.map((it, i) => h('div', {
      class: 'vb-cbo-item' + (i === hi ? ' hi' : ''),
      onmousedown: e => { e.preventDefault(); choose(it); close(); }
    }, opts.showCode ? h('span', { class: 'vb-cbo-code' }, it.v) : null, h('span', null, it.t))));
    const cur = list.children[hi];
    if (cur) cur.scrollIntoView({ block: 'nearest' });
  };
  const filter = q => {
    q = (q || '').trim();
    if (!q) { shown = items.slice(); hi = selected ? shown.indexOf(selected) : -1; return; }
    if (/^\d+$/.test(q)) {
      shown = items.filter(it => String(it.v).startsWith(q))
        .sort((a, b) => (String(a.v) === q ? -1 : 0) - (String(b.v) === q ? -1 : 0) || Number(a.v) - Number(b.v));
      if (!shown.length) shown = items.filter(it => (it.t || '').includes(q));
    } else if (typeof DVBSearch !== 'undefined' && DVBSearch.hasDevanagari(q)) {
      // Marathi typed in Unicode (phone keyboard) against names stored in the DVB font encoding
      shown = items.filter(it => DVBSearch.match(it.t, q, keys));
      shown.sort((a, b) => (DVBSearch.startsWith(b.t, q, keys) ? 1 : 0) - (DVBSearch.startsWith(a.t, q, keys) ? 1 : 0));
    } else {
      const lq = q.toLowerCase();
      shown = items.filter(it => (it.t || '').toLowerCase().includes(lq) || (it.e || '').toLowerCase().includes(lq));
      shown.sort((a, b) => ((b.t || '').toLowerCase().startsWith(lq) ? 1 : 0) - ((a.t || '').toLowerCase().startsWith(lq) ? 1 : 0));
    }
    hi = shown.length ? 0 : -1;
  };
  const fire = () => listeners.forEach(f => f(selected ? selected.v : null, selected));
  const choose = (it, silent) => {
    const changed = it !== selected;
    selected = it || null;
    input.value = selected ? selected.t : '';
    if (changed && !silent) fire();
  };
  const commitTyped = () => {
    const q = input.value.trim();
    if (!q) { if (selected) choose(null); return; }
    if (selected && q === selected.t) return;
    let it = items.find(x => String(x.v) === q) || items.find(x => x.t === q);
    if (!it && isOpen() && hi >= 0) it = shown[hi];
    if (it) choose(it); else input.value = selected ? selected.t : '';
  };

  input.addEventListener('input', () => { filter(input.value); open(); render(); });
  input.addEventListener('focus', () => { input.select(); });
  input.addEventListener('blur', () => { commitTyped(); close(); });
  arrow.addEventListener('mousedown', e => { e.preventDefault(); if (isOpen()) close(); else { input.focus(); filter(''); open(); render(); } });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); e.stopPropagation();
      if (!isOpen()) { filter(''); open(); }
      else if (shown.length) hi = (hi + (e.key === 'ArrowDown' ? 1 : -1) + shown.length) % shown.length;
      render();
    } else if (e.key === 'Enter') {
      if (isOpen() && hi >= 0) choose(shown[hi]); else commitTyped();
      close();
    } else if (e.key === 'Escape') { if (isOpen()) { e.stopPropagation(); close(); input.value = selected ? selected.t : ''; } }
  });
  const follow = e => { if (!isOpen() || (e && list.contains(e.target))) return; if (document.activeElement === input) open(); else close(); };
  window.addEventListener('scroll', follow, true);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', follow);

  const api = {
    el, input,
    setItems(list2, keep = true) {
      const v = selected ? selected.v : null;
      items = list2.map(x => ({ v: x.v, t: x.t == null ? '' : String(x.t), e: x.e }));
      selected = null;
      if (keep && v !== null) { const it = items.find(x => String(x.v) === String(v)); if (it) { selected = it; } }
      input.value = selected ? selected.t : '';
    },
    get items() { return items; },
    get value() { return selected ? selected.v : null; },
    set value(v) { choose(v === null || v === undefined || v === '' ? null : items.find(x => String(x.v) === String(v)) || null, true); },
    get item() { return selected; },
    get text() { return input.value; },
    clear() { choose(null, true); },
    onChange(f) { listeners.push(f); return api; },
    focus() { input.focus(); },
    setFont(f, s) { font = f; input.style.fontFamily = f; if (s) input.style.fontSize = s; },
    set disabled(b) { input.disabled = b; arrow.disabled = b; },
    get disabled() { return input.disabled; }
  };
  return api;
}

// ------------------------------------------------------------------ ListView (report view with VB column headers)
// phones / touch screens have no double click: a single tap loads the row (VB ListView DblClick)
let lvTouch = false, lvFitInfo = null;
document.addEventListener('pointerdown', e => { lvTouch = e.pointerType === 'touch' || e.pointerType === 'pen'; }, true);
const lvTap = () => lvTouch || (typeof VBMobile !== 'undefined' && VBMobile.is());
function vbListView(def) {
  const cols = def.cols || [];
  const head = h('div', { class: 'vb-lv-head' });
  const body = h('div', { class: 'vb-lv-body' });
  const el = h('div', { class: 'vb-listview', tabindex: '0' }, head, body);
  const widths = cols.map(c => c.w);
  head.append(...cols.map((c, i) => h('div', { class: 'vb-lv-th', style: { width: widths[i] + 'px', display: widths[i] ? '' : 'none' } }, c.t)));
  let rows = [], selIdx = -1, onDbl = null, onSel = null, rowOpt = {};
  // No sideways scrolling: when the VB column widths are wider than the list, every column gets the width of its
  // longest text (header included), shrunk proportionally if that is still too wide.
  let cur = widths.slice();
  const canvas = document.createElement('canvas').getContext('2d');
  const textW = (t, font) => { canvas.font = font; return canvas.measureText(String(t)).width; };
  const fit = () => {
    const avail = body.clientWidth;
    if (!avail) return;
    const vbTotal = widths.reduce((a, b) => a + b, 0);
    let ws = widths.slice();
    if (vbTotal > avail) {
      const thFont = getComputedStyle(head).font;
      const sample = body.querySelector('.vb-lv-td');
      const tdStyle = sample ? getComputedStyle(sample) : getComputedStyle(body);
      const pad = parseFloat(tdStyle.paddingLeft) + parseFloat(tdStyle.paddingRight) + 3;
      ws = cols.map((c, i) => {
        if (!widths[i]) return 0;
        const font = tdStyle.fontWeight + ' ' + tdStyle.fontSize + ' ' + (rowOpt.fonts && rowOpt.fonts[i] ? rowOpt.fonts[i] : tdStyle.fontFamily);
        let m = textW(c.t, thFont);
        for (let r = 0; r < rows.length && r < 300; r++) { const v = rows[r][i]; if (v !== null && v !== undefined && v !== '') m = Math.max(m, textW(v, font)); }
        return Math.ceil(m + pad);
      });
      const need = ws.reduce((a, b) => a + b, 0);
      if (need <= avail) { const k = avail / need; ws = ws.map(w => Math.floor(w * k)); }   // spread the spare room
      else {
        // still too wide: take the room from the widest columns first, so short ones (shift, fat, snf) stay whole
        let over = need - avail;
        const order = ws.map((w, i) => i).sort((a, b) => ws[b] - ws[a]);
        while (over > 0) { const i = order.find(j => ws[j] >= ws[order[0]] - 1); ws[i]--; over--; order.sort((a, b) => ws[b] - ws[a]); }
      }
      lvFitInfo = { avail, need };
    }
    cur = ws;
    head.style.paddingRight = Math.max(0, body.offsetWidth - body.clientWidth) + 'px';   // header above the scrollbar
    Array.from(head.children).forEach((th, i) => { th.style.width = cur[i] + 'px'; });
    for (const tr of body.children) Array.from(tr.children).forEach((td, i) => { td.style.width = cur[i] + 'px'; });
  };
  if (window.ResizeObserver) new ResizeObserver(() => fit()).observe(body);
  const align = i => (cols[i] && cols[i].al === 1 ? 'right' : cols[i] && cols[i].al === 2 ? 'center' : 'left');
  const api = {
    el,
    /** data: array of rows; each row an array of cell values (index = column). cellFont: optional per-column font. */
    setRows(data, opt = {}) {
      rows = data; selIdx = -1; rowOpt = opt;
      body.replaceChildren(...data.map((r, ri) => {
        const tr = h('div', { class: 'vb-lv-tr' }, cols.map((c, i) => h('div', {
          class: 'vb-lv-td' + (opt.mr && opt.mr.includes(i) ? ' mr' : ''),
          style: { width: cur[i] + 'px', display: widths[i] ? '' : 'none', textAlign: align(i), fontFamily: opt.fonts && opt.fonts[i] ? opt.fonts[i] : null }
        }, r[i] === null || r[i] === undefined ? '' : r[i])));
        tr.addEventListener('click', () => {
          api.select(ri);
          if (!lvTap() || !onDbl) return;
          onDbl(rows[ri], ri);
          // phone: the list is below the entry fields, so go back up to the loaded record
          if (VBMobile.is()) { const f = el.closest('.vbform'); if (f) setTimeout(() => f.scrollIntoView({ block: 'start' }), 150); }
        });
        tr.addEventListener('dblclick', () => { api.select(ri); onDbl && onDbl(rows[ri], ri); });
        return tr;
      }));
      fit();
    },
    select(i) {
      $$('.vb-lv-tr.sel', body).forEach(x => x.classList.remove('sel'));
      selIdx = i;
      const tr = body.children[i]; if (tr) { tr.classList.add('sel'); tr.scrollIntoView({ block: 'nearest' }); }
      onSel && onSel(rows[i], i);
    },
    get selected() { return selIdx >= 0 ? rows[selIdx] : null; },
    get rows() { return rows; },
    onDblClick(f) { onDbl = f; return api; },
    onSelect(f) { onSel = f; return api; },
    clear() { api.setRows([]); }
  };
  el.addEventListener('keydown', e => {
    if (!rows.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); api.select(Math.min(rows.length - 1, selIdx + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); api.select(Math.max(0, selIdx - 1)); }
    else if (e.key === 'Enter' && selIdx >= 0) { e.preventDefault(); e.stopPropagation(); onDbl && onDbl(rows[selIdx], selIdx); }
  });
  return api;
}

// ------------------------------------------------------------------ key validation (CHECK_VALIDATION_KEY_LEVEL)
/** Phones show the number pad on number boxes, and Next on the keyboard moves on. Dates get their / by themselves. */
function vbKeypad(input, d) {
  const tag = String(d.tag || '').toUpperCase(), n = d.n || '';
  input.setAttribute('enterkeyhint', 'next');
  if (/date/i.test(n) || tag === 'D') { input.setAttribute('inputmode', 'numeric'); vbDateSlash(input); return; }
  if (tag === 'F' || tag === '997' || /^(txt)?(rate|diff|jump|bag|ndeduction_amount|nltr|nfat|nsnf|mltr|eltr|tltr)/i.test(n)) { input.setAttribute('inputmode', 'decimal'); return; }
  if (tag === 'N' || tag === '131' || tag === 'Y' || tag === '999' || tag === '135' || /fortno$/i.test(n)) input.setAttribute('inputmode', 'numeric');
}
function vbDateSlash(input) {
  if (!navigator.maxTouchPoints) return;   // keyboards with a / key are left alone
  input.addEventListener('input', e => {
    if (e.inputType && e.inputType.startsWith('delete')) return;
    const d = input.value.replace(/\D/g, '').slice(0, 8);
    let v = d.slice(0, 2);
    if (d.length >= 2) v += '/' + d.slice(2, 4);
    if (d.length >= 4) v += '/' + d.slice(4);
    if (v !== input.value) { input.value = v; input.setSelectionRange(v.length, v.length); }
  });
}
function vbKeyFilter(input, tag) {
  tag = String(tag || '').toUpperCase();
  input.dataset.tag = tag;
  input.addEventListener('keypress', e => {
    const ch = e.key;
    if (ch.length !== 1) return;
    const v = input.value;
    let ok = true;
    if (tag === '131' || tag === 'N') ok = /\d/.test(ch);
    else if (tag === '135' || tag === 'D') ok = /[\d\/\-]/.test(ch) && !(ch === '/' && (v.match(/[\/\-]/g) || []).length >= 2);
    else if (tag === '997' || tag === 'F') ok = /\d/.test(ch) || (ch === '.' && !v.includes('.'));
    else if (tag === '999' || tag === 'Y') {
      ok = /\d/.test(ch) || (ch === '-' && v.length === 4);
      if (ok && /\d/.test(ch) && input.selectionStart === 3 && v.length === 3) { // VB: typing the 4th digit fills "2026-2027"
        e.preventDefault(); const y = Number(v + ch); input.value = `${y}-${y + 1}`; return;
      }
    } else if (tag === '998' || tag === 'C') {
      ok = /[A-Za-z .\/]/.test(ch);
      if (ok && /[a-z]/.test(ch)) { e.preventDefault(); input.setRangeText(ch.toUpperCase(), input.selectionStart, input.selectionEnd, 'end'); return; }
    } else if (tag === '300') ok = /\d/.test(ch) || (ch === '-' && !v.endsWith('-'));
    if (!ok) e.preventDefault();
  });
}

// ------------------------------------------------------------------ form renderer
function vbForm(key, opts = {}) {
  const def = VBF[key];
  if (!def) throw new Error('Unknown VB form ' + key);
  const softNa = (l, pf) => l.forEach(d => { const f = d.f || pf; if (d.cap) d.cap = dvbSoftNa(d.cap, f); if (d.kids) softNa(d.kids, f); });
  softNa(def.c, def.f);
  const c = {};       // control name -> element (or combo / listview api)
  const meta = {};    // control name -> definition
  const ff = def.f, fs = def.s;
  const isPlaceholder = (d, text) => !text || text === d.n || /^Label\d+$/.test(text) || /^Text\d+$/.test(text) || /^txt\w+$/i.test(text);

  function style(el, d, inheritF, inheritS) {
    Object.assign(el.style, { left: d.x + 'px', top: d.y + 'px', width: d.w + 'px', height: d.h + 'px' });
    const f = d.f || inheritF, s = d.s || inheritS;
    el.style.fontFamily = vbFont(f);
    // Marathi (DVB fonts) looks smaller on screen than in VB: a little bigger and bold everywhere
    const dvb = isDvb(f);
    el.style.fontSize = ((s || 8.25) * (/Button|ListView/.test(d.t) ? 1 : dvbScale(f, s))).toFixed(2) + 'pt';   // buttons / lists: room is tight, bold only
    if (dvb) el.classList.add('vb-dvb');
    // Text boxes / combos: the DVB-TT fonts draw much taller than their point size (matras above, conjuncts
    // below), so the size is capped to what fits inside the box height - like the VB text box shows it.
    if ((d.t === 'TextBox' || d.t === 'txtcbo') && d.h > 0) {
      const px = (s || 8.25) * dvbScale(f, s) * 96 / 72;
      const fit = Math.max(10, (d.h - 6) * (dvb ? 0.7 : 0.78));
      if (px > fit) el.style.fontSize = fit.toFixed(1) + 'px';
    }
    if (d.b || (dvb && d.t !== 'ListView')) el.style.fontWeight = 'bold';   // lists: no room for bold columns
    if (d.fg) el.style.color = vbColor(d.fg);
    if (d.hid) el.style.display = 'none';
  }

  function build(list, parent, inheritF, inheritS) {
    // VB: labels / lines are drawn below windowed controls of the same container
    const light = list.filter(d => d.t === 'Label' || d.t === 'Line' || d.t === 'Shape' || d.t === 'Image');
    const heavy = list.filter(d => !light.includes(d));
    for (const d of light.concat(heavy)) {
      let el = null, api = null;
      switch (d.t) {
        case 'Frame': case 'PictureBox': case 'SSTab': {
          el = h('div', { class: d.t === 'Frame' ? 'vb-frame' + (d.bs === 0 ? ' noborder' : '') : 'vb-pic' });
          if (d.bg) el.style.background = vbColor(d.bg);
          if (d.t === 'Frame' && d.cap) el.appendChild(h('span', { class: 'vb-frame-cap', style: { background: el.style.background } }, d.cap));
          if (d.kids) build(d.kids, el, d.f || inheritF, d.s || inheritS);
          break;
        }
        case 'Label': {
          const text = isPlaceholder(d, d.cap) && !(opts.keepCaptions || []).includes(d.n) ? '' : d.cap;
          el = h('div', { class: 'vb-label' }, text);
          el.style.background = d.bk === 0 ? 'transparent' : (vbColor(d.bg) || 'transparent');
          if (d.al === 1) el.style.textAlign = 'right'; else if (d.al === 2) el.style.textAlign = 'center';
          if (d.bs === 1) el.classList.add('vb-label-border');
          if (d.bk !== 0 && d.bg && !text) el.classList.add('vb-label-box'); // value display (e.g. rate / amount)
          break;
        }
        case 'TextBox': {
          el = h('input', { type: d.pw ? 'password' : 'text', class: 'vb-text', autocomplete: 'off', spellcheck: 'false' });
          if (d.ml) el.maxLength = d.ml;
          if (d.bg) el.style.background = vbColor(d.bg);
          if (d.al === 1) el.style.textAlign = 'right'; else if (d.al === 2) el.style.textAlign = 'center';
          if (d.tag) vbKeyFilter(el, d.tag);
          vbKeypad(el, d);
          if (d.dis) el.disabled = true;
          if (d.lock) el.readOnly = true;
          break;
        }
        case 'txtcbo': {
          api = vbCombo({ showCode: (opts.comboCodes || []).includes(d.n), listWidth: (opts.comboWidth || {})[d.n] });
          el = api.el;
          {
            // same size rule as style(): Marathi a little bigger, capped to the box height
            const f = d.f || inheritF, dvb = isDvb(f);
            let px = (d.s || inheritS || 8.25) * dvbScale(f, d.s || inheritS) * 96 / 72;
            if (d.h > 0) px = Math.min(px, Math.max(10, (d.h - 6) * (dvb ? 0.7 : 0.78)));
            api.setFont(vbFont(f), px.toFixed(1) + 'px');
            if (dvb) api.input.style.fontWeight = 'bold';
          }
          if (d.dis) api.disabled = true;
          break;
        }
        case 'CommandButton': case 'MyButton': case 'CheckBox': case 'OptionButton': {
          el = h('button', { type: 'button', class: 'vb-btn' }, d.cap || '');
          if ((d.st === 1 || d.t === 'MyButton') && d.bg) el.style.background = vbColor(d.bg);
          if (d.dis) el.disabled = true;
          break;
        }
        case 'ListView': {
          api = vbListView(d);
          el = api.el;
          if (d.bg) el.style.background = vbColor(d.bg);
          break;
        }
        case 'MyGrid': case 'MSFlexGrid': case 'MSHFlexGrid': case 'DataGrid':
          el = h('div', { class: 'vb-grid' });
          break;
        case 'Line':
          if (d.x2 === d.x && d.y2 === d.y) continue;
          el = h('div', { class: 'vb-line' });
          Object.assign(el.style, { left: Math.min(d.x, d.x2) + 'px', top: Math.min(d.y, d.y2) + 'px', width: Math.max(1, Math.abs(d.x2 - d.x)) + 'px', height: Math.max(1, Math.abs(d.y2 - d.y)) + 'px' });
          parent.appendChild(el);
          continue;
        default:
          continue; // Animation, CrystalReport, timers, common dialogs ... not drawn
      }
      el.classList.add('vbc');
      style(el, d, inheritF, inheritS);
      if (d.ti !== undefined && ['TextBox', 'txtcbo', 'CommandButton', 'MyButton', 'ListView'].includes(d.t)) {
        const focusEl = api && api.input ? api.input : el;
        focusEl.dataset.ti = d.ti;
        if (d.nts) focusEl.dataset.nts = '1';
        if (d.dis) focusEl.dataset.dis = '1';
      }
      if (d.t === 'txtcbo') { api.input.style.fontSize = el.style.fontSize; }
      el.dataset.vbn = d.n;
      parent.appendChild(el);
      c[d.n] = api || el;
      meta[d.n] = d;
    }
  }

  const surface = h('div', { class: 'vbform-surface' });
  Object.assign(surface.style, { width: def.w + 'px', height: def.h + 'px', background: vbColor(def.bg) || '#f0f0f0',
    fontFamily: vbFont(ff), fontSize: (fs || 8.25) + 'pt' });
  build(def.c, surface, ff, fs);

  const title = opts.title !== undefined ? opts.title : def.caption;
  const win = h('div', { class: 'vbform' + (opts.noTitle ? ' notitle' : '') },
    opts.noTitle ? null : h('div', { class: 'vbform-title' }, h('span', null, title), h('button', { type: 'button', class: 'vbform-x', tabindex: '-1', title: 'Close', onclick: () => F.close() }, '✕')),
    surface);
  win.dataset.vbform = key;

  const elOf = n => { const x = c[n]; return x && x.el ? x.el : x; };
  const F = {
    el: win, surface, c, meta, def,
    show(n, b = true) { const e = elOf(n); if (e) e.style.display = b ? '' : 'none'; },
    shown(n) { const e = elOf(n); return !!e && e.style.display !== 'none'; },
    /** VB Enabled for frames: enables / disables every control inside (except the ones disabled in the designer). */
    enable(n, b = true) {
      const e = elOf(n); if (!e) return;
      const targets = e.matches('input,button,select') ? [e] : $$('input,button,select', e);
      if (c[n] && c[n].input) targets.push(c[n].input);
      targets.forEach(t => { if (t.dataset.dis === '1' && !t.closest('[data-force]')) return; t.disabled = !b; });
      e.classList.toggle('vb-disabled', !b);
    },
    move(n, x, y) { const e = elOf(n); if (!e) return; if (x !== null && x !== undefined) e.style.left = x + 'px'; if (y !== null && y !== undefined) e.style.top = y + 'px'; },
    text(n, v) { const e = elOf(n); if (!e) return; if (e.tagName === 'INPUT') e.value = v ?? ''; else if (c[n].input) c[n].value = v; else e.textContent = v ?? ''; },
    val(n) { const x = c[n]; if (!x) return ''; if (x.input) return x.value; return x.value !== undefined ? x.value.trim() : x.textContent; },
    on(n, ev, f) { const e = c[n] && c[n].input ? c[n].input : elOf(n); if (e) e.addEventListener(ev, f); return F; },
    click(n, f) { return F.on(n, 'click', f); },
    focus(n) { const x = c[n]; if (!x) return; const e = x.input || x.el || x; if (e && e.focus) { e.focus(); if (e.select && e.tagName === 'INPUT') e.select(); } },
    close() { if (opts.onClose) opts.onClose(); else nav('#/home'); },
    /** clears every text box (VB: For Each txt ... txt.Text = "") */
    clearTexts(except = []) { Object.entries(c).forEach(([n, x]) => { if (x && x.tagName === 'INPUT' && !except.includes(n)) x.value = ''; }); }
  };
  // Close / Exit buttons and the window X close the form even while a text box with LostFocus code has focus
  const exitNames = ['cmdExit', 'Cmdclose', 'fbillexit', 'cmd_exit', 'cmdCancel'].filter(n => n !== 'cmdCancel' || key === 'logon');
  const exits = exitNames.map(n => c[n]).filter(Boolean).concat(Array.from(win.querySelectorAll('.vbform-x')));
  exits.forEach(b => b.addEventListener('mousedown', e => e.preventDefault()));
  if (VBMobile.is()) vbMakeMobile(F);
  return F;
}

// Enter = next control by TabIndex (Form_KeyPress SendKeys "{tab}"), arrow up/down = GotoNext/PreviousControl
function vbFocusable(root) {
  return $$('[data-ti]', root).filter(x => !x.disabled && !x.readOnly && x.dataset.nts !== '1' && x.offsetParent !== null)
    .sort((a, b) => Number(a.dataset.ti) - Number(b.dataset.ti));
}
function vbNext(from, dir) {
  const root = from.closest('.vbform-surface') || from.closest('.modal');
  if (!root) return;
  const list = vbFocusable(root);
  let i = list.indexOf(from);
  if (i < 0) { const ti = Number(from.dataset.ti || -1); i = list.findIndex(x => Number(x.dataset.ti) > ti) - (dir > 0 ? 1 : 0); }
  const n = list[i + dir];
  if (n) { n.focus(); if (n.select && n.tagName === 'INPUT') n.select(); }
}
document.addEventListener('keydown', e => {
  const t = e.target;
  if (!(t instanceof HTMLElement) || !t.closest('.vbform-surface')) return;
  if (t.tagName === 'BUTTON' && e.key === 'Enter') return; // Enter on a button clicks it
  if (!(t.tagName === 'INPUT' || t.tagName === 'SELECT')) return;
  let dir = 0;
  if (e.key === 'Enter') dir = e.shiftKey ? -1 : 1;
  else if (e.key === 'ArrowDown' && !t.classList.contains('vb-cbo-text')) dir = 1;
  else if (e.key === 'ArrowUp' && !t.classList.contains('vb-cbo-text')) dir = -1;
  if (!dir) return;
  e.preventDefault();
  vbNext(t, dir); // immediately, so the next typed key lands in the next box (LostFocus code runs on blur)
});

// ------------------------------------------------------------------ mobile: re-flow the VB form into rows
/** Phones / small tablets in portrait: the VB form (900-1000 px wide) would be unreadable when shrunk, so the
 *  controls are re-flowed: every visual row of the VB form (label + text box ...) becomes one full-width line,
 *  frames become stacked sections. TabIndex order, events and captions stay exactly the same. */
const VBMobile = {
  is: () => Math.min(window.innerWidth, document.documentElement.clientWidth || 9999) < 760,
  mode: null
};
VBMobile.mode = VBMobile.is();
// On-screen keyboard: the box being typed in stays in the free part of the screen, whatever the phone does with the page
(() => {
  const vv = window.visualViewport;
  const isBox = e => e && e.matches && e.matches('input:not([type=checkbox]), textarea, select');
  const scroller = e => {
    for (let p = e.parentElement; p; p = p.parentElement) {
      const o = getComputedStyle(p).overflowY;
      if ((o === 'auto' || o === 'scroll') && p.scrollHeight > p.clientHeight + 1) return p;
    }
    return document.scrollingElement;
  };
  const reveal = () => {
    const a = document.activeElement;
    if (!isBox(a) || !VBMobile.is()) return;
    const r = a.getBoundingClientRect();
    const head = document.querySelector('.mdi-menu');
    const top = Math.max(vv ? vv.offsetTop : 0, head ? head.getBoundingClientRect().bottom : 0) + 6;
    const bottom = (vv ? vv.offsetTop + vv.height : window.innerHeight) - 6;
    if (r.top >= top && r.bottom <= bottom) return;
    // to the upper third of the free part: the keyboard may still be opening
    const box = scroller(a);
    box.scrollTop += r.top - (top + (bottom - top) / 3);
    const again = a.getBoundingClientRect();
    if (again.top < top || again.bottom > bottom) window.scrollBy(0, again.top - (top + (bottom - top) / 3));
  };
  document.addEventListener('focusin', e => {
    if (!VBMobile.is() || !isBox(e.target)) return;
    document.body.classList.add('kb-open');     // room below the last boxes, so they can move up
    [60, 300, 600, 1000].forEach(ms => setTimeout(reveal, ms));
  });
  document.addEventListener('focusout', () => setTimeout(() => { if (!isBox(document.activeElement)) document.body.classList.remove('kb-open'); }, 150));
  if (vv) vv.addEventListener('resize', () => setTimeout(reveal, 30));
  window.addEventListener('resize', () => setTimeout(reveal, 30));
})();
function vbReflow(container) {
  const kids = Array.from(container.children).filter(e => e.classList.contains('vbc'));
  kids.forEach(k => { if (k.classList.contains('vb-frame') || k.classList.contains('vb-pic')) vbReflow(k); });
  const items = kids.filter(e => !e.classList.contains('vb-line'))
    .map(e => ({ e, x: parseFloat(e.style.left) || 0, y: parseFloat(e.style.top) || 0, h: parseFloat(e.style.height) || 20 }))
    .sort((a, b) => a.y - b.y || a.x - b.x);
  const rows = [], tail = [];
  const isBox = e => e.classList.contains('vb-frame') || e.classList.contains('vb-pic');
  for (const it of items) {
    // tall controls get their own row: frames stay in place, lists / grids go after the entry fields
    if (it.h > 90 || isBox(it.e)) {
      const own = { items: [it], bottom: -1, h: it.h, own: true };
      if (isBox(it.e)) rows.push(own); else tail.push(own);
      continue;
    }
    const r = rows.length && !rows[rows.length - 1].own ? rows[rows.length - 1] : null;
    // same row when it overlaps the current row by at least half of the smaller height
    if (r && it.y < r.bottom - Math.min(it.h, r.h) * 0.5) { r.items.push(it); r.bottom = Math.max(r.bottom, it.y + it.h); }
    else rows.push({ items: [it], bottom: it.y + it.h, h: it.h });
  }
  kids.filter(e => e.classList.contains('vb-line')).forEach(e => e.remove());
  for (const r of rows.concat(tail)) {
    const row = h('div', { class: 'vbm-row' });
    r.items.sort((a, b) => a.x - b.x).forEach(it => row.appendChild(it.e));
    container.appendChild(row);
  }
}
function vbMakeMobile(F) {
  F.el.classList.add('vb-mobile');
  $$('.vb-line', F.surface).forEach(e => e.remove());
  vbReflow(F.surface);
  F.move = () => { };                  // VB re-positions frames (fraFind.Top = ...); not needed in rows
}
// switching between phone and computer layout (rotate / resize) redraws the page
window.addEventListener('resize', () => {
  const m = VBMobile.is();
  if (VBMobile.mode !== null && m !== VBMobile.mode && typeof App !== 'undefined' && document.getElementById('main')) { VBMobile.mode = m; App.route(); }
  VBMobile.mode = m;
});

/** Scales a VB form so it exactly fills the available screen area (no scrolling), like a maximized VB window. */
function vbFit(win, area) {
  if (!win || !area || !win.isConnected) return;
  if (win.classList.contains('vb-mobile')) { win.style.zoom = 1; return; }
  win.style.zoom = 1;
  const w = win.offsetWidth, hgt = win.offsetHeight;
  const aw = area.clientWidth - 2, ah = area.clientHeight - 2;
  if (!w || !hgt || aw <= 0 || ah <= 0) return;
  win.style.zoom = Math.max(0.4, Math.min(aw / w, ah / hgt)).toFixed(4);
}
function vbFitAll() {
  const main = document.getElementById('main');
  $$('.mdi-page .vbform').forEach(f => vbFit(f, main));
  $$('.modal-back > .vbform').forEach(f => vbFit(f, f.parentElement));
  $$('.login-host > .vbform').forEach(f => vbFit(f, f.parentElement));
}
window.addEventListener('resize', () => vbFitAll());
document.addEventListener('fullscreenchange', () => setTimeout(vbFitAll, 100));
// forms placed in modal windows / login are fitted as soon as they appear
new MutationObserver(() => requestAnimationFrame(vbFitAll)).observe(document.body, { childList: true });

/** Places a VB form on the page (fitted to the screen). */
function vbPage(body, F) {
  body.replaceChildren(h('div', { class: 'vb-host' }, F.el));
  requestAnimationFrame(vbFitAll);
  return F;
}

/** Full screen (no browser bars): asked on Login and from the status bar button. */
const FullScreen = {
  on() { const d = document.documentElement; if (!document.fullscreenElement && d.requestFullscreen) d.requestFullscreen().catch(() => { /* not allowed */ }); },
  toggle() { if (document.fullscreenElement) document.exitFullscreen(); else FullScreen.on(); }
};
