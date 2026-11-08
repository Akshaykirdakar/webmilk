// prints cmap (code -> glyph name) of a TrueType font using the 'post' table glyph names
const fs=require('fs'); const b=fs.readFileSync(process.argv[2]);
const n=b.readUInt16BE(4); const T={}; for(let i=0;i<n;i++){const o=12+i*16; T[b.toString('latin1',o,o+4)]={off:b.readUInt32BE(o+8),len:b.readUInt32BE(o+12)};}
const p=T.post.off; const ver=b.readUInt32BE(p); console.log('post version', ver.toString(16));
let names=[];
if(ver===0x20000){ const ng=b.readUInt16BE(p+32); const idx=[]; for(let i=0;i<ng;i++) idx.push(b.readUInt16BE(p+34+i*2)); let q=p+34+ng*2; const extra=[]; while(q<p+T.post.len){const l=b[q]; extra.push(b.toString('latin1',q+1,q+1+l)); q+=1+l;} names=idx.map(i=>i<258?'#'+i:extra[i-258]); }
// cmap format 4 (3,1)
const c=T.cmap.off, nt=b.readUInt16BE(c+2); let sub=null; for(let i=0;i<nt;i++){const r=c+4+i*8; if(b.readUInt16BE(r)===3&&b.readUInt16BE(r+2)===1) sub=c+b.readUInt32BE(r+4);}
const seg=b.readUInt16BE(sub+6)/2; const E=[],S=[],D=[],R=[]; for(let k=0;k<seg;k++){E.push(b.readUInt16BE(sub+14+k*2));S.push(b.readUInt16BE(sub+16+seg*2+k*2));D.push(b.readInt16BE(sub+16+seg*4+k*2));R.push(sub+16+seg*6+k*2);}
const out=[]; for(let k=0;k<seg;k++) for(let ch=S[k];ch<=E[k]&&ch!==0xffff;ch++){ let g; const ro=b.readUInt16BE(R[k]); if(!ro) g=(ch+D[k])&0xffff; else { const a=R[k]+ro+(ch-S[k])*2; g=b.readUInt16BE(a); if(g) g=(g+D[k])&0xffff; } out.push(ch.toString(16)+'='+(names[g]||g)); }
console.log(out.join(' '));
