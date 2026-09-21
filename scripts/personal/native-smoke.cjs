'use strict';
// Two packaged versions, actual Sparkle/NSIS replacement, bad archive rejection,
// and data preservation. Ephemeral key is never published or uploaded.
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),http=require('node:http'),crypto=require('node:crypto');
const {spawn,execFileSync}=require('node:child_process');
const {createReadStream}=require('node:fs');
const T=require('../../app/lib/personal-trust.cjs');const {buildPersonal}=require('./build.cjs');
async function waitUntil(fn,ms=180000){const end=Date.now()+ms;while(Date.now()<end){const r=await fn();if(r)return r;await new Promise(r=>setTimeout(r,1000));}throw Error('Native update test timed out.');}
async function run(exe,args){const p=spawn(exe,args,{stdio:'inherit',shell:false});await new Promise((resolve,reject)=>{p.once('error',reject);p.once('exit',c=>c===0?resolve():reject(Error('Installer exit '+c)));});}
async function main(){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'tubesave-native-update-'));const dataDir=path.join(dir,'data');await fs.mkdir(dataDir);await fs.writeFile(path.join(dataDir,'preserve.txt'),'keep my settings and video references');
 const result=path.join(dir,'result.json'),{privateKey}=crypto.generateKeyPairSync('ed25519');let manifest,archive,served=0;
 const server=http.createServer(async(req,res)=>{
  if(req.url==='/personal-update.json'&&manifest){res.writeHead(200,{'Content-Type':'application/json'}).end(T.envelope(manifest,privateKey));return;}
  if(archive&&req.url==='/'+path.basename(archive)){
   served++;const st=await fs.stat(archive);res.writeHead(200,{'Content-Length':st.size,'Content-Type':'application/octet-stream'});
   if(served===1){const h=await fs.open(archive);const byte=Buffer.alloc(1);await h.read(byte,0,1,0);await h.close();byte[0]^=1;res.write(byte);createReadStream(archive,{start:1}).pipe(res);}else createReadStream(archive).pipe(res);return;
  }res.writeHead(404).end();
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  const config={format:'personal-ed25519',enabled:true,repository:T.REPO,appId:T.TEST_APP_ID,publicKey:T.rawPublicKey(privateKey),testOrigin:`http://127.0.0.1:${server.address().port}`,testDataDir:dataDir,testResult:result,testTarget:'2.2.1'};
  archive=await buildPersonal({config,version:'2.2.1',output:path.join(dir,'new'),test:true,engines:false});
  const info=await T.describeArchive(archive,'2.2.1',process.platform,process.arch,privateKey);
  manifest={format:1,appId:T.TEST_APP_ID,repository:T.REPO,version:'2.2.1',issuedAt:new Date().toISOString(),notes:'Native update integration fixture',files:[info]};
  const old=await buildPersonal({config,version:'2.2.0',output:path.join(dir,'old'),test:true,engines:false});
  const installDir=path.join(dir,'installed');await fs.mkdir(installDir);let exe,asar;
  if(process.platform==='darwin'){execFileSync('/usr/bin/ditto',['-x','-k',old,installDir]);const bundle=path.join(installDir,'TubeSave Update Test.app');exe=path.join(bundle,'Contents/MacOS/TubeSave Update Test');asar=path.join(bundle,'Contents/Resources/app.asar');}
  else{await run(old,['/S',`/D=${installDir}`]);exe=path.join(installDir,'TubeSave Update Test.exe');asar=path.join(installDir,'resources/app.asar');}
  const child=spawn(exe,[],{stdio:'inherit',shell:false});child.on('error',e=>console.error(e.message));
  const installed=await waitUntil(async()=>{try{return JSON.parse(await fs.readFile(result,'utf8'));}catch{}try{throw Error(await fs.readFile(result+'.failure','utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}return null;});
  if(installed.version!=='2.2.1'||served<2)throw Error('Update result was not verified.');
  if(await fs.readFile(result+'.tamper-rejected','utf8')!=='yes')throw Error('Bad signature was not rejected.');
  if(await fs.readFile(path.join(dataDir,'preserve.txt'),'utf8')!=='keep my settings and video references')throw Error('User data changed.');
  const {extractFile}=require('@electron/asar');const actual=JSON.parse(extractFile(asar,'package.json').toString('utf8'));if(actual.version!=='2.2.1')throw Error('Installed bytes did not change version.');
  await fs.mkdir('ci-results',{recursive:true});await fs.writeFile('ci-results/personal-native-update.json',JSON.stringify({...installed,tamperedArchiveRejected:true,settingsPreserved:true,installedArchiveVersion:actual.version},null,2));
  console.log('PERSONAL_NATIVE_UPDATE_OK',JSON.stringify(installed));
 }finally{server.close();}
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
