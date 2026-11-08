/* Core helpers: API calls, DOM builder, formatting, message boxes, working session (HT_setup),
   Marathi report captions / amount in words and the report area (Crystal viewer replacement). */
'use strict';

// ------------------------------------------------------------------ API
const API = {
  base: ((window.APP_CONFIG && APP_CONFIG.apiBase) || '').replace(/\/$/, ''),
  token() { return sessionStorage.getItem('mb_token'); },
  qs(params) {
    if (!params) return '';
    const q = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&');
    return q ? '?' + q : '';
  },
  async req(method, url, body, params) {
    const headers = { 'Accept': 'application/json' };
    if (this.token()) headers['Authorization'] = 'Bearer ' + this.token();
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (window.MilkSms) { headers['X-Sms-Device'] = MilkSms.deviceId(); if (this.token()) MilkSms.setToken(this.token()); }
    let res;
    const send = () => fetch(this.base + url + this.qs(params), { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    try {
      res = await send();
    } catch (e) {
      // phone Wi-Fi often drops for a moment: a read is tried once more before the VB message
      if (method !== 'GET') throw new Error(' Error in connectivity to DataBase ');
      await new Promise(r => setTimeout(r, 1500));
      try { res = await send(); } catch { throw new Error(' Error in connectivity to DataBase '); }
    }
    if (res.status === 401 && url !== '/api/auth/login') { App.logout(); throw new Error('Session expired. Please login again.'); }
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) { const err = new Error((data && data.message) || ('Error ' + res.status)); err.status = res.status; throw err; }
    return data;
  },
  get(url, params) { return this.req('GET', url, undefined, params); },
  post(url, body) { return this.req('POST', url, body || {}); },
  del(url, params) { return this.req('DELETE', url, undefined, params); },
  async download(url, params) {
    const res = await fetch(this.base + url + this.qs(params), { headers: { 'Authorization': 'Bearer ' + this.token() } });
    if (!res.ok) { let msg = 'Error ' + res.status; try { msg = (await res.json()).message || msg; } catch { /* */ } throw new Error(msg); }
    const cd = res.headers.get('Content-Disposition') || '';
    const m = /filename\*=UTF-8''([^;]+)/i.exec(cd) || /filename="?([^";]+)"?/i.exec(cd);
    const name = m ? decodeURIComponent(m[1]) : 'download';
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
};

// ------------------------------------------------------------------ DOM builder
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'value') el.value = v;
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
  }
  const add = c => {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) c.forEach(add);
    else el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  };
  kids.forEach(add);
  return el;
}
const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
/** text stored / captioned in the DVB-TT encoding */
const mr = text => h('span', { class: 'mr' }, text == null ? '' : text);

// ------------------------------------------------------------------ formatting
const Fmt = {
  iso(v) { return v ? String(v).slice(0, 10) : ''; },
  date(v) { return VBDate.text(Fmt.iso(v)); },
  today() { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); },
  addDays(iso, n) { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); },
  n(v, d = 2) { if (v === null || v === undefined || v === '') return ''; const x = Number(v); return isNaN(x) ? String(v) : x.toFixed(d); },
  money(v) { if (v === null || v === undefined || v === '') return ''; return Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); },
  num(v) { if (v === null || v === undefined) return null; const s = String(v).trim().replace(/,/g, ''); if (s === '') return null; const x = Number(s); return isNaN(x) ? null : x; },
  val(v) { return Fmt.num(v) || 0; }, // VB Val()
  time(t) { return Number(t) === 1 ? MR.morning : Number(t) === 2 ? MR.evening : ''; },
  dairy(d) { return Number(d) === 1 ? MR.dairy1 : Number(d) === 2 ? MR.dairy2 : ''; },
  round(v, d = 2) { const p = Math.pow(10, d); return Math.round((Number(v) + Number.EPSILON) * p) / p; },
  /** VB shows dates as dd-mm-yyyy in ListViews (default ADO date format) */
  lv(v) { return v ? VBDate.text(Fmt.iso(v)) : ''; }
};
const sum = (rows, f) => rows.reduce((a, r) => a + (Number(typeof f === 'function' ? f(r) : r[f]) || 0), 0);
const avg = (rows, k) => { const v = rows.map(r => Number(r && r[k])).filter(x => x > 0); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0; };

