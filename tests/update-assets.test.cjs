'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {verifyFeed}=require('../scripts/validate-update-assets.cjs');
async function fixture(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'tubesave-feed-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const bytes=Buffer.from('test fixture, not an installer');const url='TubeSave-2.1.0-mac-arm64.zip';await fs.writeFile(path.join(root,url),bytes);return {root,data:{version:'2.1.0',files:[{url,size:bytes.length,sha512:crypto.createHash('sha512').update(bytes).digest('base64')}]}};}
test('release metadata verifies exact referenced bytes',async t=>{const {root,data}=await fixture(t);assert(await verifyFeed(data,root,'2.1.0','.zip'));});
test('release metadata rejects wrong version',async t=>{const {root,data}=await fixture(t);await assert.rejects(verifyFeed(data,root,'2.1.1','.zip'));});
test('release metadata rejects file tampering',async t=>{const {root,data}=await fixture(t);await fs.writeFile(path.join(root,data.files[0].url),'tampered');await assert.rejects(verifyFeed(data,root,'2.1.0','.zip'));});
test('release metadata rejects path traversal',async t=>{const {root,data}=await fixture(t);data.files[0].url='../other.zip';await assert.rejects(verifyFeed(data,root,'2.1.0','.zip'));});
test('release metadata requires installer format',async t=>{const {root,data}=await fixture(t);await assert.rejects(verifyFeed(data,root,'2.1.0','.exe'));});
test('release metadata rejects duplicate entries',async t=>{const {root,data}=await fixture(t);data.files.push({...data.files[0]});await assert.rejects(verifyFeed(data,root,'2.1.0','.zip'));});
