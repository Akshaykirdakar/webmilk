/* Transactions drawn from the VB forms: Daily Milk Collection, Cattel Feed Purchase, Deduction,
   Deduction Cash Jama and Deduction Adj. Behaviour follows the VB code (TabIndex, LostFocus, ListView DblClick). */
'use strict';

const B7 = ['cmdNew', 'cmdFind', 'cmdChange', 'cmdSave', 'cmdCancel', 'cmdDelete', 'cmdExit'];
const setButtons = (F, on) => B7.forEach(b => { if (F.c[b]) F.c[b].disabled = !on.includes(b); });
const picture = (F, n, src) => { const p = F.c[n]; if (p) { p.style.backgroundImage = `url(img/${src})`; p.classList.add('vb-pic-img'); } };

// ------------------------------------------------------------------ Daily Milk Collection (frmstudent_subject_MASTER)
// The supplier's total / average from the fortnight start date up to this entry: a read-only box in front of
// each entry box (ltr, fat, snf, rate, amount), captioned with the form's own "एकूण" (Label20).
(function addUptoBoxes() {
  const m = VBF.collection.c.find(x => x.n === 'fraMain');
  if (m.kids.some(x => x.n === 'txtUltr')) return;
  [['txtUltr', 112], ['txtUfat', 152], ['txtUsnf', 192], ['txtUrate', 232], ['txtUamt', 272]].forEach(([n, y], i) =>
    m.kids.push({ n, t: 'TextBox', x: 204, y, w: 100, h: 37, f: 'Times New Roman', s: 15.75, b: 1, ti: 90 + i, al: 2, nts: 1, ap: 0, bg: '&H00E0E0E0&', fg: '&H00400000&' }));
  const cap = m.kids.find(x => x.n === 'Label20');
  m.kids.push({ ...cap, n: 'lblUpto', x: 308, y: 120, w: 60, ti: 95 });
  // "डेअरी" + its box (amount row) move right to make room for the amount total
  m.kids.find(x => x.n === 'Label17').x = 310;
  Object.assign(m.kids.find(x => x.n === 'txtdairy'), { x: 362, w: 78 });
  // Details: the supplier's entries one by one in a popup
  m.kids.push({ n: 'cmdSms', t: 'CommandButton', x: 308, y: 196, w: 132, h: 28, cap: 'SMS', f: 'Arial', s: 9.75, b: 1, ti: 97 });
  m.kids.push({ n: 'cmdDetails', t: 'CommandButton', x: 214, y: 313, w: 80, h: 22, cap: 'Details', f: 'Arial', s: 8.25, b: 1, ti: 96 });   // under the amount total
  // the तपशिल table below moves down 24 px to make room for it (the frame has space at the bottom)
  m.kids.filter(k => k.x < 440 && k.y >= 320 && k.n !== 'cmdDetails').forEach(k => { k.y += 24; if (k.y2 !== undefined) k.y2 += 24; });
})();

/** Phone layout of Daily Milk Collection: the same controls, arranged in cards with an action bar at the bottom. PC form unchanged. */
function collectionPhone(F) {
  const c = F.c;
  const el = n => (c[n] && c[n].el) || c[n];
  const field = (lab, box, cls) => h('div', { class: 'cp-field ' + (cls || '') }, el(lab), el(box));
  const rowOf = n => el(n).closest('.vbm-row');
  F.el.classList.add('cp');
  const main = c.fraMain;
  const summaryRows = ['Label25', 'Label22', 'Label23', 'Label24', 'Label2'].map(rowOf).filter(Boolean);
  const dairyRow = rowOf('txtdairy');
  const sec = (title, ...kids) => h('details', { class: 'cp-sec' }, h('summary', null, title), ...kids);
  const info = h('div', { class: 'cp-info' });
  F.phoneInfo = s => { info.textContent = 'पंधरवडा ' + s.nfortno + '  |  ' + VBDate.text(s.dstart_date) + ' - ' + VBDate.text(s.dend_date); };
  const tile = (t, n) => h('div', { class: 'cp-tile' }, h('span', null, t), el(n));
  c.newname.classList.add('cp-new');
  c.cmddate.textContent = '📅';
  const page = h('div', { class: 'cp-page' },
    info,
    h('div', { class: 'cp-card cp-when' }, field('Label12', 'tDRATE_FROM_DATE'), field('lblNCODE_NO', 'TNSUBJECT_CODE'), el('cmddate')),
    h('div', { class: 'cp-card' }, h('div', { class: 'cp-name' }, field('Label10', 'txtNEXAM_TYPE')), el('newname')),
    h('div', { class: 'cp-card cp-entry' }, field('Label13', 'txtNltr'), field('Label14', 'txtnfat'), field('Label16', 'txtnsnf')),
    h('div', { class: 'cp-result' }, field('Label15', 'lblrate'), field('Label27', 'lblamt', 'cp-amount')),
    h('div', { class: 'cp-card' },
      h('div', { class: 'cp-head' }, h('b', null, 'पंधरवड्यातील एकूण'), h('span', { class: 'cp-pills' }, el('cmdDetails'), el('cmdSms'))),
      h('div', { class: 'cp-tiles' }, tile('लिटर', 'txtUltr'), tile('फॅट', 'txtUfat'), tile('SNF', 'txtUsnf'), tile('दर', 'txtUrate'), tile('रक्कम', 'txtUamt'))),
    sec('आजचा सारांश (गाय / म्हैस)', ...summaryRows),
    sec('या वेळेच्या नोंदी', el('ListView1')),
    sec('न आलेले उत्पादक', el('ListView2')));
  main.prepend(page);
  if (dairyRow) dairyRow.classList.add('cp-hide');
  el('lblUpto').classList.add('cp-hide');
  el('Label29').closest('.vbm-row').classList.add('cp-hide');
  c.fraButtons.classList.add('cp-hide');
  // actions at the bottom, always in reach; a button that cannot be used now does not show
  F.surface.appendChild(h('div', { class: 'cp-bar' }, ...['cmdSave', 'cmdNew', 'cmdFind', 'cmdChange', 'cmdDelete', 'cmdCancel', 'cmdExit'].map(n => el(n))));
}