// ------------------------------------------------------------------ message boxes (VB MsgBox)
const UI = {
  toast(msg, type = 'ok') {
    const t = h('div', { class: 'toast ' + type }, msg);
    $('#toasts').appendChild(t);
    setTimeout(() => t.classList.add('show'), 10);
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, type === 'err' ? 6000 : 2500);
  },
  modal(title, body, buttons) {
    return new Promise(resolve => {
      const prev = document.activeElement;
      const close = v => { back.remove(); if (prev && prev.focus && prev.isConnected) prev.focus(); resolve(v); };
      const btns = (buttons || [{ text: 'OK', value: true, primary: true }]).map(b =>
        h('button', { class: 'vb-btn msg-btn', type: 'button', onclick: () => close(b.value) }, b.text));
      const back = h('div', { class: 'modal-back' },
        h('div', { class: 'modal msgbox' }, h('div', { class: 'msg-title' }, title), h('div', { class: 'modal-body' }, body), h('div', { class: 'modal-actions' }, btns)));
      back.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); close(false); } });
      document.body.appendChild(back);
      btns[0].focus();
    });
  },
  alert(msg, title = 'Message') { return UI.modal(title, msg); },
  confirm(msg, title = 'Message') { return UI.modal(title, msg, [{ text: 'Yes', value: true }, { text: 'No', value: false }]); },
  /** hosts a VB form (e.g. HT_setup) in a modal window; resolve(value) closes it */
  dialog(F, start) {
    return new Promise(resolve => {
      const back = h('div', { class: 'modal-back' }, F.el);
      const done = v => { back.remove(); resolve(v); };
      document.body.appendChild(back);
      start(done);
    });
  },
  error(e) { console.error(e); UI.alert(e && e.message ? e.message : String(e)); },
  async busy(fn, text = 'Please wait...') {
    const ov = h('div', { class: 'busy' }, h('div', { class: 'spinner' }), h('div', null, text));
    document.body.appendChild(ov);
    try { return await fn(); } catch (e) { UI.error(e); return undefined; } finally { ov.remove(); }
  }
};

// ------------------------------------------------------------------ lookups (cached)
const Lookups = {
  cache: {},
  async get(name, force) {
    if (force || !this.cache[name]) this.cache[name] = await API.get('/api/lookups/' + name);
    return this.cache[name];
  },
  clear(name) { if (name) delete this.cache[name]; else this.cache = {}; },
  // combo item lists like SetComboData(...)
  async suppliers(force) { return (await this.get('suppliers', force)).map(s => ({ v: s.ncode, t: s.vname || '', e: s.eng_name || '' })); },
  async deductions(force) { return (await this.get('deductions', force)).map(d => ({ v: d.ndeduction_code, t: d.vdeduction_name || '' })); },
  async items(force) { return (await this.get('items', force)).map(d => ({ v: d.nprod_code, t: d.vprod_name || '' })); },
  async villages(force) { return (await this.get('villages', force)).map(d => ({ v: d.village_code, t: d.village_name || '' })); },
  async banks(force) { return (await this.get('banks', force)).map(d => ({ v: d.bank_code, t: d.bank_name || '' })); }
};
const TIME_ITEMS = () => [{ v: 1, t: MR.morning }, { v: 2, t: MR.evening }];
const DAIRY_ITEMS = () => [{ v: 1, t: MR.dairy1 }, { v: 2, t: MR.dairy2 }];

