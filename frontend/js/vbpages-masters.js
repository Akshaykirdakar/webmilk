/* Master Data Entry forms drawn from the VB .frm files with the same New / Find / Change / Save / Cancel /
   Delete / Close behaviour: Fortnight, Milk Supplier, Deduction, Item, Bank and Village masters. */
'use strict';

/** VB master-form controller (fraMain / fraButtons / fraFind pattern used by every master form). */
function vbCrud(F, cfg) {
  const st = { edited: false, record: null };
  const B = ['cmdNew', 'cmdFind', 'cmdChange', 'cmdSave', 'cmdCancel', 'cmdDelete', 'cmdExit'];
  const buttons = on => B.forEach(b => { const e = F.c[b]; if (e) e.disabled = !on.includes(b); });
  const fields = cfg.fields;
  const getV = f => {
    const x = F.c[f.c];
    if (f.kind === 'combo') return x.value;
    if (f.kind === 'date') return VBDate.iso(x.value);
    return x.value.trim();
  };
  const setV = (f, v) => {
    const x = F.c[f.c];
    if (f.kind === 'combo') x.value = v;
    else if (f.kind === 'date') x.value = v ? VBDate.text(Fmt.iso(v)) : '';
    else x.value = v === null || v === undefined ? '' : String(v);
  };
  const clearAll = () => { fields.forEach(f => setV(f, f.kind === 'combo' ? null : '')); cfg.onClear && cfg.onClear(); };
  const mainOn = b => F.enable(cfg.main || 'fraMain', b);
  const showFind = b => {
    if (!cfg.find) return;
    F.show(cfg.find, b); F.enable(cfg.find, b);
    if (b && cfg.findTop !== undefined) F.move(cfg.find, null, cfg.findTop);
    F.show(cfg.main || 'fraMain', !b);
  };
  const view = () => { showFind(false); mainOn(false); buttons(['cmdNew', 'cmdFind', 'cmdExit', 'cmdDelete', 'cmdChange']); };
  const reset = () => { showFind(false); mainOn(false); buttons(['cmdNew', 'cmdFind', 'cmdExit']); };

  const loadRecord = async key => {
    const r = await cfg.load(key);
    if (!r) { await UI.alert('Record Not Found'); return false; }
    st.record = r;
    fields.forEach(f => setV(f, r[f.col]));
    cfg.onLoaded && cfg.onLoaded(r);
    view();
    (F.c.cmdNew || {}).focus && F.c.cmdNew.focus();
    return true;
  };
  F.click('cmdNew', () => {
    clearAll(); st.edited = false; st.record = null;
    showFind(false); mainOn(true);
    if (cfg.keyCtl) F.c[cfg.keyCtl].disabled = !!cfg.keyAuto;
    buttons(['cmdSave', 'cmdCancel', 'cmdExit']);
    F.focus(cfg.newFocus || cfg.keyCtl);
  });
  F.click('cmdChange', () => {
    if (!st.record) return;
    st.edited = true; mainOn(true);
    if (cfg.keyCtl) F.c[cfg.keyCtl].disabled = true;
    buttons(['cmdSave', 'cmdCancel', 'cmdExit']);
    F.focus(cfg.changeFocus);
  });
  F.click('cmdFind', async () => {
    st.edited = true;
    showFind(true);
    buttons(['cmdCancel', 'cmdExit']);
    if (cfg.findPrepare) await cfg.findPrepare();
    F.focus(cfg.findFocus);
  });
  F.click(cfg.findOk || 'cmdOk', async () => {
    try {
      const key = cfg.findKey();
      if (key === null || key === undefined || key === '') return F.focus(cfg.findFocus);
      if (!(await loadRecord(key))) F.focus(cfg.findFocus);
    } catch (e) { UI.error(e); }
  });
  F.click('cmdCancel', () => { clearAll(); st.record = null; reset(); F.c.cmdNew.focus(); });
  F.click('cmdExit', () => F.close());
  F.click('cmdSave', async () => {
    const vals = {};
    fields.forEach(f => vals[f.col] = getV(f));
    if (cfg.validate) { const msg = cfg.validate(vals, st); if (msg) { await UI.alert(msg); return; } }
    try {
      const r = await cfg.save(st.edited, vals, st.record);
      await UI.alert('Record Saved');
      if (cfg.keyCtl && r && r.key !== undefined) setV(fields.find(f => f.c === cfg.keyCtl), r.key);
      st.record = Object.assign({}, st.record || {}, vals, cfg.keyCol && r ? { [cfg.keyCol]: r.key } : {});
      cfg.afterSave && (await cfg.afterSave(st.record));
      mainOn(false);
      buttons(['cmdNew', 'cmdFind', 'cmdExit']);
      F.c.cmdNew.focus();
    } catch (e) { UI.alert('Record Not Saved\n(ERROR NO : -' + e.message + ')'); }
  });
  F.click('cmdDelete', async () => {
    if (!st.record) return;
    if (!(await UI.confirm('Do you want to delete this record ?'))) return;
    try {
      await cfg.del(st.record);
      clearAll(); st.record = null;
      await UI.alert('Record Deleted!');
      cfg.afterSave && (await cfg.afterSave(null));
      reset(); F.c.cmdFind.focus();
    } catch (e) { UI.error(e); }
  });
  // Validation_Rules: a code typed in the key box of a new record loads the existing record (cmdOk_click)
  if (cfg.keyCtl && cfg.keyAutoLoad) {
    F.c[cfg.keyCtl].addEventListener('blur', async () => {
      const v = F.c[cfg.keyCtl].value.trim();
      if (!v || st.edited || F.c[cfg.keyCtl].disabled) return;
      try { const r = await cfg.load(v); if (r) { st.record = r; fields.forEach(f => setV(f, r[f.col])); cfg.onLoaded && cfg.onLoaded(r); view(); } } catch { /* new code */ }
    });
  }
  clearAll(); reset();
  return { st, reset, loadRecord, buttons };
}

