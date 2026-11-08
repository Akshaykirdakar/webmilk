// Extracts embedded pictures (JPEG/BMP/GIF) from a VB .frx file
const fs=require('fs'); const [file,out]=process.argv.slice(2); const b=fs.readFileSync(file); let n=0;
for(let i=0;i<b.length-4;i++){
  let ext=null,len=0;
  if(b[i]===0xFF&&b[i+1]===0xD8&&b[i+2]===0xFF){ ext='jpg'; let j=b.indexOf(Buffer.from([0xFF,0xD9]),i+3); while(j>0 && j<b.length){ len=j+2-i; const nx=b.indexOf(Buffer.from([0xFF,0xD9]),j+2); if(nx<0||b.indexOf(Buffer.from([0xFF,0xD8,0xFF]),i+3)!==-1&&b.indexOf(Buffer.from([0xFF,0xD8,0xFF]),i+3)<nx) break; j=nx; } }
  else if(b[i]===0x42&&b[i+1]===0x4D&&b.readUInt32LE(i+2)>1000&&b.readUInt32LE(i+2)<=b.length-i&&b.readUInt32LE(i+6)===0){ ext='bmp'; len=b.readUInt32LE(i+2); }
  else if(b.toString('latin1',i,i+4)==='GIF8'){ ext='gif'; len=b.length-i; }
  if(ext&&len>200){ const name=`${out}_${n++}.${ext}`; fs.writeFileSync(name,b.subarray(i,i+len)); console.log(name, i, len); i+=len-1; }
}