// ------------------------------------------------------------------ working session = HT_setup.frm
const Session = {
  get() { try { return JSON.parse(sessionStorage.getItem('mb_session')) || null; } catch { return null; } },
  set(s) { sessionStorage.setItem('mb_session', JSON.stringify(s)); App.renderStatus(); },
  clear() { sessionStorage.removeItem('mb_session'); },
  async choose(force) {
    const cur = this.get();
    for (;;) {
      const F = vbForm('setup', { title: 'Working Date' });
      F.c.Label1.textContent = MR.title;
      F.c.dmtime1.setItems(TIME_ITEMS());
      F.c.dmdate1.value = VBDate.text((cur && cur.date) || Fmt.today());
      vbCalendar(F.c.dmdate1);
      F.c.dmtime1.value = (cur && cur.time) || (new Date().getHours() < 13 ? 1 : 2);
      const r = await UI.dialog(F, done => {
        const ok = () => {
          const iso = VBDate.iso(F.c.dmdate1.value);
          if (!iso) { UI.alert('Invalid date'); return F.focus('dmdate1'); }
          if (!F.c.dmtime1.value) { UI.alert(' Incorrect Time  '); return F.focus('dmtime1'); }
          done({ iso, time: Number(F.c.dmtime1.value) });
        };
        F.c.dmtime1.input.addEventListener('keydown', e => { if (e.key === 'Enter') setTimeout(ok, 0); });
        F.el.querySelector('.vbform-x').onclick = () => done(null);
        F.surface.appendChild(h('div', { class: 'vb-dialog-btns' },
          h('button', { type: 'button', class: 'vb-btn', onclick: ok }, 'Ok'),
          (force && !cur) ? null : h('button', { type: 'button', class: 'vb-btn', onclick: () => done(null) }, 'Cancel')));
        F.focus('dmdate1');
      });
      if (!r) return false;
      if (await this.use(r.iso, r.time)) return true;
    }
  },
  /** working date + shift -> its fortnight (HT_setup cmdok); offers to create the fortnight when there is none */
  async use(iso, time, again = true) {
    try {
      const f = await API.get('/api/session/fortnight', { date: iso });
      this.set({ date: iso, time, nfortno: f.nfortno, vyear_code: f.vyear_code, dstart_date: Fmt.iso(f.dstart_date), dend_date: Fmt.iso(f.dend_date) });
      return true;
    } catch (e) {
      if (e.status === 404) {
        if (!again) return false;   // fortnight window closed without creating it
        if (await UI.confirm('Do you want to Create New Fortnight ?')) { await Pages.fortnightDialog(iso); return this.use(iso, time, false); }
      } else UI.error(e);
      return false;
    }
  },
  require() {
    const s = this.get();
    if (!s) throw new Error('Select working date first');
    return s;
  }
};

// ------------------------------------------------------------------ Marathi report captions (Unicode Devanagari)
const RM = {
  dailyReport: 'दैनिक दूध संकलन अहवाल', bill: 'दूध बिल', register: 'बिल रजिस्टर', bankList: 'बँक यादी', cashList: 'रोख यादी',
  letter: 'बँक पत्र', dailySummary: 'दिवसवार समरी', totalSummary: 'एकूण समरी', ledger: 'खतावणी', ypList: 'येणे-देणे यादी',
  feedLedger: 'पेंड खरेदी व वाटप', rateChart: 'दर तक्ता', fortnightList: 'पंधरवडा यादी', supplierList: 'सभासद यादी', deductionList: 'कपात यादी',
  sr: 'अ.नं.', code: 'कोड', name: 'नांव', engName: 'नांव इंग्रजी', ltr: 'लिटर', fat: 'फॅट', snf: 'एस.एन.एफ.', rate: 'दर', amount: 'रक्कम',
  total: 'एकूण', subTotal: 'पोट एकूण', cow: 'गाय', buffalo: 'म्हैस', other: 'इतर', date: 'दिनांक', morning: 'सकाळ', evening: 'संध्याकाळ',
  billNo: 'बिल नं.', acNo: 'खाते नं.', to: 'ते', opening: 'आरंभीची शिल्लक', recovered: 'वसूल', closing: 'अखेर शिल्लक',
  feed: 'पशुखाद्य', adv: 'अॅडव्हान्स', oth1: 'इतर - १', oth2: 'इतर - २', totalLtr: 'एकूण लिटर', avgRate: 'सरासरी दर',
  milkAmt: 'बिल रक्कम', bonus: 'बोनस अनामत', totalDed: 'एकूण कपात', net: 'निव्वळ देय', supSign: 'उत्पादकाची सही', secretary: 'सचिव',
  signature: 'सही', debit: 'नावे', credit: 'जमा', balance: 'शिल्लक', bags: 'पोती', narration: 'तपशिल', receivable: 'येणे', payable: 'देणे',
  count: 'संख्या', bills: 'बिले', fortnightNo: 'पंधरवडा नं.', year: 'वर्ष', fromDate: 'दिनांक पासून', toDate: 'दिनांक पर्यंत',
  billType: 'बिल प्रकार', dairy: 'डेअरी', mobile: 'मोबाईल नं.', village: 'गांव', priority: 'कपात क्रमवारी', perLtr: 'प्रती लिटर',
  fatSnf: 'फॅट / एस.एन.एफ.', noData: 'माहिती उपलब्ध नाही', print: 'प्रिंट', close: 'बंद', item: 'माल', fortnight: 'पंधरवडा',
  shivamrut: 'शिवामृत समरी', period: 'कालावधी'
};
const uni = text => h('span', { class: 'uni' }, text);