Pages.collection = async body => {
  const F = vbPage(body, vbForm('collection', { comboCodes: ['txtNEXAM_TYPE', 'txtfncode'] }));
  const c = F.c;
  F.el.classList.add('vbf-collection');
  // phone layout of this form (css: .vbf-collection)
  const tag = (cls, ...ns) => ns.forEach(n => { const x = c[n]; (x && (x.el || x)).classList.add(cls); });
  tag('cm-dt', 'Label12', 'tDRATE_FROM_DATE', 'lblNCODE_NO', 'TNSUBJECT_CODE'); tag('cm-dtbtn', 'cmddate');
  tag('cm-namelbl', 'Label10'); tag('cm-name', 'txtNEXAM_TYPE'); tag('cm-newname', 'newname');
  tag('cm-lbl', 'Label13', 'Label14', 'Label16', 'Label15', 'Label27');
  tag('cm-in', 'txtNltr', 'txtnfat', 'txtnsnf', 'lblrate', 'lblamt');
  tag('cm-up', 'txtUltr', 'txtUfat', 'txtUsnf', 'txtUrate', 'txtUamt'); tag('cm-cap', 'lblUpto');
  tag('cm-dairy', 'Label17', 'txtdairy');
  tag('cm-bt', 'cmdNew', 'cmdFind', 'cmdChange', 'cmdSave', 'cmdCancel', 'cmdDelete', 'cmdExit');
  tag('cm-fn', 'tyear_code', 'tfortno', 'tfdate', 'tedate'); tag('cm-details', 'cmdDetails');
  if (F.el.classList.contains('vb-mobile')) collectionPhone(F);
  const U = ['txtUltr', 'txtUfat', 'txtUsnf', 'txtUrate', 'txtUamt'];
  U.forEach(n => { c[n].readOnly = true; c[n].tabIndex = -1; });
  let upto = null;   // saved entries of the supplier up to this entry (sums + count), from /api/collection/upto
  const showUpto = () => {
    if (!upto) { U.forEach(n => c[n].value = ''); return; }
    // add the entry on the screen (new or changed) to the saved ones
    const ltr = Fmt.val(c.txtNltr.value), has = ltr > 0;
    const n = Number(upto.cnt) + (has ? 1 : 0);
    const tot = (k, cur) => Number(upto[k] || 0) + (has ? cur : 0);
    c.txtUltr.value = Fmt.round(tot('ltr', ltr), 2);
    c.txtUfat.value = n ? Fmt.round(tot('fat', Fmt.val(c.txtnfat.value)) / n, 1) : 0;
    c.txtUsnf.value = n ? Fmt.round(tot('snf', Fmt.val(c.txtnsnf.value)) / n, 1) : 0;
    c.txtUrate.value = n ? Fmt.round(tot('rate', Fmt.val(c.lblrate.textContent)) / n, 2) : 0;
    c.txtUamt.value = Fmt.round(tot('amount', Fmt.val(c.lblamt.textContent)), 2);
  };
  let uptoSeq = 0;
  const loadUpto = async () => {
    const code = c.txtNEXAM_TYPE.value, d = VBDate.iso(c.tDRATE_FROM_DATE.value);
    const from = VBDate.iso(c.tfdate.value);
    const seq = ++uptoSeq;
    if (!code || !d || !from) { upto = null; showUpto(); return; }
    try {
      const r = await API.get('/api/collection/upto', { code, from, date: d, time: Number(c.TNSUBJECT_CODE.value) || 0, exclude: Number(c.txtNtrans_no.value) || null });
      if (seq === uptoSeq) { upto = r; showUpto(); }
    } catch (e) { upto = null; showUpto(); }   // totals are only information: never block the entry
  };
  c.txtNEXAM_TYPE.onChange(() => loadUpto());
  const enable = F.enable;   // Details stays usable while the entry fields are locked
  F.enable = (...a) => { const r = enable(...a); c.cmdDetails.disabled = false; c.cmdSms.disabled = false; return r; };
  // Automatic SMS after Save: asked once; after that this button turns it on and off
  c.cmdSms.classList.add('cm-sms');
  const smsShow = on => { c.cmdSms.textContent = on ? 'Auto SMS: ON' : 'Auto SMS: OFF'; c.cmdSms.classList.toggle('sms-on', on); c.cmdSms.classList.toggle('sms-off', !on); c.cmdSms.dataset.on = on ? '1' : ''; };
  const smsSet = async on => { await API.post('/api/sms/switch', { enabled: on }); smsShow(on); };
  F.click('cmdSms', () => smsSet(!c.cmdSms.dataset.on).catch(UI.error));
  (async () => {
    const s = await API.get('/api/sms/switch');
    smsShow(!!s.enabled);
    if (!s.asked) await smsSet(!!(await UI.confirm('दूध नोंद Save झाल्यावर उत्पादकाला SMS आपोआप पाठवायचा का?\n(नंतर "Auto SMS" बटणाने कधीही चालू / बंद करता येईल)')));
  })().catch(() => { c.cmdSms.textContent = 'Auto SMS'; });
  F.click('cmdDetails', async () => {
    const it = c.txtNEXAM_TYPE.item, d = VBDate.iso(c.tDRATE_FROM_DATE.value), from = VBDate.iso(c.tfdate.value);
    if (!it || !d || !from) { F.focus('txtNEXAM_TYPE'); return; }
    let rows;
    try { rows = await API.get('/api/collection/upto/rows', { code: it.v, from, date: d, time: Number(c.TNSUBJECT_CODE.value) || 0 }); }
    catch (e) { UI.error(e); return; }
    const cap = n => h('th', { class: 'mr' }, F.c[n].textContent.trim());
    const n = rows.length, tot = k => sum(rows, k), av = k => n ? tot(k) / n : 0;
    const tbl = h('table', { class: 'md-tbl' },
      h('thead', null, h('tr', null, cap('Label12'), cap('lblNCODE_NO'), cap('Label14'), cap('Label16'), cap('Label13'), cap('Label15'), cap('Label27'))),
      h('tbody', null, rows.map(r => h('tr', null,
        h('td', null, Fmt.lv(r.ddate)), h('td', { class: 'mr' }, Fmt.time(r.ntime)), h('td', null, Fmt.n(r.nfat, 1)), h('td', null, Fmt.n(r.nsnf, 1)),
        h('td', null, Fmt.n(r.nltr)), h('td', null, Fmt.n(r.nrate)), h('td', null, Fmt.n(r.namount))))),
      h('tfoot', null, h('tr', null, h('td', { class: 'mr', colspan: 2 }, F.c.lblUpto.textContent.trim() + ' (' + n + ')'),
        h('td', null, Fmt.n(av('nfat'), 1)), h('td', null, Fmt.n(av('nsnf'), 1)), h('td', null, Fmt.n(tot('nltr'))),
        h('td', null, Fmt.n(av('nrate'))), h('td', null, Fmt.n(tot('namount'))))));
    const head = h('div', { class: 'md-head' }, h('span', null, it.v + ' '), h('span', { class: 'mr' }, it.t),
      h('div', null, c.tfdate.value + ' - ' + c.tDRATE_FROM_DATE.value));
    await UI.modal('Details', h('div', { class: 'md-body' }, head, h('div', { class: 'md-scroll' }, tbl)), [{ text: 'Close', value: true }]);
  });
  ['txtNltr', 'txtnfat', 'txtnsnf'].forEach(n => c[n].addEventListener('input', showUpto));
  new MutationObserver(showUpto).observe(c.lblrate, { childList: true, characterData: true, subtree: true });
  new MutationObserver(showUpto).observe(c.lblamt, { childList: true, characterData: true, subtree: true });
  let edited = false;
  c.Label29.textContent = MR.title;
  ['txtmltr', 'txteltr', 'txttltr', 'txtmfat', 'txtefat', 'txttfat', 'txtmsnf', 'txtesnf', 'txttsnf', 'txtmrate', 'txterate', 'txtrate'].forEach(n => c[n].readOnly = true);
  c.TNSUBJECT_CODE.setItems(TIME_ITEMS());
  c.txtftime.setItems(TIME_ITEMS());
  const sups = await Lookups.suppliers(true);
  c.txtNEXAM_TYPE.setItems(sups); c.txtfncode.setItems(sups);

  const ctx = () => {
    const s = Session.require();
    c.tyear_code.value = s.vyear_code; c.tfortno.value = s.nfortno;
    c.tfdate.value = VBDate.text(s.dstart_date); c.tedate.value = VBDate.text(s.dend_date);
    c.tDRATE_FROM_DATE.value = VBDate.text(s.date); c.TNSUBJECT_CODE.value = s.time;
    if (F.phoneInfo) F.phoneInfo(s);
  };
  const dateIso = () => VBDate.iso(c.tDRATE_FROM_DATE.value);
  const timeV = () => Number(c.TNSUBJECT_CODE.value) || 0;

  const fillList = async (onlyTime) => {
    const rows = await API.get('/api/collection/entries', { date: dateIso(), time: onlyTime ? timeV() : null });
    c.ListView1.setRows(rows.map(r => [r.ntrans_no, r.ntrans_no, Fmt.lv(r.ddate), Fmt.time(r.ntime), r.ncode, r.nltr, r.nfat, r.nsnf, r.nrate ?? 0, r.namount]));
  };
  const fillTotals = async () => {
    const sm = await API.get('/api/collection/summary', { date: dateIso(), time: timeV() });
    const put = (p, x) => { c['txt' + p + 'ltr'].value = x.ltr ?? 0; c['txt' + p + 'fat'].value = x.fat ?? 0; c['txt' + p + 'snf'].value = x.snf ?? 0; };
    put('m', sm.cow); put('e', sm.buffalo); put('t', sm.total);
    c.txtmrate.value = sm.cow.rate ?? 0; c.txterate.value = sm.buffalo.rate ?? 0; c.txtrate.value = sm.total.rate ?? 0;
  };
  const fillAbsent = async () => {
    const rows = await API.get('/api/collection/absent', { date: dateIso(), time: timeV() });
    c.ListView2.setRows(rows.map(r => [r.ncode, r.vname]));
  };
  const refresh = async (onlyTime) => { await Promise.all([fillList(onlyTime), fillTotals(), fillAbsent()]); };
  const clearEntry = () => {
    c.txtNEXAM_TYPE.clear(); c.txtNltr.value = ''; c.txtnfat.value = ''; c.txtnsnf.value = '';
    c.lblrate.textContent = ''; c.lblamt.textContent = ''; c.txtdairy.value = ''; c.txtNtrans_no.value = '';
    upto = null; uptoSeq++; showUpto();
  };
  const initial = () => { F.enable('fraMain', false); F.show('fraMain'); F.show('fraFind', false); setButtons(F, ['cmdNew', 'cmdFind', 'cmdExit']); };

  // txtnsnf_LostFocus: rate from the rate master for the supplier's dairy and date
  const rate = async () => {
    if (!c.txtNEXAM_TYPE.value || c.txtnfat.value === '' || c.txtnsnf.value === '') return;
    try {
      const r = await API.get('/api/collection/rate', { code: c.txtNEXAM_TYPE.value, date: dateIso(), fat: Fmt.val(c.txtnfat.value), snf: Fmt.val(c.txtnsnf.value) });
      if (!F.el.isConnected) return; // form already closed
      if (!r.inTable) { await UI.alert('Rate for  Fat & Snf  not in rate table pl verify'); F.focus('txtnfat'); }
      c.lblrate.textContent = r.found ? Fmt.n(r.rate) : '0';
      c.txtdairy.value = r.found ? r.dairy : 0;
      c.lblamt.textContent = Fmt.n(Fmt.round((r.found ? r.rate : 0) * Fmt.val(c.txtNltr.value), 2));
    } catch (e) { UI.error(e); }
  };
  c.txtnsnf.addEventListener('blur', rate);
  c.txtNltr.addEventListener('blur', () => { if (c.lblrate.textContent) c.lblamt.textContent = Fmt.n(Fmt.round(Fmt.val(c.lblrate.textContent) * Fmt.val(c.txtNltr.value), 2)); });

  F.click('cmdNew', async () => {
    clearEntry(); edited = false; ctx();
    F.show('fraMain'); F.show('fraFind', false); F.enable('fraMain', true);
    c.tDRATE_FROM_DATE.disabled = true; c.TNSUBJECT_CODE.disabled = true;
    setButtons(F, ['cmdSave', 'cmdCancel', 'cmdExit']);
    F.focus('txtNEXAM_TYPE');
    refresh().catch(UI.error);
  });
  F.click('cmdSave', async () => {
    const s = Session.require();
    const d = dateIso();
    if (!d) { UI.alert('Invalid date'); return; }
    if (d < s.dstart_date || d > s.dend_date) { await UI.alert('Invalid Date should be cuurent month or fortnight'); return; }
    if (!c.txtNEXAM_TYPE.value) { F.focus('txtNEXAM_TYPE'); return; }
    if (!Fmt.val(c.txtNltr.value)) { await UI.alert('Lit should not be zero..'); F.focus('txtNltr'); return; }
    if (c.txtnfat.value.trim() === '') { F.focus('txtnfat'); return; }
    if (c.txtnsnf.value.trim() === '') { F.focus('txtnsnf'); return; }
    try {
      const r = await API.post('/api/collection', {
        ntransNo: edited ? Number(c.txtNtrans_no.value) || null : null, ncode: c.txtNEXAM_TYPE.value, ddate: d, ntime: timeV(),
        nfat: Fmt.val(c.txtnfat.value), nsnf: Fmt.val(c.txtnsnf.value), nltr: Fmt.val(c.txtNltr.value),
        nfortno: Number(c.tfortno.value), vyearCode: c.tyear_code.value
      });
      c.lblrate.textContent = Fmt.n(r.rate); c.lblamt.textContent = Fmt.n(r.amount);
      if (r.ntransNo || r.ntrans_no) c.txtNtrans_no.value = r.ntransNo || r.ntrans_no;
      await UI.alert('Record Saved');
      await refresh();
      loadUpto();
      F.enable('fraMain', false);
      setButtons(F, ['cmdNew', 'cmdFind', 'cmdExit', 'cmdChange']);
      c.cmdNew.focus();
    } catch (e) { UI.alert('Record Not Saved\n(ERROR NO : -' + e.message + ')'); }
  });
  F.click('cmdChange', () => {
    edited = true;
    F.enable('fraMain', true);
    c.tDRATE_FROM_DATE.disabled = false; c.TNSUBJECT_CODE.disabled = false;
    setButtons(F, ['cmdSave', 'cmdDelete', 'cmdCancel', 'cmdExit']);
    F.focus('txtNEXAM_TYPE');
  });
  F.click('cmdDelete', async () => {
    if (!c.txtNtrans_no.value || !(await UI.confirm('Do you want to delete this record ?'))) return;
    try {
      await API.del('/api/collection/' + c.txtNtrans_no.value);
      clearEntry(); await refresh();
      await UI.alert('Record Deleted!');
      setButtons(F, ['cmdNew', 'cmdFind', 'cmdExit']);
    } catch (e) { UI.error(e); }
  });
  F.click('cmdCancel', () => { clearEntry(); initial(); c.cmdNew.focus(); });
  F.click('cmdExit', () => F.close());
  F.click('cmdFind', () => {
    edited = true;
    F.show('fraMain', false); F.move('fraFind', null, 41); F.show('fraFind'); F.enable('fraFind', true);
    c.txtfdate.value = c.tDRATE_FROM_DATE.value; c.txtftime.value = timeV();
    setButtons(F, ['cmdDelete', 'cmdCancel', 'cmdExit']);
    F.focus('txtfdate');
  });
  F.click('cmdOk', async () => {
    try {
      const r = await API.get('/api/collection/find', { date: VBDate.iso(c.txtfdate.value), time: c.txtftime.value, code: c.txtfncode.value });
      c.txtNtrans_no.value = r.ntrans_no; c.tDRATE_FROM_DATE.value = VBDate.text(Fmt.iso(r.ddate)); c.TNSUBJECT_CODE.value = r.ntime;
      c.txtNEXAM_TYPE.value = r.ncode; c.txtNltr.value = r.nltr ?? ''; c.txtnfat.value = r.nfat ?? ''; c.txtnsnf.value = r.nsnf ?? '';
      c.lblrate.textContent = r.nrate ?? ''; c.lblamt.textContent = r.namount ?? '';
      loadUpto();
      F.show('fraFind', false); F.show('fraMain'); F.enable('fraMain', false);
      setButtons(F, ['cmdNew', 'cmdFind', 'cmdExit', 'cmdDelete', 'cmdChange']);
      await fillList();
      c.cmdChange.focus();
    } catch (e) {
      if (e.status === 404) { await UI.alert('Record Not Found'); F.show('fraFind', false); F.show('fraMain'); initial(); } else UI.error(e);
    }
  });
  // ListView1_DblClick: entry into the form for Change / Delete
  c.ListView1.onDblClick(r => {
    c.txtNtrans_no.value = r[1]; c.tDRATE_FROM_DATE.value = r[2]; c.TNSUBJECT_CODE.value = r[3] === MR.morning ? 1 : 2;
    c.txtNEXAM_TYPE.value = r[4]; c.txtNltr.value = r[5]; c.txtnfat.value = r[6]; c.txtnsnf.value = r[7];
    c.lblrate.textContent = r[8]; c.lblamt.textContent = r[9];
    c.cmdChange.disabled = false; c.cmdDelete.disabled = false;
    loadUpto();
  });
  F.click('newname', async () => { await openForm(null, supplierForm, true); const s2 = await Lookups.suppliers(true); c.txtNEXAM_TYPE.setItems(s2); c.txtfncode.setItems(s2); });
  F.click('cmddate', async () => { if (await Session.choose()) { ctx(); await refresh(); } });
  // tDRATE_FROM_DATE_LostFocus / TNSUBJECT_CODE_LostFocus
  c.tDRATE_FROM_DATE.addEventListener('blur', () => { if (dateIso()) { fillList().catch(UI.error); loadUpto(); } });
  c.TNSUBJECT_CODE.onChange(() => { refresh(true).catch(UI.error); loadUpto(); });

  ctx(); initial();
  await refresh();
  c.cmdNew.focus();
};

