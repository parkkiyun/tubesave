'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),http=require('node:http');
const T=require('../app/lib/personal-trust.cjs');const N=require('../app/lib/personal-network.cjs');
const {PersonalUpdater,configValid}=require('../app/lib/personal-updater.cjs');
async function fixture(t,version='2.3.0',platform='win32',arch='x64'){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'personal-test-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const {privateKey}=crypto.generateKeyPairSync('ed25519'),publicKey=T.rawPublicKey(privateKey),file=path.join(dir,'update.bin');
 await fs.writeFile(file,'a real signed update fixture');
 const info=await T.describeArchive(file,version,platform,arch,privateKey);
 const m={format:1,appId:T.APP_ID,repository:T.REPO,version,notes:'변경 사항',issuedAt:new Date().toISOString(),files:[info]};
 const config={format:'personal-ed25519',enabled:true,repository:T.REPO,appId:T.APP_ID,publicKey};
 return{dir,privateKey,publicKey,file,info,m,config,encoded:T.envelope(m,privateKey)};
}
for(const [a,b,r]of [['2.2.0','2.1.9',1],['2.10.0','2.9.9',1],['2.0.0','3.0.0',-1],['2.2.0','2.2.0',0]])test('strict semantic comparison '+a+' '+b,()=>assert.equal(T.compare(a,b),r));
for(const v of ['02.2.0','2.2','2.2.0-alpha','2.2.0/exec','-1.0.0','9999999999.0.0'])test('reject malformed release version '+v,()=>assert.throws(()=>T.compare(v,'2.2.0')));
test('signed envelope and raw archive roundtrip',async t=>{const f=await fixture(t);assert.deepEqual(T.verifyEnvelope(f.encoded,f.publicKey),f.m);assert.equal(await T.verifyArchive(f.file,f.info,f.publicKey),true);});
test('unsigned changed notes are rejected before display',async t=>{const f=await fixture(t),e=JSON.parse(f.encoded);e.payload=Buffer.from(JSON.stringify({...f.m,notes:'evil'})).toString('base64');assert.throws(()=>T.verifyEnvelope(JSON.stringify(e),f.publicKey),/signature/);});
test('wrong signing key is rejected',async t=>{const f=await fixture(t),other=crypto.generateKeyPairSync('ed25519').privateKey;assert.throws(()=>T.verifyEnvelope(f.encoded,T.rawPublicKey(other)),/signature/);});
test('tampered cached executable is rejected',async t=>{const f=await fixture(t);const bytes=await fs.readFile(f.file);bytes[0]^=1;await fs.writeFile(f.file,bytes);await assert.rejects(T.verifyArchive(f.file,f.info,f.publicKey),/checksum/);});
test('same hash but forged archive signature is rejected',async t=>{const f=await fixture(t);await assert.rejects(T.verifyArchive(f.file,{...f.info,signature:Buffer.alloc(64).toString('base64')},f.publicKey),/signature/);});
test('truncated archive is rejected',async t=>{const f=await fixture(t);await fs.writeFile(f.file,'short');await assert.rejects(T.verifyArchive(f.file,f.info,f.publicKey),/size/);});
test('symlink update is rejected',async t=>{if(process.platform==='win32')return t.skip('Symlink creation requires policy permission');const f=await fixture(t),link=path.join(f.dir,'link');await fs.symlink(f.file,link);await assert.rejects(T.verifyArchive(link,f.info,f.publicKey),/type/);});
for(const patch of [{repository:'other/repo'},{appId:T.TEST_APP_ID},{version:'2.2.0-beta'},{files:[]}])test('manifest rejects identity/shape '+JSON.stringify(patch),async t=>{const f=await fixture(t);assert.throws(()=>T.validateManifest({...f.m,...patch}));});
for(const patch of [{url:'https://evil.example/update.exe'},{name:'../../evil.exe'},{size:-1},{size:T.MAX_FILE+1},{sha512:'nope'},{platform:'linux'},{arch:'arm64'}])test('manifest rejects unsafe archive '+JSON.stringify(patch),async t=>{const f=await fixture(t);assert.throws(()=>T.validateManifest({...f.m,files:[{...f.info,...patch}]}));});
test('duplicate architecture is rejected',async t=>{const f=await fixture(t);assert.throws(()=>T.validateManifest({...f.m,files:[f.info,f.info]}));});
for(const url of ['http://github.com/parkkiyun/tubesave','https://github.com.evil.org/u','https://user:pass@github.com/u','file:///tmp/u','https://127.0.0.1/u','https://github.com:444/u'])test('HTTPS update host boundary '+url,()=>assert.throws(()=>N.allowed(url)));
test('production distribution rejects missing key',()=>assert.equal(configValid({format:'personal-ed25519',enabled:true,repository:T.REPO,appId:T.APP_ID,publicKey:''}),false));
test('test HTTP endpoint is never used by real personal app',async t=>{const f=await fixture(t);const a=new PersonalUpdater({config:{...f.config,testOrigin:'http://127.0.0.1:1234'},version:'2.2.0',dataDir:f.dir});assert.equal(a.testOrigin,null);});
test('updater checks signed version and rejects downgrade',async t=>{const f=await fixture(t);const network={read:async()=>Buffer.from(f.encoded)};const a=new PersonalUpdater({config:f.config,version:'2.2.0',dataDir:f.dir,platform:'win32',arch:'x64',network});let offered;a.on('update-available',m=>offered=m);await a.checkForUpdates();assert.equal(offered.version,'2.3.0');network.read=async()=>Buffer.from(T.envelope({...f.m,version:'2.2.5',files:[{...f.info,name:T.fileName('2.2.5','win32','x64'),url:T.fileURL('2.2.5','win32','x64')}]},f.privateKey));await assert.rejects(a.checkForUpdates(),/rollback/);});
test('unchanged installed version is not offered',async t=>{const f=await fixture(t);const a=new PersonalUpdater({config:f.config,version:'2.3.0',dataDir:f.dir,network:{read:async()=>Buffer.from(f.encoded)}});let noUpdate=false;a.on('update-not-available',()=>noUpdate=true);await a.checkForUpdates();assert.equal(noUpdate,true);});
test('downloaded event occurs only after signature passes',async t=>{const f=await fixture(t);const network={read:async()=>Buffer.from(f.encoded),download:async(_u,out)=>fs.copyFile(f.file,out)};const a=new PersonalUpdater({config:f.config,version:'2.2.0',dataDir:f.dir,platform:'win32',arch:'x64',network});let downloaded=0;a.on('update-downloaded',()=>downloaded++);await a.checkForUpdates();await a.downloadUpdate();assert.equal(downloaded,1);assert.equal(await T.verifyArchive(a.file,f.info,f.publicKey),true);});
test('tampered first download never becomes installable',async t=>{const f=await fixture(t);const a=new PersonalUpdater({config:f.config,version:'2.2.0',dataDir:f.dir,platform:'win32',arch:'x64',network:{read:async()=>Buffer.from(f.encoded),download:async(_u,out)=>fs.writeFile(out,'bad')}});let downloaded=false;a.on('update-downloaded',()=>downloaded=true);await a.checkForUpdates();await assert.rejects(a.downloadUpdate());assert.equal(downloaded,false);assert.equal(a.file,null);assert.equal(a.stage,null);});
test('HTTP size bound terminates oversized manifest',async t=>{const server=http.createServer((_req,res)=>res.end('x'.repeat(100)));await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>server.close());const origin=`http://127.0.0.1:${server.address().port}`;await assert.rejects(N.read(origin,{testOrigin:origin,limit:10}),/large/);});
test('signed Mac appcast carries archive Ed25519 signature',async t=>{const f=await fixture(t,'2.3.0','darwin','arm64');const xml=T.appcast(f.m,f.info);assert.ok(xml.includes(f.info.signature));assert.ok(xml.includes('sparkle:version>2.3.0'));assert.ok(xml.includes('12.0'));});

