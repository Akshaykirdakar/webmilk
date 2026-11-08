global.window={}; require('D:/dairy/webmilk/frontend/js/vbforms.js');
const pr=(c,d)=>{ if(c.t==='Line') return; console.log('  '.repeat(d)+[c.n,c.t,c.x,c.y,c.w,c.h,c.f||'',c.s||'',c.ti??'',c.cap??c.txt??'',c.hid?'HID':'',c.dis?'dis':'',c.bk!==undefined?'bk'+c.bk:'',c.cols?c.cols.map(x=>x.t+':'+x.w).join(','):''].join('|')); (c.kids||[]).forEach(k=>pr(k,d+1)); };
for (const k of process.argv.slice(2)) { const f=window.VBF[k]; console.log('#### '+k, f.caption,f.w,f.h,f.bg); f.c.forEach(c=>pr(c,0)); }