// ------------------------------------------------------------------ supplier transaction forms (common VB pattern)
function txForm(body, key, cfg) {
  const F = vbPage(body, vbForm(key, { comboCodes: ['txtnTransportor_code', 'txtfNTRANSPORTOR_CODE'] }));
  const c = F.c;
  let edited = false;
  const supCombo = c.txtnTransportor_code;
  const initial = () => { F.enable('fraMain', false); F.show('fraMain'); F.show('fraFind', false); setButtons(F, ['cmdNew', 'cmdFind', 'cmdExit']); };
  const listRows = r => cfg.kind === 'purchase'
    ? [r.ntransaction_no, Fmt.lv(r.ddate), r.name, r.nbag, r.nrate, r.ndedamt]
    : [r.ntransaction_no, r.name, r.ndedamt, Fmt.lv(r.ddate), r.vnar || ''];
  const listTo = async (lv, code) => {
    const rows = code ? await API.get('/api/tx/' + cfg.kind, { code }) : [];
    // ListView2 of deduction/jama/adj: Sr.NO(hidden), trans no, name, amount, date, nar
    lv.setRows(rows.map(listRows));
  };
  const fields = () => cfg.fields || [];
  const clear = keepDate => {
    const d = c.txtDDEDUCTION_DATE.value;
    F.clearTexts(cfg.keepTexts || []);
    if (keepDate) c.txtDDEDUCTION_DATE.value = d;
    supCombo.clear(); if (c.txtNDEDUCTION_CODE) c.txtNDEDUCTION_CODE.clear();
    cfg.onClear && cfg.onClear();
  };
  const load = async no => {
    try {
      const t = await API.get(`/api/tx/${cfg.kind}/${no}`);
      c.txtNTRANSACTION_NO.value = t.ntransaction_no; supCombo.value = t.ncode; c.txtDDEDUCTION_DATE.value = VBDate.text(Fmt.iso(t.ddate));
      c.txtNDEDUCTION_AMOUNT.value = t.ndedamt ?? ''; if (c.txtnar) c.txtnar.value = t.vnar ?? '';
      cfg.onLoad && cfg.onLoad(t);
      F.show('fraFind', false); F.show('fraMain'); F.enable('fraMain', false);
      setButtons(F, ['cmdNew', 'cmdFind', 'cmdExit', 'cmdDelete', 'cmdChange']);
      c.cmdChange.focus();
    } catch (e) { if (e.status === 404) UI.alert('Record Not Found'); else UI.error(e); }
  };
  F.click('cmdNew', () => {
    clear(true); edited = false;
    if (!c.txtDDEDUCTION_DATE.value) c.txtDDEDUCTION_DATE.value = VBDate.text(Session.require().date);
    c.ListView2.clear(); if (c.ListView1) c.ListView1.clear();
    F.show('fraMain'); F.show('fraFind', false); F.enable('fraMain', true);
    c.txtNTRANSACTION_NO.disabled = true;
    cfg.onNew && cfg.onNew();
    setButtons(F, ['cmdSave', 'cmdCancel', 'cmdExit']);
    F.focus('txtnTransportor_code');
  });
  F.click('cmdChange', () => {
    edited = true; F.enable('fraMain', true); c.txtNTRANSACTION_NO.disabled = true;
    cfg.onChange && cfg.onChange();
    setButtons(F, ['cmdSave', 'cmdCancel', 'cmdExit']);
    F.focus('txtnTransportor_code');
  });
  F.click('cmdSave', async () => {
    if (!supCombo.value) { await UI.alert('Invalid data'); return F.focus('txtnTransportor_code'); }
    const d = VBDate.iso(c.txtDDEDUCTION_DATE.value);
    if (!d) { await UI.alert('Invalid date'); return F.focus('txtDDEDUCTION_DATE'); }
    const extra = cfg.values ? await cfg.values() : {};
    if (extra === false) return;
    const s = Session.require();
    try {
      const r = await API.post('/api/tx/' + cfg.kind, Object.assign({
        ntransactionNo: edited ? Number(c.txtNTRANSACTION_NO.value) || null : null, ncode: supCombo.value, ddate: d,
        ndedamt: Fmt.num(c.txtNDEDUCTION_AMOUNT.value), vnar: cfg.fixedNar || (c.txtnar ? c.txtnar.value : null),
        vyearCode: s.vyear_code, nfortno: s.nfortno
      }, extra));
      c.txtNTRANSACTION_NO.value = r.ntransactionNo;
      await UI.alert('Record Saved');
      await listTo(c.ListView2, supCombo.value);   // txtNtransportor_code_GotFocus refreshes the list
      cfg.afterSave && (await cfg.afterSave());
      F.enable('fraMain', false);
      setButtons(F, ['cmdNew', 'cmdFind', 'cmdExit']);
      c.cmdNew.focus();
    } catch (e) { UI.alert('Record Not Saved\n(ERROR NO : -' + e.message + ')'); }
  });
  F.click('cmdDelete', async () => {
    if (!c.txtNTRANSACTION_NO.value || !(await UI.confirm('Do you want to delete this record ?'))) return;
    try {
      const code = supCombo.value;
      await API.del(`/api/tx/${cfg.kind}/${c.txtNTRANSACTION_NO.value}`);
      clear(true);
      await UI.alert('Record Deleted!');
      await listTo(c.ListView2, code);
      cfg.afterSave && (await cfg.afterSave());
      setButtons(F, ['cmdNew', 'cmdFind', 'cmdExit']);
      c.cmdFind.focus();
    } catch (e) { UI.error(e); }
  });
  F.click('cmdCancel', () => { clear(true); if (c.ListView1) c.ListView1.clear(); initial(); c.cmdNew.focus(); });
  F.click('cmdExit', () => F.close());
  F.click('cmdFind', () => {
    edited = true; F.show('fraMain', false); F.show('fraFind'); F.enable('fraFind', true);
    c.txtfNTRANSPORTOR_CODE.clear(); c.ListView1.clear();
    setButtons(F, ['cmdCancel', 'cmdExit']);
    F.focus('txtfNTRANSPORTOR_CODE');
  });
  F.click('cmdShow', () => listTo(c.ListView1, c.txtfNTRANSPORTOR_CODE.value).catch(UI.error));
  c.ListView1.onDblClick(r => load(r[0]));
  c.ListView2.onDblClick(r => load(r[0]));
  // Validation_Rules TXTNTRANSPORTOR_CODE: supplier chosen -> his transactions in ListView2
  supCombo.onChange(v => { if (v) listTo(c.ListView2, v).catch(UI.error); });
  return { F, c, initial, init: async () => {
    const sups = await Lookups.suppliers(true);
    supCombo.setItems(sups); c.txtfNTRANSPORTOR_CODE.setItems(sups);
    initial(); c.cmdNew.focus();
  } };
}

