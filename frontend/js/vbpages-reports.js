/* Bill processes, backup, rate charts and all report forms, drawn from the VB forms.
   Print buttons show the ORIGINAL Crystal Reports (reports\*.rpt, printed by the server) inside Frame2,
   exactly where the VB program showed the Crystal viewer. */
'use strict';

/** tyear_code / tfortno / tfdate / tedate text boxes of the report forms (filled from the working date like the VB form_load). */
function periodBoxes(F) {
  const s = Session.require();
  const c = F.c;
  if (c.tyear_code) c.tyear_code.value = s.vyear_code;
  if (c.tfortno) c.tfortno.value = s.nfortno;
  if (c.tfdate) c.tfdate.value = VBDate.text(s.dstart_date);
  if (c.tedate) c.tedate.value = VBDate.text(s.dend_date);
  let list = null;
  const sync = async () => {
    list = list || await API.get('/api/fortnights');
    const f = list.find(x => x.vyear_code === c.tyear_code.value.trim() && String(x.nfortno) === c.tfortno.value.trim());
    if (f) { if (c.tfdate) c.tfdate.value = Fmt.date(f.dstart_date); if (c.tedate) c.tedate.value = Fmt.date(f.dend_date); }
  };
  if (c.tfortno) { c.tfortno.addEventListener('change', () => sync().catch(UI.error)); c.tyear_code.addEventListener('change', () => sync().catch(UI.error)); }
  return () => ({
    year: c.tyear_code ? c.tyear_code.value.trim() : s.vyear_code, fortno: c.tfortno ? Number(c.tfortno.value) : s.nfortno,
    from: c.tfdate ? VBDate.iso(c.tfdate.value) : s.dstart_date, to: c.tedate ? VBDate.iso(c.tedate.value) : s.dend_date
  });
}
const reportPage = (body, key, opts) => {
  const F = vbPage(body, vbForm(key, opts));
  if (F.c.fbillexit) F.click('fbillexit', () => F.close());
  return F;
};
// reports are drawn in the page (rptengine.js); the rate charts of 8.5 / buffalo are cross-tabs, see rateChartPage
const crystal = (F, url, params) => FastReport.show(F.c.Frame2, url, params);

// ------------------------------------------------------------------ Bill / bonus / anudan process
function processPage(body, key, kind) {
  const s = Session.require();
  const F = vbPage(body, vbForm(key));
  const c = F.c;
  c.txtvyear_code.value = s.vyear_code; c.txtfortno.value = s.nfortno;
  c.txtsDATE.value = VBDate.text(s.dstart_date); c.txteDATE.value = VBDate.text(s.dend_date);
  F.click('cmd_exit', () => F.close());
  F.click('cmd_Process', async () => {
    if (!(await UI.confirm('Do you want to Process ?'))) return;
    const r = await UI.busy(() => API.post('/api/process/' + kind, { vyearCode: s.vyear_code, nfortno: s.nfortno }), 'Please wait...');
    if (r) await UI.alert('Process Completed Successfully'); else await UI.alert('Process Failed?');
  });
  c.cmd_Process.focus();
}
Pages['p-bill'] = body => processPage(body, 'billProc', 'bill');
Pages['p-bonus'] = body => processPage(body, 'bonusProc', 'bonus');
Pages['p-anudan'] = body => processPage(body, 'anudanProc', 'anudan');

// ------------------------------------------------------------------ Backup (frmbackup)
Pages.backup = body => {
  const F = vbPage(body, vbForm('backup'));
  F.click('Cmdclose', () => F.close());
  F.click('Backup', async () => { await UI.busy(() => API.download('/api/export/backup')); UI.alert('Export complete.'); });
  F.c.Backup.focus();
};

// ------------------------------------------------------------------ Daily report (repo_milk_daily -> daily_moring_report.rpt)
Pages['r-daily'] = body => {
  const s = Session.require();
  const F = reportPage(body, 'daily');
  const c = F.c;
  c.dmtime.setItems(TIME_ITEMS());
  c.dmdate.value = VBDate.text(s.date); c.dmtime.value = s.time;
  F.click('Command5', () => {
    const d = VBDate.iso(c.dmdate.value);
    if (!d || !c.dmtime.value) return UI.alert('Invalid date');
    crystal(F, 'daily', { date: d, time: c.dmtime.value });
  });
  F.focus('dmdate');
};

