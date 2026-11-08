// Generates frontend/js/labels.js from the VB6 .frm files so DVB-encoded Marathi captions stay byte-exact.
const fs = require('fs'), path = require('path');
const SRC = 'D:/dairy/milk billing';
const OUT = process.argv[2];
const dec = f => new TextDecoder('windows-1252').decode(fs.readFileSync(path.join(SRC, f + '.frm'))).replace(/\r/g, '');
const cache = {};
function parse(form) {
  if (cache[form]) return cache[form];
  const lines = dec(form).split('\n'); const st = []; const ctl = {}; const code = [];
  let inCode = false;
  for (const l of lines) {
    if (/^Attribute VB_Exposed/.test(l)) { inCode = true; continue; }
    if (inCode) { code.push(l); continue; }
    let m = l.match(/^\s*Begin\s+(\S+)\s+(\S+)/); if (m) { st.push({ n: m[2], p: {} }); continue; }
    if (/^\s*End\s*$/.test(l)) { const c = st.pop(); if (c) ctl[c.n + (c.p.Index !== undefined ? '(' + c.p.Index + ')' : '')] = c.p; continue; }
    m = l.match(/^\s*(Caption|Index)\s*=\s*(.*)$/);
    if (m && st.length && st[st.length - 1].p[m[1]] === undefined) {
      let v = m[2].trim(); if (v.startsWith('"')) v = v.slice(1, v.lastIndexOf('"'));
      st[st.length - 1].p[m[1]] = v;
    }
  }
  return cache[form] = { ctl, code };
}
const cap = (form, c) => { const p = parse(form).ctl[c]; if (!p || p.Caption === undefined) throw new Error(form + '.' + c); return p.Caption.trim(); };
// n-th quoted string literal in code lines matching a pattern
const lit = (form, re, n = 0) => { const l = parse(form).code.find(x => re.test(x)); if (!l) throw new Error(form + ' ' + re); return [...l.matchAll(/"([^"]*)"/g)][n][1].trim(); };

const D = 'frmstudent_subject_MASTER', S = 'frmCDO_MAIN_YOJANA_MASTER';
const map = {
  title: [D, 'Label29'],
  morning: () => lit(D, /TNSUBJECT_CODE\.AddItem\(.*, 1\)/),
  evening: () => lit(D, /TNSUBJECT_CODE\.AddItem\(.*, 2\)/),
  dairy1: () => lit(S, /txtdairy\.AddItem\(.*, 1\)/),
  dairy2: () => lit(S, /txtdairy\.AddItem\(.*, 2\)/),
  cashJamaNar: () => lit('frm_milk_DEDUCTION_jama', /txtnar = "/),
  billType1: () => lit('frmstudent_subject', /txtopen\.AddItem\(.*"1"\)/),
  billType2: () => lit('frmstudent_subject', /txtopen\.AddItem\(.*"2"\)/),
  fortnightList: () => lit('repo_chk_llist', /dmtime\.AddItem\(.*, 1\)/),
  supplierList: () => lit('repo_chk_llist', /dmtime\.AddItem\(.*, 2\)/),
  totalAmountRs: () => lit('repo_milk_Bill_reg', /Value = "‹/, 1),
  // common
  date: [D, 'Label12'], time: [D, 'lblNCODE_NO'], name: [D, 'Label10'], ltr: [D, 'Label13'], fat: [D, 'Label14'],
  snf: [D, 'Label16'], rate: [D, 'Label15'], amount: [D, 'Label27'], dairy: [D, 'Label17'], newSupplier: [D, 'newname'],
  cow: [D, 'Label18'], buffalo: [D, 'Label19'], total: [D, 'Label20'], details: [D, 'Label25'], milkSupplier: [D, 'Label7'],
  morningEvening: ['HT_setup', 'lblNCODE_NO'],
  // supplier master
  supCode: [S, 'lblNDEDUCTION_CODE'], supNameMr: [S, 'Label12'], supNameEn: [S, 'Label11'], village: [S, 'Label8'],
  bankAcNo: [S, 'Label4'], mobile: [S, 'Label5'], aadhaar: [S, 'Label6'], cowType: [S, 'Label7'], tagNo: [S, 'Label13'],
  newVillage: [S, 'Command1'], newBank: [S, 'Command2'],
  // fortnight
  year: ['frmstudent_subject', 'lblNDEDUCTION_CODE'], fortnightNo: ['frmstudent_subject', 'Label1'],
  fromDate: ['frmstudent_subject', 'Label5'], toDate: ['frmstudent_subject', 'Label6'], billType: ['frmstudent_subject', 'Label2'],
  fortnight: ['repo_milk_Bill', 'Label12'],
  // deduction master
  dedCode: ['frmDEDUCTION_MASTER', 'lblNDEDUCTION_CODE'], dedName: ['frmDEDUCTION_MASTER', 'lblVDEDUCTION_NAME'],
  dedPriority: ['frmDEDUCTION_MASTER', 'Label3'], dedPerLtr: ['frmDEDUCTION_MASTER', 'Label11'],
  // item / bank / village
  itemCode: ['FRMDIS_PRODUCT_MASTER', 'Label5'], itemName: ['FRMDIS_PRODUCT_MASTER', 'Label6'], unit: ['FRMDIS_PRODUCT_MASTER', 'Label4'],
  bankCode: ['FRMbank_MASTER', 'Label5'], bankName: ['FRMbank_MASTER', 'Label6'], bankBranch: ['FRMbank_MASTER', 'Label7'],
  villageCode: ['FRMvillage_MASTER', 'Label5'], villageName: ['FRMvillage_MASTER', 'Label6'],
  // transactions
  transNo: ['frm_milk_DEDUCTION', 'lblNTRANSACTION_NO'], supplierCode: ['frm_milk_DEDUCTION', 'lblfNFARMER_CODE'],
  recoveryName: ['frm_milk_DEDUCTION', 'lblNDEDUCTION_CODE'], feedType: ['frm_milk_DEDUCTION', 'Label2'], bags: ['frm_milk_DEDUCTION', 'Label5'],
  recoveryAmount: ['frm_milk_DEDUCTION', 'lblNDEDUCTION_AMOUNT'], narration: ['frm_milk_DEDUCTION', 'Label1'],
  cashJamaAmount: ['frm_milk_DEDUCTION_jama', 'lblNDEDUCTION_AMOUNT'],
  adjAmount: ['frm_milk_DEDUCTION_adj', 'lblNDEDUCTION_AMOUNT'], billDetails: ['frm_milk_DEDUCTION_adj', 'Label9'],
  totalReceivable: ['frm_milk_DEDUCTION_adj', 'Label7'], billAmount: ['frm_milk_DEDUCTION_adj', 'Label5'],
  feedRecovery: ['frm_milk_DEDUCTION_adj', 'Label8'], feedBalance: ['frm_milk_DEDUCTION_adj', 'Label2'],
  advance: ['frm_milk_DEDUCTION_adj', 'Label10'], advanceBalance: ['frm_milk_DEDUCTION_adj', 'Label4'], netPayable: ['frm_milk_DEDUCTION_adj', 'Label6'],
  // process
  billProcess: ['frm_milk_bill_proc', 'Label3'], bonusProcess: ['frm_milk_bonus_proc', 'Label3'], anudanProcess: ['frm_milk_bill_anudan', 'Label3'],
  periodNo: ['frm_milk_bill_proc', 'Label5'], finYear: ['frm_milk_bill_proc', 'Label4'],
  // reports
  ledger: ['repo_milk_ledger', 'Command5'], receivablePayableList: ['repo_milk_ledger', 'yanedene'], feedPurchaseIssue: ['repo_milk_ledger', 'CAFEED'],
  register: ['repo_milk_Bill_reg', 'Command5'], bankList: ['repo_milk_Bill_reg', 'bank'], cashList: ['repo_milk_Bill_reg', 'Rokha'], letter: ['repo_milk_Bill_reg', 'bankltr'],
  pendriveAll: ['repo_milk_Bill_reg', 'Command_pen'], pendriveCow: ['repo_milk_Bill_reg', 'cmdcow'], pendriveBuffalo: ['repo_milk_Bill_reg', 'Cmdbuff'],
  dailySummary: ['repo_milk_Bill_summary', 'rpodailysum'], totalSummary: ['repo_milk_Bill_summary', 'Command5'],
  diff: () => cap('repo_rate_chart', 'Label6').split(/\s+/)[0],
};
const mod = new TextDecoder('windows-1252').decode(fs.readFileSync(path.join(SRC, 'Module1.bas')));
const cst = n => { const m = new RegExp('Public Const ' + n + ' = "([^"]*)"').exec(mod); if (!m) throw new Error(n); return m[1].trim(); };
map.title1 = () => cst('Title1');
map.factoryName = () => cst('factory_name');
const out = {};
for (const [k, v] of Object.entries(map)) out[k] = typeof v === 'function' ? v() : cap(v[0], v[1]);
const js = '// Generated from the VB6 forms (D:\\dairy\\milk billing\\*.frm). Marathi text is in the DVB-TT font encoding\n' +
  '// (same as the data stored in Oracle) and must be shown with a DVB font (class "mr").\n' +
  'window.MR = ' + JSON.stringify(out, null, 1) + ';\n';
fs.writeFileSync(OUT, js, 'utf8');
console.log(Object.keys(out).length + ' labels written to ' + OUT);