// Cattel Feed Purchase (frm_item_DEDUCTION_purch, MILK_ITEM_PURCHASE)
Pages.purchase = async body => {
  let t;
  const calc = () => { t.c.txtNDEDUCTION_AMOUNT.value = Fmt.round(Fmt.val(t.c.txtbag.value) * Fmt.val(t.c.txtrate.value), 0); };
  t = txForm(body, 'purchase', {
    kind: 'purchase',
    values: async () => {
      if (!t.c.txtNDEDUCTION_CODE.value) { await UI.alert('Invalid data'); t.F.focus('txtNDEDUCTION_CODE'); return false; }
      if (!Fmt.val(t.c.txtNDEDUCTION_AMOUNT.value)) { await UI.alert('Invalid data'); t.F.focus('txtNDEDUCTION_AMOUNT'); return false; }
      return { nprodCode: t.c.txtNDEDUCTION_CODE.value, nbag: Fmt.val(t.c.txtbag.value), nrate: Fmt.val(t.c.txtrate.value) };
    },
    onLoad: r => { t.c.txtNDEDUCTION_CODE.value = r.nprod_code; t.c.txtbag.value = r.nbag ?? ''; t.c.txtrate.value = r.nrate ?? ''; }
  });
  picture(t.F, 'Picture1', 'purchase.jpg');
  t.c.txtNDEDUCTION_CODE.setItems(await Lookups.items(true));
  t.c.txtrate.addEventListener('blur', calc); t.c.txtbag.addEventListener('blur', calc);
  await t.init();
};