/** Opens a master form; in a modal window when called from another form (VB "frmX.Show 1"). */
function openForm(body, build, asDialog) {
  if (!asDialog) return build(body, null);
  return new Promise(resolve => {
    const host = h('div', { class: 'modal-back' });
    document.body.appendChild(host);
    build(host, () => { host.remove(); resolve(); });
  });
}
const placeForm = (container, F, closeFn) => {
  if (closeFn) F.close = closeFn;
  if (container.classList.contains('modal-back')) container.replaceChildren(F.el);
  else vbPage(container, F);
};

// ------------------------------------------------------------------ Fortnight (frmstudent_subject)
function fortnightForm(container, closeFn, preset) {
  const F = vbForm('fortnight');
  placeForm(container, F, closeFn);
  F.c.txtopen.setItems([{ v: '1', t: MR.billType1 }, { v: '2', t: MR.billType2 }]);
  const ctl = vbCrud(F, {
    keyCtl: 'TXTNFORTNO', keyCol: 'nfortno', newFocus: 'txtvYear_code', changeFocus: 'txtDSTART_DATE', findTop: 64,
    find: 'fraFind', findFocus: 'txtfvYear_code',
    fields: [{ c: 'txtvYear_code', col: 'vyear_code' }, { c: 'TXTNFORTNO', col: 'nfortno' }, { c: 'txtDSTART_DATE', col: 'dstart_date', kind: 'date' },
      { c: 'txtDEND_DATE', col: 'dend_date', kind: 'date' }, { c: 'txtopen', col: 'vopen_fortnight', kind: 'combo' }],
    findKey: () => { const y = F.c.txtfvYear_code.value.trim(), n = F.c.TXTfNFORTNO.value.trim(); return y && n ? y + '|' + n : null; },
    load: async key => { const [y, n] = String(key).split('|'); try { return await API.get(`/api/fortnights/${encodeURIComponent(y)}/${n}`); } catch (e) { if (e.status === 404) return null; throw e; } },
    validate: v => !v.vyear_code ? 'Invalid data' : !v.dstart_date || !v.dend_date ? 'Invalid date' : null,
    save: async (edited, v) => {
      const r = await API.post('/api/fortnights', { isNew: !edited, nfortno: v.nfortno ? Number(v.nfortno) : null, vyearCode: v.vyear_code,
        dstartDate: v.dstart_date, dendDate: v.dend_date, vopenFortnight: v.vopen_fortnight });
      return { key: r.nfortno };
    },
    del: r => API.del(`/api/fortnights/${encodeURIComponent(r.vyear_code)}/${r.nfortno}`),
    afterSave: () => { if (closeFn && preset) closeFn(); }
  });
  if (preset) {
    F.c.cmdNew.click();
    F.c.txtvYear_code.value = preset.year; F.c.txtDSTART_DATE.value = VBDate.text(preset.from); F.c.txtDEND_DATE.value = VBDate.text(preset.to);
    F.c.txtopen.value = '1';
  }
  return ctl;
}
Pages.fortnight = body => openForm(body, fortnightForm);
/** HT_setup "Do you want to Create New Fortnight ?" */
Pages.fortnightDialog = date => {
  const d = new Date(date + 'T00:00:00'), y = d.getFullYear(), m = d.getMonth(), day = d.getDate();
  const last = new Date(y, m + 1, 0).getDate();
  const [fd, td] = day <= 10 ? [1, 10] : day <= 20 ? [11, 20] : [21, last];
  const p = n => String(n).padStart(2, '0');
  const preset = { year: m >= 3 ? `${y}-${y + 1}` : `${y - 1}-${y}`, from: `${y}-${p(m + 1)}-${p(fd)}`, to: `${y}-${p(m + 1)}-${p(td)}` };
  return openForm(null, (c, close) => fortnightForm(c, close, preset), true);
};