// ------------------------------------------------------------------ Milk bill (repo_milk_Bill -> bill_report.rpt)
Pages['r-bill'] = body => {
  const F = reportPage(body, 'bill');
  const P = periodBoxes(F);
  F.click('Command5', () => { const f = P(); crystal(F, 'bill', { year: f.year, fortno: f.fortno }); });
  F.c.Command5.focus();
};

// ------------------------------------------------------------------ Bill register (repo_milk_Bill_reg)
Pages['r-register'] = body => {
  const F = reportPage(body, 'register');
  const P = periodBoxes(F);
  const go = url => { const f = P(); crystal(F, url, { year: f.year, fortno: f.fortno }); };
  F.click('Command5', () => go('register'));      // bill_registar.rpt
  F.click('bank', () => go('bank'));               // bill_bank.rpt
  F.click('Rokha', () => go('rokha'));             // bill_rokha.rpt
  F.click('bankltr', () => go('bankletter'));      // bank_ltr.rpt
  const excel = cb => { const f = P(); UI.busy(() => API.download('/api/export/banklist', { year: f.year, fortno: f.fortno, cb })); };
  F.click('Command_pen', () => excel('all'));
  F.click('cmdcow', () => excel('C'));
  F.click('Cmdbuff', () => excel('B'));
  F.c.Command5.focus();
};

// ------------------------------------------------------------------ Bill summary (repo_milk_Bill_summary)
Pages['r-summary'] = body => {
  const F = reportPage(body, 'summary');
  const P = periodBoxes(F);
  const go = kind => { const f = P(); crystal(F, 'summary', { year: f.year, fortno: f.fortno, kind }); };
  F.click('rpodailysum', () => go('daily'));       // bill_summary.rpt
  F.click('cow', () => go('cow'));                 // bill_summary_cow.rpt
  F.click('Buff', () => go('buffalo'));            // bill_summary_buff.rpt
  F.click('Shiv', () => go('shivamrut'));          // bill_summary2.rpt
  F.click('Command5', () => go('total'));          // bill_summary_only.rpt
  F.c.rpodailysum.focus();
};

// ------------------------------------------------------------------ Ledger (repo_milk_ledger)
Pages['r-ledger'] = async body => {
  const s = Session.require();
  const F = reportPage(body, 'ledger', { comboCodes: ['cattel'] });
  const c = F.c;
  c.tfdate.value = VBDate.text(s.dstart_date); c.tedate.value = VBDate.text(s.dend_date);
  c.dmtime.setItems(await Lookups.deductions(true));
  c.cattel.setItems(await Lookups.suppliers(true));
  const p = () => ({ from: VBDate.iso(c.tfdate.value), to: VBDate.iso(c.tedate.value), ded: c.dmtime.value, code: c.cattel.value });
  const need = async () => {
    const q = p();
    if (!q.from || !q.to) { await UI.alert('Invalid date'); return null; }
    if (!q.ded) { await UI.alert('Invalid data'); F.focus('dmtime'); return null; }
    return q;
  };
  F.click('Command5', async () => { const q = await need(); if (q) crystal(F, 'ledger', Object.assign({ mode: 'detail' }, q)); });   // milk_Sub_Led.rpt
  F.click('yanedene', async () => { const q = await need(); if (q) crystal(F, 'ledger', Object.assign({ mode: 'list' }, q)); });    // milk_Sub_Led_list.rpt
  F.click('CAFEED', () => { const q = p(); crystal(F, 'ledger', { mode: 'cattle', from: q.from, to: q.to, code: q.code }); });      // milk_cattel_Led.rpt
  F.focus('tfdate');
};

// ------------------------------------------------------------------ Master check list (repo_chk_llist)
Pages['r-master'] = body => {
  const F = reportPage(body, 'masterList');
  const c = F.c;
  c.dmtime.setItems([{ v: 1, t: MR.fortnightList }, { v: 2, t: MR.supplierList }]);
  c.dmtime.value = 1;
  F.click('Command5', () => crystal(F, 'checklist', { type: c.dmtime.value || 1 }));
  c.dmtime.focus();
};