// Deduction (frm_milk_DEDUCTION, MILK_DEDUCTION_2): recovery 1 = cattle feed issued in bags from stock (ListView3)
Pages.deduction = async body => {
  let t;
  const feedOn = on => {
    ['txtPROD_CODE', 'TXTRATE', 'TXTBAG'].forEach(n => { const x = t.c[n]; if (x.input) x.disabled = !on; else x.disabled = !on; });
    t.F.show('ListView3', on);
  };
  const loadBalance = async () => {
    const rows = await API.get('/api/lookups/feed-balance');
    t.c.ListView3.setRows(rows.map(r => [r.nprod_code, r.vprod_name, r.nrate, r.bag]));
    return rows;
  };
  const calc = () => { t.c.txtNDEDUCTION_AMOUNT.value = Fmt.val(t.c.TXTBAG.value) * Fmt.val(t.c.TXTRATE.value); };
  t = txForm(body, 'deduction', {
    kind: 'deduction',
    onClear: () => { t.c.txtPROD_CODE.clear(); t.c.TXTRATE.value = ''; t.c.TXTBAG.value = ''; feedOn(false); },
    onNew: () => feedOn(false),
    values: async () => {
      if (!t.c.txtNDEDUCTION_CODE.value) { await UI.alert('Invalid data'); t.F.focus('txtNDEDUCTION_CODE'); return false; }
      if (!Fmt.val(t.c.txtNDEDUCTION_AMOUNT.value)) { await UI.alert('Invalid data'); t.F.focus('txtNDEDUCTION_AMOUNT'); return false; }
      return { ndedCode: t.c.txtNDEDUCTION_CODE.value, nprodCode: t.c.txtPROD_CODE.value, nrate: Fmt.val(t.c.TXTRATE.value), nbag: Fmt.val(t.c.TXTBAG.value) };
    },
    onLoad: r => { t.c.txtNDEDUCTION_CODE.value = r.nded_code; t.c.txtPROD_CODE.value = r.nprod_code; t.c.TXTRATE.value = r.nrate ?? ''; t.c.TXTBAG.value = r.nbag ?? ''; },
    afterSave: loadBalance
  });
  picture(t.F, 'Picture1', 'deduction.jpg');
  t.c.txtNDEDUCTION_CODE.setItems(await Lookups.deductions(true));
  t.c.txtPROD_CODE.setItems(await Lookups.items(true));
  // txtNDEDUCTION_CODE_LostFocus: code 1 shows the feed stock list
  t.c.txtNDEDUCTION_CODE.onChange(async v => {
    if (Number(v) === 1) {
      const rows = await loadBalance();
      feedOn(true);
      if (!rows.length) await UI.alert('There is no bags');
      t.c.ListView3.el.focus();
    } else { t.c.txtPROD_CODE.clear(); t.c.TXTRATE.value = ''; t.c.TXTBAG.value = ''; feedOn(false); }
  });
  // ListView3_DblClick: item and rate from the stock list
  t.c.ListView3.onDblClick(r => {
    t.c.txtPROD_CODE.value = r[0]; t.c.TXTRATE.value = r[2];
    t.F.show('ListView3', false); t.c.txtPROD_CODE.disabled = true;
    t.F.focus('TXTBAG');
  });
  t.c.TXTBAG.addEventListener('blur', calc); t.c.TXTRATE.addEventListener('blur', calc);
  await t.init();
  feedOn(false);
};