/** Amount in Marathi words (replacement for the Crystal "mwcToMWrd" function). */
const MarathiWords = (() => {
  const w = ('शून्य एक दोन तीन चार पाच सहा सात आठ नऊ दहा अकरा बारा तेरा चौदा पंधरा सोळा सतरा अठरा एकोणीस वीस एकवीस बावीस तेवीस चोवीस पंचवीस ' +
    'सव्वीस सत्तावीस अठ्ठावीस एकोणतीस तीस एकतीस बत्तीस तेहतीस चौतीस पस्तीस छत्तीस सदतीस अडतीस एकोणचाळीस चाळीस एक्केचाळीस बेचाळीस त्रेचाळीस ' +
    'चव्वेचाळीस पंचेचाळीस सेहेचाळीस सत्तेचाळीस अठ्ठेचाळीस एकोणपन्नास पन्नास एक्कावन्न बावन्न त्रेपन्न चोपन्न पंचावन्न छप्पन्न सत्तावन्न अठ्ठावन्न ' +
    'एकोणसाठ साठ एकसष्ट बासष्ट त्रेसष्ट चौसष्ट पासष्ट सहासष्ट सदुसष्ट अडुसष्ट एकोणसत्तर सत्तर एकाहत्तर बाहत्तर त्र्याहत्तर चौऱ्याहत्तर ' +
    'पंच्याहत्तर शहात्तर सत्याहत्तर अठ्ठ्याहत्तर एकोणऐंशी ऐंशी एक्याऐंशी ब्याऐंशी त्र्याऐंशी चौऱ्याऐंशी पंच्याऐंशी शहाऐंशी सत्त्याऐंशी ' +
    'अठ्ठ्याऐंशी एकोणनव्वद नव्वद एक्याण्णव ब्याण्णव त्र्याण्णव चौऱ्याण्णव पंच्याण्णव शहाण्णव सत्त्याण्णव अठ्ठ्याण्णव नव्व्याण्णव').split(' ');
  const hundred = n => (n === 1 ? 'एकशे' : w[n] + 'शे');
  const below1000 = n => {
    const hd = Math.floor(n / 100), r = n % 100;
    if (hd && !r) return n === 100 ? 'शंभर' : hundred(hd);
    return (hd ? hundred(hd) + ' ' : '') + (r ? w[r] : '');
  };
  return amount => {
    amount = Fmt.round(Math.abs(Number(amount) || 0), 2);
    let rs = Math.floor(amount);
    const ps = Math.round((amount - rs) * 100);
    if (!rs && !ps) return 'रुपये शून्य फक्त';
    const parts = [];
    const cr = Math.floor(rs / 10000000); rs %= 10000000;
    const lk = Math.floor(rs / 100000); rs %= 100000;
    const th = Math.floor(rs / 1000); rs %= 1000;
    if (cr) parts.push(below1000(cr) + ' कोटी');
    if (lk) parts.push(w[lk] + ' लाख');
    if (th) parts.push(w[th] + ' हजार');
    if (rs) parts.push(below1000(rs));
    let s = parts.length ? 'रुपये ' + parts.join(' ') : '';
    if (ps) s += (s ? ' व ' : '') + w[ps] + ' पैसे';
    return s + ' फक्त';
  };
})();