// ------------------------------------------------------------------ Anudan reports & SMS (Excel)
Pages['r-anudan'] = body => {
  const F = reportPage(body, 'anudan');
  const P = periodBoxes(F);
  const x = n => { const f = P(); F.show('Label1'); UI.busy(() => API.download('/api/export/anudan' + n, { year: f.year, fortno: f.fortno })).finally(() => F.show('Label1', false)); };
  F.show('Label1', false);
  F.click('cmdexcl4', () => x(1)); F.click('excel3', () => x(2)); F.click('excel3A', () => x(3));
  F.c.cmdexcl4.focus();
};
Pages['r-sms'] = body => {
  const s = Session.require();
  const F = reportPage(body, 'sms');
  const c = F.c;
  F.show('Label1', false);
  c.txttime.setItems(TIME_ITEMS());
  c.txtdate.value = VBDate.text(s.date); c.txttime.value = s.time;
  F.click('cmdexcl4', () => UI.busy(() => API.download('/api/export/sms', { date: VBDate.iso(c.txtdate.value), time: c.txttime.value })));
  F.click('bk', () => UI.busy(() => API.download('/api/export/backup')));
  F.focus('txtdate');
};

// ------------------------------------------------------------------ Rate charts (repo_rate_chart* -> milk_rate_chart*.rpt)
const RCF = {
  cow: { form: 'rcCow', del: 'cmddelete', auto: 'full', fields: ['txtrate3585', 'txtdiff30', 'txtdiff29', 'txtdiff80', 'txtrate3579', 'txtdiff3079', 'Txtdiff2979', 'txtdiff79', 'txtrate3685', 'txtdiff36', 'txtrate3679', 'txtdiff3679'] },
  anudan: { form: 'rcAnudan', del: 'delete', auto: 'diff', fields: ['txtrate3585', 'txtdiff30', 'txtdiff29', 'txtdiff80', 'txtrate3579', 'txtdiff3079', 'Txtdiff2979', 'txtdiff79', 'txtrate3685', 'txtdiff36', 'txtrate3679', 'txtdiff3679'] },
  buffalo: { form: 'rcBuffalo', del: 'delete', auto: 'none', dairy: true, base: 'txtrate1', fields: ['txtrate1', 'txtdiff1', 'txtdiff2', 'txtdiff3', 'txtdiff4', 'txtrate2', 'txtdiff5', 'txtdiff6'] }
};
function rateChartPage(body, type) {
  const cfg = RCF[type];
  const F = reportPage(body, cfg.form);
  const c = F.c;
  cfg.fields.forEach(n => { const t = F.meta[n] && F.meta[n].txt; if (t && /^[\d.]+$/.test(t)) c[n].value = t; });   // designer defaults (buffalo)
  if (cfg.dairy) { c.txtdairy.setItems(DAIRY_ITEMS()); if (type === 'buffalo') c.txtdairy.value = 2; }
  const v = n => Fmt.val(c[n] && c[n].value);
  const set = (n, x) => { if (c[n]) c[n].value = Fmt.round(x, 2); };
  const diffs = () => { set('txtdiff36', v('txtrate3685') - v('txtrate3585')); set('txtdiff3679', v('txtrate3679') - v('txtrate3579')); };
  if (cfg.auto === 'full') {
    c.txtrate3585.addEventListener('input', () => { set('txtrate3685', v('txtrate3585') + 0.2); diffs(); });
    c.txtdiff80.addEventListener('input', () => set('txtrate3579', Fmt.round(v('txtrate3585') - v('txtdiff80') * 6, 2)));
    c.txtrate3579.addEventListener('input', () => { set('txtrate3679', v('txtrate3579') + 0.2); diffs(); });
  }
  if (cfg.auto !== 'none') ['txtrate3685', 'txtrate3679'].forEach(n => c[n].addEventListener('blur', diffs));

  let periods = [];
  const loadPeriods = async () => {
    periods = await API.get('/api/ratechart/periods', { type });
    c.ListView1.setRows(periods.map(r => [Fmt.lv(r.drate_from_date), Fmt.lv(r.drate_from_date), Fmt.lv(r.drate_to_date), cfg.dairy ? Fmt.dairy(r.ndairy) : '']));
  };
  c.ListView1.onDblClick((r, i) => {
    c.txtfromdate.value = r[1]; c.txttodate.value = r[2];
    if (cfg.dairy && periods[i] && periods[i].ndairy) c.txtdairy.value = periods[i].ndairy;
  });
  c.txtfromdate.addEventListener('blur', async () => {
    const f = VBDate.iso(c.txtfromdate.value); if (!f) return;
    try { const r = await API.get('/api/ratechart/check-from', { type, from: f }); if (!r.ok) { await UI.alert(' Alrady Rate for this rate'); F.focus('txtfromdate'); } } catch (e) { UI.error(e); }
  });
  const params = () => {
    const p = { type, from: VBDate.iso(c.txtfromdate.value), to: VBDate.iso(c.txttodate.value), dairy: cfg.dairy ? c.txtdairy.value : null };
    const map = { txtrate3585: 'rate3585', txtdiff30: 'diff30', txtdiff29: 'diff29', txtdiff80: 'diff80', txtrate3579: 'rate3579', txtdiff3079: 'diff3079',
      Txtdiff2979: 'diff2979', txtdiff79: 'diff79', txtrate3685: 'rate3685', txtdiff36: 'diff36', txtrate3679: 'rate3679', txtdiff3679: 'diff3679',
      txtrate1: 'rate1', txtdiff1: 'diff1', txtdiff2: 'diff2', txtdiff3: 'diff3', txtdiff4: 'diff4',
      txtrate2: 'rate2', txtdiff5: 'diff5', txtdiff6: 'diff6' };
    Object.entries(map).forEach(([n, k]) => { p[k] = cfg.fields.includes(n) ? v(n) : 0; });
    return p;
  };
  F.click('Command5', async () => {
    const p = params();
    if (!p.from || !p.to) return UI.alert('Invalid date');
    if (v(cfg.base || 'txtrate3585') > 0 && (await UI.confirm('Process Rate ? '))) {
      if (!(await UI.busy(() => API.post('/api/ratechart/process', p)))) return;
      await loadPeriods();
    }
    crystal(F, 'ratechart', { type, from: p.from, to: p.to, dairy: p.dairy });
  });
  F.click(cfg.del, async () => {
    const p = params();
    if (!p.from || !p.to) return UI.alert('Invalid date');
    if (!(await UI.confirm('Do you want to delete this record ?'))) return;
    await UI.busy(async () => { await API.del('/api/ratechart', { type, from: p.from, to: p.to, dairy: p.dairy }); await loadPeriods(); });
    cfg.fields.forEach(n => { if (c[n]) c[n].value = ''; }); c.txtfromdate.value = ''; c.txttodate.value = '';
  });
  loadPeriods().catch(UI.error);
  F.focus('txtfromdate');
}
// ------------------------------------------------------------------ Rate Chart Cow 9.0 (milk_rate_chartanu9): 4 numbers
// The basic rate is fat 3.5 / snf 8.5; with it only three differences are entered. The other differences are under
// "More" and the other rates follow from them. RC9 is the same calculation as the procedure (used for the preview).
// The procedure itself starts from snf 9.0: its parameter mrate3585 is the rate at 3.5 / 9.0.
const RC9 = {
  fats: Array.from({ length: 31 }, (_, i) => 25 + i),   // tenths: 2.5 .. 5.5
  snfs: Array.from({ length: 21 }, (_, i) => 90 - i),   // tenths: 9.0 .. 7.0
  /** the 14 values the procedure takes, from the numbers on the form */
  full(n) {
    const r = x => Fmt.round(x, 2);
    const rate90 = r(n.base + 5 * n.d80);
    const rate3579 = r(n.base - 2 * n.d8582 - n.jump);
    return { rate3585: rate90, diff30: n.d30, diff29: n.d29, diff80: n.d80, rate3579, diff3079: n.d30, diff2979: n.d29, diff79: n.d79,
      rate3685: r(rate90 + n.d36), diff36: n.d36, rate3679: r(rate3579 + n.d36), diff3679: n.d36, diff8582: n.d8582, diff7975: n.d7975 };
  },
  cell(p, f, s) {
    const r2 = x => Fmt.round(x, 2);
    let r;
    if (s >= 83) {
      r = f >= 36 ? p.rate3685 : p.rate3585;
      for (let v = 89; v >= s; v--) r = r2(r - (v === 84 || v === 83 ? p.diff8582 : p.diff80));
    } else {
      r = f >= 36 ? p.rate3679 : p.rate3579;
      for (let v = 81; v >= s; v--) r = r2(r - (v <= 79 ? p.diff7975 : p.diff79));
    }
    if (f >= 36) for (let v = 37; v <= f; v++) r = r2(r + (s >= 83 ? p.diff36 : p.diff3679));
    else for (let v = 34; v >= f; v--) r = r2(r - (v >= 32 ? (s >= 83 ? p.diff30 : p.diff3079) : (s >= 83 ? p.diff29 : p.diff2979)));
    return r;
  },
  /** the numbers of an existing chart, read back from its rates */
  numbers(rates) {
    const at = (f, s) => rates.get(f * 1000 + s);
    const r3 = x => Fmt.round(x, 3);
    const b = at(35, 90), s85 = at(35, 85), s83 = at(35, 83), s82 = at(35, 82), s80 = at(35, 80), s75 = at(35, 75), f32 = at(32, 90), f25 = at(25, 90), h = at(36, 90);
    if ([b, s85, s83, s82, s80, s75, f32, f25, h].some(x => x === undefined)) return null;
    return { base: s85, d80: r3((b - s85) / 5), d8582: r3((s85 - s83) / 2), jump: r3(s83 - s82), d79: r3((s82 - s80) / 2), d7975: r3((s80 - s75) / 5),
      d30: r3((b - f32) / 3), d29: r3((f32 - f25) / 7), d36: r3(h - b) };
  }
};
(function simpleRc9Layout() {
  const m = VBF.rcAnudan9.c.find(x => x.n === 'Frame1');
  if (m.kids.some(x => x.n === 'txtjump')) return;
  const k = n => m.kids.find(x => x.n === n);
  const box = { f: 'Times New Roman', s: 12, h: 25, w: 65, al: 2, dis: 0, ml: 6 };
  const row = (lab, txt, x, y, ti, cap) => {
    Object.assign(k(lab), { x, y, w: 121, h: 25, ...(cap ? { cap } : {}) });
    Object.assign(k(txt), box, { x: x + 128, y, ti });
  };
  const dif = { ...k('Label8') };
  m.kids.push({ ...dif, n: 'lblJump' }, { ...k('txtdiff8582'), n: 'txtjump' });
  // always shown: rate and three differences
  row('Label1', 'txtrate3585', 8, 64, 3, k('Label1').cap.replace('9.0', '8.5'));
  row('Label20', 'txtdiff80', 8, 96, 4, dif.cap.replace('8.5 - 8.3', '9.0 - 8.5'));
  row('Label19', 'txtdiff7975', 8, 128, 5, dif.cap.replace('8.5 - 8.3', '8.0 - 7.0'));
  row('Label11', 'txtdiff36', 8, 160, 6, dif.cap.replace('8.5 - 8.3', '3.6 - 5.5'));
  // under More: differences that stay the same, and the rates that follow
  row('Label8', 'txtdiff8582', 256, 64, 21);
  row('lblJump', 'txtjump', 256, 96, 22, dif.cap.replace('8.5 - 8.3', '8.3 - 8.2'));
  row('Label13', 'txtdiff79', 256, 128, 23, dif.cap.replace('8.5 - 8.3', '8.2 - 8.0'));
  row('Label14', 'txtrate3685', 256, 160, 90, k('Label14').cap.replace('3.6', '3.5'));   // shows the rate at 3.5 / 9.0
  row('Label3', 'txtdiff30', 464, 64, 24, dif.cap.replace('8.5 - 8.3', '3.4 - 3.2'));
  row('Label6', 'txtdiff29', 464, 96, 25, dif.cap.replace('8.5 - 8.3', '3.1 - 2.5'));
  row('Label7', 'txtrate3579', 464, 128, 91);
  row('Label15', 'txtrate3679', 464, 160, 92);
  // the differences entered separately in the old form: now the same as the ones above
  ['txtdiff3079', 'Txtdiff2979', 'txtdiff3679', 'Label9', 'Label10', 'Label12'].forEach(n => { k(n).hid = 1; });
  const btn = (n, x, ti, cap) => Object.assign(k(n), { x, y: 188, w: 65, h: 28, ti, f: 'Arial', s: 9.75, ...(cap ? { cap } : {}) });
  m.kids.push({ ...k('Command5'), n: 'cmdProcess' }, { ...k('Command5'), n: 'cmdMore' });
  btn('cmdMore', 256, 26, 'More'); btn('cmdProcess', 400, 7, 'Process'); btn('Command5', 465, 8); btn('delete', 530, 9); btn('fbillexit', 595, 10);
})();

