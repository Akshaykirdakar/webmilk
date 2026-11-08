/* Application shell = MDI1.frm: menu (same captions as the VB menu), MDI background picture, logon (cab_Logon)
   and working date (HT_setup). Every menu item opens the same VB form, drawn by vbform.js. */
'use strict';

const Pages = window.Pages = window.Pages || {};

/** Moves between forms without adding browser history (keeps window.close() allowed, like a desktop program). */
function nav(hash) {
  const url = location.pathname + location.search + hash;
  if (location.hash === hash || (!hash && !location.hash)) return;
  location.replace(hash ? url : location.pathname + location.search);
}

// Menu exactly as MDI1.frm (visible items only)
const MENU = [
  { t: 'Master Data Entry', items: [
    ['fortnight', 'Fortnight'], ['supplier', 'Milk Supplier Master'], ['m-deduction', 'Deduction Master'],
    ['m-item', 'Item Master'], ['m-bank', 'Bank Master'], ['m-village', 'Village Master']] },
  { t: 'Transactions', items: [
    ['collection', 'Daily Milk Collection'], ['purchase', 'Cattel Feed Purchase'], ['deduction', 'Deduction'],
    ['jama', 'Deduction Cash Jama'], ['adj', 'Deduction Adj.'], ['p-bill', 'Bill Process'], ['p-bonus', 'bonus bill process'],
    ['p-anudan', 'ANUDAN BILL PROCESS'], ['backup', 'Backup'], ['sms-status', 'SMS Status']] },
  { t: 'Reports    ', items: [
    ['r-daily', 'Daily report'], ['r-bill', 'milk Bill'], ['r-register', 'Bill Register'], ['r-summary', 'Bill summary'],
    ['r-ledger', 'Ledger'], ['rc-cow', 'Rate Chart Cow 8.5'], ['rc-anudan9', 'Rate Chart Cow 9.0_Anudan'],
    ['rc-anudan', 'Rate Chart Cow 8.5 Anudan'], ['rc-buffalo', 'Rate Chart Buffalow'], ['r-master', 'Master List'],
    ['r-anudan', 'Anudan reports'], ['r-sms', 'SMS']] }
];