// ------------------------------------------------------------------ report area (where the Crystal viewer was: Frame2)
const Report = {
  /** Renders a report inside the given frame element of the VB form, with Print / Close. */
  async show(frame, build, opts = {}) {
    const content = await UI.busy(build, 'Please wait...');
    if (!content) return;
    const page = h('div', { class: 'report-page' + (opts.landscape ? ' landscape' : '') },
      opts.noHeader ? null : h('div', { class: 'rpt-head' },
        h('div', { class: 'mr rpt-company' }, MR.title),
        opts.title ? h('div', { class: 'rpt-title' }, typeof opts.title === 'string' ? uni(opts.title) : opts.title) : null,
        opts.sub ? h('div', { class: 'rpt-sub' }, opts.sub) : null),
      content);
    const view = h('div', { class: 'rpt-view' },
      h('div', { class: 'rpt-toolbar' },
        h('button', { type: 'button', class: 'vb-btn', onclick: () => Report.print(page, opts.landscape) }, uni(RM.print)),
        h('button', { type: 'button', class: 'vb-btn', onclick: () => view.remove() }, uni(RM.close))),
      h('div', { class: 'rpt-scroll' }, page));
    $$('.rpt-view', frame).forEach(x => x.remove());
    frame.appendChild(view);
    return view;
  },
  print(page, landscape) {
    const area = $('#print-area');
    area.replaceChildren(page.cloneNode(true));
    $('#print-orient').textContent = landscape ? '@page { size: A4 landscape; margin: 8mm; }' : '@page { size: A4 portrait; margin: 8mm; }';
    document.body.classList.add('print-mode');
    const done = () => { document.body.classList.remove('print-mode'); area.replaceChildren(); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    window.print();
    setTimeout(done, 1000);
  }
};

/** The original Crystal Report (PDF made by the server) shown inside the form's Frame2, like the Crystal viewer. */
const Crystal = {
  async show(frame, url, params) {
    const view = h('div', { class: 'rpt-view' });
    $$('.rpt-view', frame).forEach(x => { const f = x.querySelector('iframe'); if (f && f.dataset.blob) URL.revokeObjectURL(f.dataset.blob); x.remove(); });
    frame.appendChild(view);
    view.appendChild(h('div', { class: 'rpt-wait' }, h('div', { class: 'spinner' }), 'Please wait...'));
    try {
      if (typeof VBMobile !== 'undefined' && VBMobile.is()) {
        // phones cannot show a PDF inside a page: the server sends the pages as images (pinch to zoom)
        const r = await API.get(url, Object.assign({}, params, { img: 1 }));
        const openPdf = () => UI.busy(async () => {
          const res = await fetch(API.base + url + API.qs(params), { headers: { 'Authorization': 'Bearer ' + API.token() } });
          if (!res.ok) throw new Error('Error ' + res.status);
          const a = h('a', { href: URL.createObjectURL(await res.blob()), download: (r.name || 'report') + '.pdf' });
          document.body.appendChild(a); a.click(); setTimeout(() => a.remove(), 1000);
        });
        view.replaceChildren(
          h('div', { class: 'rpt-toolbar' },
            h('button', { type: 'button', class: 'vb-btn', onclick: openPdf }, 'Open PDF'),
            h('button', { type: 'button', class: 'vb-btn', onclick: () => view.remove() }, 'Close'),
            h('span', { style: { alignSelf: 'center', marginLeft: 'auto' } }, (r.pages || []).length + ' page(s)')),
          h('div', { class: 'rpt-pages' }, (r.pages || []).map(src => h('img', { src, alt: '' }))));
        view.scrollIntoView({ block: 'start' });
        return;
      }
      const res = await fetch(API.base + url + API.qs(params), { headers: { 'Authorization': 'Bearer ' + API.token() } });
      if (!res.ok) { let m = 'Error ' + res.status; try { m = (await res.json()).message || m; } catch { /* */ } throw new Error(m); }
      const blob = URL.createObjectURL(await res.blob());
      const close = () => { URL.revokeObjectURL(blob); view.remove(); };
      view.replaceChildren(
        h('div', { class: 'rpt-toolbar' },
          h('button', { type: 'button', class: 'vb-btn', onclick: () => { try { frm.contentWindow.print(); } catch { window.open(blob); } } }, 'Print'),
          h('button', { type: 'button', class: 'vb-btn', onclick: () => window.open(blob) }, 'Open'),
          h('button', { type: 'button', class: 'vb-btn', onclick: close }, 'Close')),
        h('iframe', { class: 'rpt-pdf', src: blob + '#toolbar=1&navpanes=0&view=FitH', 'data-blob': blob }));
      const frm = view.querySelector('iframe');
    } catch (e) { view.remove(); UI.error(e); }
  }
};

/** Simple HTML table for reports. cols: [{t, f(row), cls}] */
function table(cols, rows, opts = {}) {
  const tb = h('tbody', null, rows.map(r => h('tr', { class: opts.rowClass ? opts.rowClass(r) : null }, cols.map(c => h('td', { class: c.cls }, c.f(r))))));
  const foot = opts.foot ? h('tfoot', null, h('tr', { class: 'tot' }, cols.map((c, i) => h('td', { class: c.cls }, opts.foot[i] ?? '')))) : null;
  return h('table', { class: 'grid rpt ' + (opts.cls || '') }, h('thead', null, h('tr', null, cols.map(c => h('th', { class: c.cls }, typeof c.t === 'string' ? uni(c.t) : c.t)))), tb, foot);
}