// ------------------------------------------------------------------ Milk Supplier Master (frmCDO_MAIN_YOJANA_MASTER)
function tagGrid(box) {
  // MyGrid1: column "Tag no" (ANUDAN_TAG_MASTER)
  const rows = h('div', { class: 'tg-rows' });
  box.replaceChildren(h('div', { class: 'tg-head' }, 'Tag no'), rows);
  const add = v => {
    const i = h('input', { type: 'text', class: 'tg-in', value: v || '', inputmode: 'numeric' });
    vbKeyFilter(i, 'N');
    i.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); if (i.value.trim() && i === rows.lastChild) add('').focus(); else if (i.nextSibling) i.nextSibling.focus(); }
      if (e.key === 'Delete' && e.ctrlKey) { i.remove(); }
    });
    rows.appendChild(i);
    return i;
  };
  return {
    set(list) { rows.replaceChildren(); (list || []).forEach(add); add(''); },
    get() { return $$('input', rows).map(i => i.value.trim()).filter(Boolean); },
    disable(b) { $$('input', rows).forEach(i => i.disabled = b); }
  };
}

async function supplierForm(container, closeFn) {
  const F = vbForm('supplier', { comboCodes: ['txtfgrn_no'] });
  placeForm(container, F, closeFn);
  const tags = tagGrid(F.c.MyGrid1);
  tags.set([]);
  const fillCombos = async force => {
    F.c.txtvillage.setItems(await Lookups.villages(force));
    F.c.txtbank.setItems(await Lookups.banks(force));
  };
  await fillCombos(true);
  F.c.txtdairy.setItems(DAIRY_ITEMS());
  // txtbank_LostFocus: branch & IFSC from bank master
  F.c.txtbank.onChange(async v => {
    const b = (await Lookups.get('banks')).find(x => String(x.bank_code) === String(v));
    if (b) { F.c.txtbank_brnach.value = b.bank_branch || ''; F.c.txtifsccode.value = b.ifsc_code || ''; }
  });
  F.click('Command1', async () => { await openForm(null, villageForm, true); await fillCombos(true); });
  F.click('Command2', async () => { await openForm(null, bankForm, true); await fillCombos(true); });
  const mainEnable = F.enable;
  F.enable = (n, b = true) => { mainEnable(n, b); if (n === 'fraMain') tags.disable(!b); };

  vbCrud(F, {
    keyCtl: 'TXTNGRn_NO', keyCol: 'ncode', keyAutoLoad: true, findOk: 'cmdok', newFocus: 'TXTNGRn_NO', changeFocus: 'txtVSTUDENT_NAME_ISF', findTop: 48,
    find: 'fraFind', findFocus: 'txtfgrn_no',
    fields: [{ c: 'TXTNGRn_NO', col: 'ncode' }, { c: 'txtVSTUDENT_NAME_ISF', col: 'vname' }, { c: 'txtENG_NAME', col: 'eng_name' },
      { c: 'txtvillage', col: 'vill_code', kind: 'combo' }, { c: 'TXTNEXAM_NO', col: 'nacno' }, { c: 'txtmobile_no', col: 'nmobile_no' },
      { c: 'txtAHARNO', col: 'aharno' }, { c: 'txtCOW_TYPE', col: 'cow_type' }, { c: 'txtIDNO', col: 'idno' }, { c: 'txtcb', col: 'cb' },
      { c: 'txtbank', col: 'bank_code', kind: 'combo' }, { c: 'txtbank_brnach', col: 'bank_branch' }, { c: 'txtifsccode', col: 'ifsc_code' },
      { c: 'txtdairy', col: 'ndairy', kind: 'combo' }],
    findPrepare: async () => { F.c.txtfgrn_no.setItems(await Lookups.suppliers(true), false); },
    findKey: () => F.c.txtfgrn_no.value,
    load: async code => { try { return await API.get('/api/suppliers/' + code); } catch (e) { if (e.status === 404) return null; throw e; } },
    onLoaded: r => tags.set(r.tags || []),
    onClear: () => tags.set([]),
    validate: v => !v.vname ? 'blank name ' : null,
    save: async (edited, v) => {
      const r = await API.post('/api/suppliers', {
        isNew: !edited, ncode: v.ncode ? Number(v.ncode) : null, vname: v.vname, engName: v.eng_name, nacno: v.nacno, nmobileNo: v.nmobile_no,
        aharno: v.aharno, cowType: v.cow_type, idno: v.idno, cb: v.cb, villCode: v.vill_code, bankCode: v.bank_code, bankBranch: v.bank_branch,
        ifscCode: v.ifsc_code, ndairy: v.ndairy, tags: tags.get()
      });
      return { key: r.ncode };
    },
    del: r => API.del('/api/suppliers/' + r.ncode),
    afterSave: () => Lookups.clear('suppliers')
  });
}
Pages.supplier = body => openForm(body, supplierForm);