// Deduction Cash Jama (frm_milk_DEDUCTION_jama, MILK_DEDUCTION_JAMA)
Pages.jama = async body => {
  let t;
  t = txForm(body, 'jama', {
    kind: 'jama', fixedNar: MR.cashJamaNar,
    onNew: () => { t.c.txtnar.value = MR.cashJamaNar; },
    values: async () => {
      if (!t.c.txtNDEDUCTION_CODE.value) { await UI.alert('Invalid data'); t.F.focus('txtNDEDUCTION_CODE'); return false; }
      if (!Fmt.val(t.c.txtNDEDUCTION_AMOUNT.value)) { await UI.alert('Invalid data'); t.F.focus('txtNDEDUCTION_AMOUNT'); return false; }
      return { ndedCode: t.c.txtNDEDUCTION_CODE.value };
    },
    onLoad: r => { t.c.txtNDEDUCTION_CODE.value = r.nded_code; }
  });
  t.c.txtNDEDUCTION_CODE.setItems(await Lookups.deductions(true));
  await t.init();
};

// Deduction Adj. (frm_milk_DEDUCTION_adj, MILK_DED_ADJ) against the bills of the working fortnight (ListView3)
Pages.adj = async body => {
  let t, bill = null;
  t = txForm(body, 'adj', {
    kind: 'adj',
    values: async () => {
      if (!t.c.txtNDEDUCTION_CODE.value) { await UI.alert('Invalid data'); t.F.focus('txtNDEDUCTION_CODE'); return false; }
      return { ndedCode: t.c.txtNDEDUCTION_CODE.value };
    },
    onLoad: r => { t.c.txtNDEDUCTION_CODE.value = r.nded_code; }
  });
  const s = Session.require();
  t.c.tyear_code.value = s.vyear_code; t.c.tfortno.value = s.nfortno; t.c.tfdate.value = VBDate.text(s.dstart_date); t.c.tedate.value = VBDate.text(s.dend_date);
  t.c.txtNDEDUCTION_CODE.setItems(await Lookups.deductions(true));
  const bills = await API.get('/api/tx/adj-bills', { year: s.vyear_code, fortno: s.nfortno });
  t.c.ListView3.setRows(bills.map(b => [b.nbillno, b.ncode, b.vname, b.nltr, b.nrate, b.nmilk_amount, b.nfeed ?? '', b.nadv ?? '', b.nbonus_anamat ?? '', b.ndeduction ?? '', b.nnet_amount ?? '']));
  const showBill = b => {
    t.c.Lfeed.textContent = b ? (b.nfeed_opbal ?? '') : ''; t.c.Ladv.textContent = b ? (b.nadv_opbal ?? '') : '';
    t.c.Lbillamt.textContent = b ? (b.nmilk_amount ?? '') : ''; t.c.Lbillfeed.textContent = b ? (b.nfeed ?? '') : '';
    t.c.Lbilladv.textContent = b ? (b.nadv ?? '') : ''; t.c.lbillnetamt.textContent = b ? (b.nnet_amount ?? '') : '';
  };
  // ListView3_DblClick: supplier and fortnight start date from the bill
  t.c.ListView3.onDblClick(r => {
    bill = bills.find(b => b.nbillno === r[0]) || null;
    t.c.txtnTransportor_code.value = r[1];
    t.c.txtDDEDUCTION_DATE.value = VBDate.text(s.dstart_date);
    showBill(bill);
    t.F.focus('txtNDEDUCTION_CODE');
  });
  // txtNDEDUCTION_CODE_LostFocus: 1 = feed, 2 = advance amount of the bill
  t.c.txtNDEDUCTION_CODE.onChange(v => {
    if (!bill) return;
    if (Number(v) === 1) t.c.txtNDEDUCTION_AMOUNT.value = bill.nfeed ?? '';
    if (Number(v) === 2) t.c.txtNDEDUCTION_AMOUNT.value = bill.nadv ?? '';
  });
  await t.init();
};