function rateChart9Page(body) {
  const F = reportPage(body, 'rcAnudan9');
  const c = F.c;
  F.el.classList.add('vbf-rc9');
  ['Label16', 'Label17', 'txtfromdate', 'txttodate'].forEach(n => F.c[n].classList.add('rc-dt'));
  const type = 'anudan9';
  const more = ['txtdiff8582', 'txtjump', 'txtdiff79', 'txtrate3685', 'txtdiff30', 'txtdiff29', 'txtrate3579', 'txtrate3679', 'Label8', 'lblJump', 'Label13', 'Label14', 'Label3', 'Label6', 'Label7', 'Label15'];
  const shown = b => more.forEach(n => F.show(n, b));
  let open = false;
  shown(false);
  F.click('cmdMore', () => { open = !open; shown(open); });
  const inputs = { base: 'txtrate3585', d80: 'txtdiff80', d7975: 'txtdiff7975', d36: 'txtdiff36', d8582: 'txtdiff8582', jump: 'txtjump', d79: 'txtdiff79', d30: 'txtdiff30', d29: 'txtdiff29' };
  ['txtrate3685', 'txtrate3579', 'txtrate3679'].forEach(n => { c[n].readOnly = true; c[n].tabIndex = -1; });
  const numbers = () => Object.fromEntries(Object.entries(inputs).map(([k, n]) => [k, Fmt.val(c[n].value)]));
  const refresh = () => {
    const p = RC9.full(numbers());
    c.txtrate3685.value = p.rate3585; c.txtrate3579.value = p.rate3579; c.txtrate3679.value = p.rate3679;
  };
  Object.values(inputs).forEach(n => c[n].addEventListener('input', refresh));
  const fill = n => { Object.entries(inputs).forEach(([k, name]) => { c[name].value = n[k]; }); refresh(); };

  c.txtdairy.setItems(DAIRY_ITEMS());
  const dairy = () => Number(c.txtdairy.value) || 0;
  let periods = [], loaded = null;   // loaded: rates of the chart read from the list (to count what a new Process changes)
  const readChart = async (from, to) => {
    const r = await API.get('/api/ratechart/chart', { type, from, to, dairy: dairy() });
    return new Map(r.rates.map(x => [Math.round(x.fat * 10) * 1000 + Math.round(x.snf * 10), x.rate]));
  };
  const loadPeriods = async () => {
    periods = await API.get('/api/ratechart/periods', { type });
    c.ListView1.setRows(periods.map(r => [Fmt.lv(r.drate_from_date), Fmt.lv(r.drate_from_date), Fmt.lv(r.drate_to_date), Fmt.dairy(r.ndairy)]));
  };
  // a new chart: the numbers of this dairy's last chart, starting the day after it ends
  const newChart = async () => {
    loaded = null;
    c.txtfromdate.value = ''; c.txttodate.value = '';
    const last = periods.find(p => Number(p.ndairy) === dairy());
    if (!last) return;
    const n = RC9.numbers(await readChart(Fmt.iso(last.drate_from_date), Fmt.iso(last.drate_to_date)));
    if (n) fill({ ...n, jump: 0.3 });   // 8.3 - 8.2 is 0.3 in the charts; change it under More when needed
    c.txtfromdate.value = VBDate.text(Fmt.addDays(Fmt.iso(last.drate_to_date), 1));
  };
  c.txtdairy.onChange(() => newChart().catch(UI.error));
  // a chart from the list: its dates and numbers, for correction or printing
  c.ListView1.onDblClick(async (r, i) => {
    const p = periods[i];
    c.txtdairy.value = p.ndairy;
    const f = Fmt.iso(p.drate_from_date), t = Fmt.iso(p.drate_to_date);
    c.txtfromdate.value = VBDate.text(f); c.txttodate.value = VBDate.text(t);
    try {
      loaded = await readChart(f, t);
      const n = RC9.numbers(loaded);
      if (!n) return;
      fill(n);
      const q = RC9.full(n);
      const off = Array.from(loaded).filter(([k, v]) => Math.abs(RC9.cell(q, Math.floor(k / 1000), k % 1000) - v) > 0.005).length;
      if (off) await UI.alert(off + ' rates of this chart do not follow these numbers. They will change if this chart is processed again.');
    } catch (e) { UI.error(e); }
  });

  const dates = () => ({ from: VBDate.iso(c.txtfromdate.value), to: VBDate.iso(c.txttodate.value) });
  const preview = (p, from, to) => {
    const rate = (f, s) => RC9.cell(p, f, s);
    const fmt = t => (t / 10).toFixed(1);
    // a step between two snf columns that differs from the steps on both sides is shown in colour
    const steps = RC9.snfs.slice(0, -1).map((s, i) => Fmt.round(rate(35, s) - rate(35, RC9.snfs[i + 1]), 2));
    const odd = new Set();
    steps.forEach((x, i) => { if (i > 0 && i < steps.length - 1 && x !== steps[i - 1] && x !== steps[i + 1]) odd.add(RC9.snfs[i + 1]); });
    const changed = loaded ? Array.from(loaded).filter(([k, v]) => Math.abs(rate(Math.floor(k / 1000), k % 1000) - v) > 0.005).length : null;
    const tbl = h('table', { class: 'md-tbl rc-tbl' },
      h('thead', null, h('tr', null, h('th', null, ''), RC9.snfs.map(s => h('th', { class: odd.has(s) ? 'rc-odd' : null }, fmt(s))))),
      h('tbody', null, RC9.fats.map(f => h('tr', null, h('th', null, fmt(f)),
        RC9.snfs.map(s => h('td', { class: odd.has(s) ? 'rc-odd' : null }, rate(f, s).toFixed(2)))))));
    const notes = [VBDate.text(from) + ' - ' + VBDate.text(to)];
    if (changed !== null) notes.push(changed + ' rates change');
    odd.forEach(s => notes.push('Check SNF ' + fmt(s) + ': different step'));
    return UI.modal('Rate Chart', h('div', { class: 'md-body' }, h('div', { class: 'md-head' }, notes.join('   |   ')), h('div', { class: 'md-scroll' }, tbl)),
      [{ text: 'Save', value: true }, { text: 'Cancel', value: false }]);
  };

  F.click('cmdProcess', async () => {
    const { from, to } = dates();
    if (!from || !to) { await UI.alert('Invalid date'); return F.focus(from ? 'txttodate' : 'txtfromdate'); }
    if (!dairy()) { await UI.alert('Select dairy'); return F.focus('txtdairy'); }
    const empty = Object.values(inputs).find(n => !String(c[n].value).trim());
    if (empty) {
      if (more.includes(empty) && !open) { open = true; shown(true); }
      await UI.alert('Fill all rates and differences (0 if there is no difference)');
      return F.focus(empty);
    }
    const p = RC9.full(numbers());
    if (!(await preview(p, from, to))) return;
    const ok = await UI.busy(() => API.post('/api/ratechart/process', { type, from, to, dairy: dairy(), ...p }));
    if (!ok) return;
    await loadPeriods();
    loaded = await readChart(from, to);
    await UI.alert('Record Saved');
    c.Command5.focus();
  });
  // The chart is drawn from the saved rates (the Crystal report took 7-12 seconds and ran over two pages)
  const showChart = (rates, from, to) => {
    const has = (list, of) => list.filter(x => Array.from(rates.keys()).some(k => of(k) === x));
    const fats = has(RC9.fats, k => Math.floor(k / 1000)), snfs = has(RC9.snfs, k => k % 1000);
    const fmt = t => (t / 10).toFixed(1);
    const sheet = () => h('div', { class: 'report-page rc-print' },
      h('div', { class: 'rc-head' }, h('div', null, mr(MR.title)),
        h('div', null, mr(Fmt.dairy(dairy())), '   ', mr(c.Label16.textContent.trim()), ' ', VBDate.text(from), '   ', mr(c.Label17.textContent.trim()), ' ', VBDate.text(to))),
      h('table', { class: 'rc-grid' },
        h('thead', null, h('tr', null, h('th', null, 'Fat / SNF'), snfs.map(x => h('th', null, fmt(x))))),
        h('tbody', null, fats.map(f => h('tr', null, h('th', null, fmt(f)), snfs.map(x => {
          const v = rates.get(f * 1000 + x);
          return h('td', null, v === undefined ? '' : Number(v).toFixed(2));
        }))))));
    const old = F.surface.querySelector('.rc-view'); if (old) old.remove();
    const view = h('div', { class: 'rpt-view rc-view' },
      h('div', { class: 'rpt-toolbar' },
        h('button', { type: 'button', class: 'vb-btn', onclick: () => Report.print(sheet(), true) }, 'Print'),
        h('button', { type: 'button', class: 'vb-btn', onclick: () => view.remove() }, 'Close')),
      h('div', { class: 'rc-sheet' }, sheet()));
    F.surface.appendChild(view);
    if (VBMobile.is()) view.scrollIntoView({ block: 'start' });
  };
  F.click('Command5', async () => {
    const { from, to } = dates();
    if (!from || !to) return UI.alert('Invalid date');
    if (!dairy()) { await UI.alert('Select dairy'); return F.focus('txtdairy'); }
    const rates = await UI.busy(() => readChart(from, to));
    if (!rates) return;
    if (!rates.size) return UI.alert('Record Not Found');
    showChart(rates, from, to);
  });
  F.click('delete', async () => {
    const { from, to } = dates();
    if (!from || !to) return UI.alert('Invalid date');
    if (!(await UI.confirm('Do you want to delete this record ?'))) return;
    await UI.busy(async () => { await API.del('/api/ratechart', { type, from, to, dairy: dairy() }); await loadPeriods(); await newChart(); });
  });
  (async () => {
    await loadPeriods();
    c.txtdairy.value = 1;
    await newChart();
    F.focus('txttodate');
  })().catch(UI.error);
}