// ------------------------------------------------------------------ small masters
function codeNameMaster(formKey, kind, map) {
  return (container, closeFn) => {
    const F = vbForm(formKey, { comboCodes: [map.find] });
    placeForm(container, F, closeFn);
    vbCrud(F, {
      keyCtl: map.key, keyCol: 'code', keyAuto: map.keyAuto, keyAutoLoad: !map.keyAuto, newFocus: map.keyAuto ? map.first : map.key,
      changeFocus: map.first, find: 'fraFind', findTop: map.findTop ?? 48, findFocus: map.find,
      fields: [{ c: map.key, col: 'code' }].concat(map.fields),
      findPrepare: async () => {
        const rows = await API.get('/api/masters/' + kind);
        F.c[map.find].setItems(rows.map(r => ({ v: r.code, t: r[map.nameCol] || '' })), false);
      },
      findKey: () => F.c[map.find].value,
      load: async code => (await API.get('/api/masters/' + kind)).find(r => String(r.code) === String(code)) || null,
      validate: map.validate,
      save: async (edited, v) => {
        const values = Object.assign({}, v); delete values.code;
        const r = await API.post('/api/masters/' + kind, { isNew: !edited, key: v.code ? Number(v.code) : null, values });
        return { key: r.code };
      },
      del: r => API.del('/api/masters/' + kind + '/' + r.code),
      afterSave: () => Lookups.clear()
    });
  };
}
const deductionForm = codeNameMaster('deductionMaster', 'deduction', {
  key: 'txtNDEDUCTION_CODE', first: 'txtVDEDUCTION_NAME', find: 'txtfNDEDUCTION_CODE', nameCol: 'vdeduction_name', findTop: 49,
  fields: [{ c: 'txtVDEDUCTION_NAME', col: 'vdeduction_name' }, { c: 'txtndeduction_value', col: 'ndeduction_value' }, { c: 'txtnpriority_code', col: 'npriority_code' }]
});
const itemForm = codeNameMaster('item', 'item', {
  key: 'txtNPRODUCT_CODE', keyAuto: true, first: 'txtNPRODUCT_NAME', find: 'txtfNPRODUCT_CODE', nameCol: 'vprod_name',
  fields: [{ c: 'txtNPRODUCT_NAME', col: 'vprod_name' }, { c: 'txtunit', col: 'unit' }, { c: 'txtngst_rate', col: 'nrate' }],
  validate: v => !v.vprod_name ? 'This Field should not be empty' : !Fmt.val(v.nrate) ? 'Invalid data' : null
});
const bankForm = codeNameMaster('bank', 'bank', {
  key: 'txtNPRODUCT_CODE', keyAuto: true, first: 'txtNPRODUCT_NAME', find: 'txtfNPRODUCT_CODE', nameCol: 'bank_name',
  fields: [{ c: 'txtNPRODUCT_NAME', col: 'bank_name' }, { c: 'txtbranch', col: 'bank_branch' }, { c: 'txtunit', col: 'ifsc_code' }],
  validate: v => !v.bank_name ? 'This Field should not be empty' : null
});
const villageForm = codeNameMaster('village', 'village', {
  key: 'txtNPRODUCT_CODE', keyAuto: true, first: 'txtNPRODUCT_NAME', find: 'txtfNPRODUCT_CODE', nameCol: 'village_name',
  fields: [{ c: 'txtNPRODUCT_NAME', col: 'village_name' }],
  validate: v => !v.village_name ? 'This Field should not be empty' : null
});
Pages['m-deduction'] = body => openForm(body, deductionForm);
Pages['m-item'] = body => openForm(body, itemForm);
Pages['m-bank'] = body => openForm(body, bankForm);
Pages['m-village'] = body => openForm(body, villageForm);