test('all platform release files and appcasts are signed without a paid certificate',async t=>{
 const f=await fixture(t),dir=path.join(f.dir,'release');await fs.mkdir(dir);
 const version=require('../app/package.json').version;
 for(const [p,a]of [['darwin','arm64'],['darwin','x64'],['win32','x64']])await fs.writeFile(path.join(dir,T.fileName(version,p,a)),'signed-fixture-'+p+a);
 await require('../scripts/personal/sign-release.cjs').signRelease(dir,f.config,f.privateKey);
 const m=T.verifyEnvelope(await fs.readFile(path.join(dir,'personal-update.json')),f.publicKey);assert.equal(m.files.length,3);
 for(const a of m.files)assert(await T.verifyArchive(path.join(dir,a.name),a,f.publicKey));
 assert((await fs.readFile(path.join(dir,'appcast-arm64.xml'),'utf8')).includes('sparkle:edSignature'));
});
test('release signing refuses a different key',async t=>{const f=await fixture(t);await assert.rejects(require('../scripts/personal/sign-release.cjs').signRelease(f.dir,f.config,crypto.generateKeyPairSync('ed25519').privateKey),/match/);});
test('publisher refuses publicly readable local private key',async t=>{
 if(process.platform==='win32')return t.skip('POSIX permission check');
 const f=await fixture(t),key=path.join(f.dir,'publisher.pem');await fs.writeFile(key,f.privateKey.export({format:'pem',type:'pkcs8'}),{mode:0o644});
 await assert.rejects(require('../personal-setup/setup.cjs').readLocalKey(key),/권한/);
 await fs.chmod(key,0o600);assert(await require('../personal-setup/setup.cjs').readLocalKey(key));
});
test('personal release workflow signs the directory used by build outputs',async()=>{
 const script=await fs.readFile(path.join(__dirname,'../scripts/personal/sign-release.cjs'),'utf8');assert(script.includes("process.argv[2]||'dist-personal'"));
 const workflow=await fs.readFile(path.join(__dirname,'../.github/workflows/personal-release.yml'),'utf8');assert(workflow.includes('path: dist-personal'));assert(workflow.includes('environment: tubesave-release'));assert(workflow.includes('secrets.TUBESAVE_UPDATE_PRIVATE_KEY'));
});
