'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');const zlib=require('node:zlib');
const {Tools,zipEntries,unzipMember}=require('../app/lib/tools.cjs');
function fixture(name,content,compressed=false){
 const n=Buffer.from(name),raw=Buffer.from(content),data=compressed?zlib.deflateRawSync(raw):raw;
 const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(compressed?8:0,8);local.writeUInt32LE(data.length,18);local.writeUInt32LE(raw.length,22);local.writeUInt16LE(n.length,26);
 const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50);central.writeUInt16LE(compressed?8:0,10);central.writeUInt32LE(data.length,20);central.writeUInt32LE(raw.length,24);central.writeUInt16LE(n.length,28);
 const offset=local.length+n.length+data.length,end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(1,8);end.writeUInt16LE(1,10);end.writeUInt32LE(central.length+n.length,12);end.writeUInt32LE(offset,16);
 return Buffer.concat([local,n,data,central,n,end]);
}
for(const compressed of [false,true])test('wheel ZIP member extraction '+(compressed?'deflated':'stored'),()=>{const b=fixture('imageio_ffmpeg/binaries/ffmpeg-fixture','local binary fixture',compressed);assert.equal(unzipMember(b,zipEntries(b)[0]).toString(),'local binary fixture');});
test('wheel extraction rejects traversal before writing',()=>{assert.throws(()=>zipEntries(fixture('../escape','x')),/안전/);});
test('wheel extraction rejects encrypted member',()=>{const b=fixture('ffmpeg','x'),e=zipEntries(b)[0];e.flags|=1;assert.throws(()=>unzipMember(b,e),/지원/);});
test('engine install resets busy when local directory cannot be created',async()=>{const root=await fs.mkdtemp(path.join(os.tmpdir(),'ts-tools-'));try{const file=path.join(root,'not-a-folder');await fs.writeFile(file,'x');const t=new Tools(file);await assert.rejects(t.install());assert.equal(t.busy,false);assert.equal(t.controller,null);}finally{await fs.rm(root,{recursive:true,force:true});}});
test('missing engine manifests report setup required',async()=>{const root=await fs.mkdtemp(path.join(os.tmpdir(),'ts-tools-'));try{const t=new Tools(root);await t.init();assert.equal(t.health.ready,false);}finally{await fs.rm(root,{recursive:true,force:true});}});