Pages['rc-cow'] = body => rateChartPage(body, 'cow');
Pages['rc-anudan'] = body => rateChartPage(body, 'anudan');
Pages['rc-anudan9'] = rateChart9Page;
Pages['rc-buffalo'] = body => rateChartPage(body, 'buffalo');

// ------------------------------------------------------------------ SMS after a milk entry: switch, test number, phones, messages
Pages['sms-status'] = async body => {
  const page = h('div', { class: 'sms-page' });
  body.replaceChildren(page);
  const STATUS = { P: 'Waiting', C: 'With phone', S: 'Sent', F: 'Failed', X: 'Cancelled' };
  const dt = v => (v ? VBDate.text(String(v).slice(0, 10)) + ' ' + String(v).slice(11, 16) : '');
  const load = async () => {
    const r = await API.get('/api/sms/status');
    const n = k => { const x = r.counts.find(c => c.vstatus === k); return x ? x.n : 0; };
    const en = h('input', { type: 'checkbox' }); en.checked = Number(r.settings.nenabled) === 1;
    const test = h('input', { type: 'text', inputmode: 'numeric', maxlength: '10', value: r.settings.vtest_no || '' });
    const lim = h('input', { type: 'number', min: '1', value: r.settings.ndaily_limit });
    const save = async () => {
      if (await UI.busy(() => API.post('/api/sms/settings', { enabled: en.checked, testNo: test.value.trim(), dailyLimit: Number(lim.value) || 0 }))) { UI.toast('Saved'); load().catch(UI.error); }
    };
    page.replaceChildren(
      h('h3', null, 'SMS Status'),
      h('div', { class: 'sms-box' },
        h('label', null, en, ' SMS ON'),
        h('label', null, 'Test number (all SMS go only to this number) ', test),
        h('label', null, 'Daily limit of each phone ', lim),
        h('button', { type: 'button', class: 'vb-btn', onclick: save }, 'Save'),
        h('button', { type: 'button', class: 'vb-btn', onclick: () => load().catch(UI.error) }, 'Refresh'),
        h('button', { type: 'button', class: 'vb-btn', onclick: async () => { await UI.busy(() => API.post('/api/sms/retry', {})); load().catch(UI.error); } }, 'Send failed again'),
        h('button', { type: 'button', class: 'vb-btn', onclick: () => nav('#/home') }, 'Close')),
      h('div', { class: 'sms-box' }, 'Today:  Sent ' + n('S') + '  |  Waiting ' + (n('P') + n('C')) + '  |  Failed ' + n('F') + '  |  Cancelled ' + n('X')),
      h('h4', null, 'Phones'),
      r.devices.length ? h('table', { class: 'md-tbl' }, h('thead', null, h('tr', null, ['Phone', 'Status', 'Last seen', 'Sent today'].map(t => h('th', null, t)))),
        h('tbody', null, r.devices.map(d => h('tr', null, h('td', null, d.vname || d.vdevice), h('td', null, Number(d.is_on) ? 'On' : 'Off'), h('td', null, dt(d.dlast_seen)), h('td', null, d.sent))))) : h('div', null, 'No phone yet: install the Milk Billing app on the phone.'),
      h('h4', null, 'Last messages'),
      h('div', { class: 'md-scroll' }, h('table', { class: 'md-tbl' }, h('thead', null, h('tr', null, ['Code', 'Mobile', 'Made', 'Sent', 'Status', 'Phone', 'Note'].map(t => h('th', null, t)))),
        h('tbody', null, r.recent.map(q => h('tr', null, h('td', null, q.ncode), h('td', null, q.vmobile), h('td', null, dt(q.dcreated)), h('td', null, dt(q.dsent)), h('td', null, STATUS[q.vstatus] || q.vstatus), h('td', null, q.vname || ''), h('td', null, q.verror || '')))))));
  };
  await load();
};