const App = {
  user() { try { return JSON.parse(sessionStorage.getItem('mb_user')); } catch { return null; } },

  start() {
    document.title = 'Milk Billing System';
    if (!API.token() || !Session.get()) return this.showLogin();
    this.showShell();
  },

  // cab_Logon.frm in two steps on the same screen: 1) user name / password, 2) after a correct login the
  // working date and shift of HT_setup in place of the login box, Ok -> main screen (no separate window)
  showLogin() {
    const L = VBF.logon.c, S = VBF.setup.c.find(x => x.n === 'fraStep3(0)').kids;
    if (!L.some(x => x.n === 'fraDate')) {
      const fr = L.find(x => x.n === 'fraStep3(0)');
      fr.y = 192;                                   // login box where the buttons were, Login / Close below it
      const ok = L.find(x => x.n === 'cmdOk'), cancel = L.find(x => x.n === 'cmdCancel');
      ok.x = fr.x + Math.round((fr.w - ok.w - cancel.w) / 2); cancel.x = ok.x + ok.w;
      ok.y = cancel.y = fr.y + fr.h + 14;
      const lab = n => ({ ...S.find(x => x.n === n), s: 14.25, fg: '&H00000000&' });
      L.push({ n: 'fraDate', t: 'Frame', x: fr.x, y: fr.y, w: fr.w, h: 100, b: 1, ti: 40, bg: fr.bg, f: 'Arial', s: 11.25, kids: [
        { ...lab('lblStep3(1)'), n: 'lblDate', x: 16, y: 26, w: 100, h: 24 },
        { ...S.find(x => x.n === 'dmdate1'), x: 128, y: 24, w: 110, h: 26, ti: 2 },
        { ...lab('lblNCODE_NO'), n: 'lblTime', x: 16, y: 62, w: 110, h: 24 },
        { ...S.find(x => x.n === 'dmtime1'), x: 128, y: 60, w: 150, h: 28, ti: 3 }] });
    }
    const F = vbForm('logon', { noTitle: true });
    const pic = (n, src) => { const p = F.c[n]; p.style.backgroundImage = `url(img/${src})`; p.classList.add('vb-pic-img'); };
    pic('Picture2', 'logo.jpg'); pic('Picture1', 'logon.jpg');
    F.c.Label1.textContent = MR.title1;
    F.c.Label1.classList.add('mr-raw');
    F.show('fraStep3(0)');          // user name / password (hidden in the VB form, needed on the web)
    F.enable('fraStep3(0)');
    F.c.txtUID.value = 'admin';
    F.show('fraDate', false);
    F.c.dmtime1.setItems(TIME_ITEMS());
    F.c.dmdate1.value = VBDate.text(Fmt.today());
    F.c.dmtime1.value = new Date().getHours() < 13 ? 1 : 2;
    vbCalendar(F.c.dmdate1);
    let busy = false, logged = false;
    const login = async () => {
      FullScreen.on();
      try {
        const r = await API.post('/api/auth/login', { userName: F.c.txtUID.value, password: F.c.txtPWD.value });
        sessionStorage.setItem('mb_token', r.token);
        sessionStorage.setItem('mb_user', JSON.stringify({ userName: r.userName, displayName: r.displayName }));
      } catch (e) { await UI.alert(' Incorrect User Name Or Password Or Data Base '); F.focus('txtPWD'); return; }
      logged = true;
      F.show('fraStep3(0)', false);
      F.show('fraDate'); F.enable('fraDate');
      F.c.cmdOk.textContent = 'Ok';
      F.focus('dmdate1');
    };
    const useDate = async () => {
      const iso = VBDate.iso(F.c.dmdate1.value);
      if (!iso) { await UI.alert('Invalid date'); return F.focus('dmdate1'); }
      if (!F.c.dmtime1.value) { await UI.alert(' Incorrect Time  '); return F.focus('dmtime1'); }
      Session.clear();
      // no fortnight for the date: VB asks to create it; otherwise the user picks another date here
      if (await Session.use(iso, Number(F.c.dmtime1.value))) this.showShell(false);
      else F.focus('dmdate1');
    };
    const go = async () => {
      if (busy) return;
      busy = true;
      try { await (logged ? useDate() : login()); } finally { busy = false; }
    };
    F.click('cmdOk', go);
    F.click('cmdCancel', () => this.quit());   // VB: Unload Me -> program ends
    F.on('txtPWD', 'keydown', e => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); go(); } });
    F.c.dmtime1.input.addEventListener('keydown', e => { if (e.key === 'Enter') setTimeout(go, 0); });
    const host = h('div', { class: 'login-host' }, F.el);
    document.getElementById('app').replaceChildren(host);
    F.focus('txtPWD');
  },

  logout() {
    sessionStorage.removeItem('mb_token');
    sessionStorage.removeItem('mb_user');
    Session.clear();
    Lookups.clear();
    nav('');
    this.showLogin();
  },

  async showShell(fresh) {
    const menu = h('nav', { class: 'mdi-menu' },
      MENU.map(m => h('div', { class: 'menu' }, h('button', { class: 'menu-btn', type: 'button', 'data-short': m.t.trim() === 'Master Data Entry' ? 'Master' : null }, m.t.trim()),
        h('div', { class: 'menu-drop' }, m.items.map(([r, t]) => h('a', { href: '#/' + r, onclick: e => { e.preventDefault(); App.closeMenus(e.currentTarget); nav('#/' + r); } }, t))))),
      h('div', { class: 'menu' }, h('button', { class: 'menu-btn', type: 'button', onclick: () => this.exit() }, 'Exit')),
      h('div', { id: 'status', class: 'mdi-status' }));
    const shell = h('div', { class: 'mdi' }, menu, h('main', { id: 'main', class: 'mdi-client' }));
    document.getElementById('app').replaceChildren(shell);
    $$('.menu-btn', menu).forEach(b => b.addEventListener('click', () => {
      const m = b.parentElement; const open = m.classList.contains('open');
      $$('.menu.open').forEach(x => x.classList.remove('open'));
      if (!open && b.nextElementSibling) m.classList.add('open');
    }));
    document.addEventListener('click', e => { if (!e.target.closest('.menu')) $$('.menu.open').forEach(x => x.classList.remove('open')); });
    window.onhashchange = () => { $$('.menu.open').forEach(x => x.classList.remove('open')); this.route(); };
    this.renderStatus();
    if (fresh || !Session.get()) await Session.choose(true);
    this.route();
  },

  // MDI1.m_exit_Click: Set db_Conn = Nothing / End  -> the program closes
  /** close the drop-down menus after an item is chosen (on touch screens the :hover state would keep it open) */
  closeMenus(a) {
    $$('.menu.open').forEach(x => x.classList.remove('open'));
    const m = a && a.closest('.menu');
    if (m) { m.classList.add('closing'); m.addEventListener('mouseleave', () => m.classList.remove('closing'), { once: true }); setTimeout(() => m.classList.remove('closing'), 600); }
    if (a) a.blur();
  },
  exit() { this.quit(); },

  /** Ends the program: signs out and closes the window (like VB 'End'). */
  quit() {
    sessionStorage.removeItem('mb_token');
    sessionStorage.removeItem('mb_user');
    Session.clear();
    Lookups.clear();
    try { if (document.fullscreenElement) document.exitFullscreen(); } catch { /* */ }
    window.open('', '_self');
    window.close();
    // A browser only lets a page close the window it opened itself (desktop shortcut / Milk-Billing.bat do).
    // If the window is still open (normal browser tab), show an end screen instead.
    setTimeout(() => {
      if (window.closed) return;
      document.getElementById('app').replaceChildren(h('div', { class: 'quit-screen' },
        h('div', { class: 'mr' }, MR.title1),
        h('p', null, 'Milk Billing System is closed.'),
        h('p', null, 'This window was opened as a normal browser tab, so the browser does not allow the program to close it.'),
        h('p', null, 'Close it with Alt+F4 (or Ctrl+W). Start the program from the "Milk Billing" desktop icon - then Close / Exit close the window automatically.'),
        h('button', { type: 'button', class: 'vb-btn', onclick: () => { nav(''); App.showLogin(); } }, 'Start again')));
    }, 300);
  },

  renderStatus() {
    const el = document.getElementById('status');
    if (!el) return;
    const s = Session.get();
    el.replaceChildren(...[
      s ? h('span', null, mr(MR.date), ' ', VBDate.text(s.date), '  ', mr(Fmt.time(s.time))) : null,
      s ? h('span', null, mr(MR.fortnight), ' ', s.nfortno, '  (', VBDate.text(s.dstart_date), ' - ', VBDate.text(s.dend_date), ')  ', s.vyear_code) : null,
      h('button', { type: 'button', class: 'vb-btn small', onclick: async () => { if (await Session.choose()) this.route(); } }, 'Change Date'),
      h('button', { type: 'button', class: 'vb-btn small', title: 'Full screen (F11)', onclick: () => FullScreen.toggle() }, '⛶'),
      h('button', { type: 'button', class: 'vb-btn small', onclick: () => this.logout() }, 'Logout')].filter(Boolean));
  },

  route() {
    const main = document.getElementById('main');
    if (!main) return;
    const r = (location.hash || '').replace(/^#\/?/, '') || 'home';
    const page = Pages[r] || Pages.home;
    const body = h('div', { class: 'mdi-page' });
    main.replaceChildren(body);
    Promise.resolve().then(() => page(body)).catch(UI.error);
  }
};

Pages.home = () => { /* MDI background only, like the VB program */ };

window.addEventListener('DOMContentLoaded', () => App.start());
