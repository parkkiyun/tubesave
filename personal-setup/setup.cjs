'use strict';
// Runs on the owner's computer. Authentication and private key never enter chat.
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {spawn,execFileSync}=require('node:child_process');
const {createInterface}=require('node:readline/promises');
const trust=require('../app/lib/personal-trust.cjs');
const network=require('../app/lib/personal-network.cjs');
const REPO=trust.REPO,SECRET='TUBESAVE_UPDATE_PRIVATE_KEY',ENVIRONMENT='tubesave-release';
const packagedGh=path.resolve(__dirname,'../runtime',process.platform==='win32'?'gh.exe':'gh');
let gh='gh';
async function command(args,{input,interactive=false}={}){
  return new Promise((resolve,reject)=>{
    const child=spawn(gh,args,{shell:false,stdio:interactive?'inherit':['pipe','pipe','pipe'],env:{...process.env,GH_NO_UPDATE_NOTIFIER:'1',GH_NO_EXTENSION_UPDATE_NOTIFIER:'1'}});
    const stdout=[];let count=0;
    if(!interactive){child.stdout.on('data',b=>{count+=b.length;if(count>2*1024*1024)child.kill();else stdout.push(b);});child.stderr.resume();child.stdin.on('error',()=>{});child.stdin.end(input);}
    child.once('error',()=>reject(Error('GitHub CLI를 실행하지 못했습니다. 압축을 모두 풀었는지 확인하세요.')));
    child.once('close',code=>code===0?resolve(Buffer.concat(stdout).toString('utf8')):reject(Error('GitHub 작업이 완료되지 않았습니다 (종료 코드 '+code+'). 로그인 계정·저장소 관리자 권한·tubesave-release 환경을 확인하세요.')));
  });
}
async function api(endpoint,body){return JSON.parse(await command(['api','--hostname','github.com',endpoint,...(body===undefined?[]:['--method','PUT','--input','-'])],body===undefined?{}:{input:JSON.stringify(body)}));}
async function confirm(question){const r=createInterface({input:process.stdin,output:process.stdout});try{return /^y(?:es)?$/i.test((await r.question(question+' [y/N] ')).trim());}finally{r.close();}}
async function privateDirectory(){
  const root=path.join(process.platform==='win32'?(process.env.LOCALAPPDATA||os.homedir()):path.join(os.homedir(),'.config'),'TubeSavePublisher');
  await fs.mkdir(root,{recursive:true,mode:0o700});if((await fs.lstat(root)).isSymbolicLink())throw Error('배포키 폴더는 심볼릭 링크일 수 없습니다.');
  if(process.platform==='win32'){
    const identity=(process.env.USERDOMAIN?process.env.USERDOMAIN+'\\':'')+process.env.USERNAME;
    if(!process.env.USERNAME)throw Error('현재 Windows 사용자를 확인하지 못했습니다.');
    execFileSync('icacls.exe',[root,'/inheritance:r','/grant:r',identity+':(OI)(CI)F'],{stdio:'ignore',windowsHide:true});
  }else await fs.chmod(root,0o700);
  return root;
}
async function readLocalKey(file){try{const st=await fs.lstat(file);if(st.isSymbolicLink()||!st.isFile())throw Error('Invalid key file.');if(process.platform!=='win32'&&(st.mode&0o077))throw Error('배포키 파일 접근 권한이 너무 넓습니다. 소유자만 읽을 수 있게 설정하세요.');const key=await fs.readFile(file,'utf8');trust.rawPublicKey(key);return key;}catch(e){if(e.code==='ENOENT')return null;throw e;}}
async function waitForBuild(sha,notBefore=0){
  for(let i=0;i<30;i++){
    const runs=JSON.parse(await command(['run','list','-R',REPO,'--workflow','personal-release.yml','--branch','main','--limit','10','--json','databaseId,headSha,createdAt']));
    const run=runs.find(r=>r.headSha===sha&&Date.parse(r.createdAt)>=notBefore);
    if(run){console.log('최초 설치본을 GitHub에서 빌드하고 있습니다. 이 창을 열어 두세요.');await command(['run','watch',String(run.databaseId),'-R',REPO,'--exit-status','--interval','10'],{interactive:true});return;}
    await new Promise(r=>setTimeout(r,3000));
  }
  throw Error('빌드 시작을 확인하지 못했습니다. GitHub Actions의 Personal release 실행 결과를 확인한 뒤 다시 실행하세요.');
}
async function installRelease(config,version){
  const base=`https://github.com/${REPO}/releases/download/personal-v${version}`;
  const manifest=trust.verifyEnvelope(await network.read(base+'/personal-update.json'),config.publicKey);
  if(manifest.version!==version)throw Error('릴리스 버전이 일치하지 않습니다.');
  const info=manifest.files.find(f=>f.platform===process.platform&&f.arch===process.arch);if(!info)throw Error('이 컴퓨터에 맞는 설치 파일이 없습니다.');
  const downloads=path.join(os.homedir(),'Downloads');await fs.mkdir(downloads,{recursive:true});const dir=await fs.mkdtemp(path.join(downloads,'TubeSave-Personal-'));
  const file=path.join(dir,info.name);console.log('서명된 설치 파일을 받고 있습니다…');
  await network.download(info.url,file,{size:info.size});await trust.verifyArchive(file,info,config.publicKey);
  console.log('설치 파일 서명 검증 완료.');
  if(process.platform==='darwin'){
    execFileSync('/usr/bin/ditto',['-x','-k',file,dir]);
    const source=path.join(dir,'TubeSave Personal.app');await fs.access(source);
    const applications=path.join(os.homedir(),'Applications');await fs.mkdir(applications,{recursive:true});const target=path.join(applications,'TubeSave Personal.app');
    let exists=false;try{await fs.lstat(target);exists=true;}catch{}
    if(exists){console.log('기존 TubeSave Personal을 덮어쓰지 않았습니다. 설치 파일 위치: '+dir);execFileSync('/usr/bin/open',[dir]);}
    else{execFileSync('/usr/bin/ditto',[source,target]);execFileSync('/usr/bin/open',[target]);console.log('설치 위치: '+target);}
  }else{
    const p=spawn(file,[],{detached:true,stdio:'ignore',shell:false});await new Promise((resolve,reject)=>{p.once('spawn',resolve);p.once('error',reject);});p.unref();
  }
}
async function main(){
  try{await fs.access(packagedGh);gh=packagedGh;}catch{}
  if(process.argv.includes('--self-test')){
    const {privateKey,publicKey}=crypto.generateKeyPairSync('ed25519'),b=Buffer.from('TubeSave setup test');
    if(!crypto.verify(null,b,publicKey,crypto.sign(null,b,privateKey)))throw Error('Crypto test failed.');
    console.log('SETUP_SELF_TEST_OK',process.platform,process.arch,process.version,(await command(['--version'])).split('\n')[0]);return;
  }
  if(!['darwin','win32'].includes(process.platform)||(process.platform==='win32'&&process.arch!=='x64'))throw Error('Mac 또는 Windows x64에서 실행하세요.');
  console.log('\nTubeSave 개인용 자동 업데이트 연결\n대상: '+REPO+'\n유료 인증서·구독·결제는 사용하지 않습니다.\n');
  console.log('이 도구는 무료 서명키를 이 컴퓨터에 만들고, 개인키를 GitHub 환경 Secret에 저장합니다.\n공개키만 저장소에 반영하고 Mac·Windows 설치본을 공개 릴리스로 배포합니다.\n소스·앱·설치 파일에는 개인키를 넣지 않습니다.\n');
  if(!await confirm('연결 및 배포를 진행할까요?'))return;
  try{await command(['auth','status','--hostname','github.com']);}catch{await command(['auth','login','--hostname','github.com','--web','--git-protocol','https','--scopes','repo,workflow'],{interactive:true});}
  const repo=await api('repos/'+REPO);if(!repo.permissions?.admin)throw Error('parkkiyun/tubesave의 관리자 계정으로 로그인해야 합니다.');
  const entry=await api('repos/'+REPO+'/contents/release/personal.json?ref=main');
  let config=JSON.parse(Buffer.from(entry.content,'base64').toString('utf8'));
  if(config.repository!==REPO||config.appId!==trust.APP_ID)throw Error('예상하지 않은 배포 설정입니다.');
  const dir=await privateDirectory(),keyFile=path.join(dir,'update-private.pem');let privateKey=await readLocalKey(keyFile);
  const alreadyBound=typeof config.publicKey==='string'&&config.publicKey.length>0;
  if(alreadyBound)trust.keyObject(config.publicKey);
  if(alreadyBound&&privateKey&&trust.rawPublicKey(privateKey)!==config.publicKey)throw Error('기존 공개키와 이 컴퓨터의 개인키가 다릅니다. 키를 자동 교체하지 않습니다.');
  if(!alreadyBound){
    if(!privateKey){privateKey=crypto.generateKeyPairSync('ed25519').privateKey.export({format:'pem',type:'pkcs8'});await fs.writeFile(keyFile,privateKey,{flag:'wx',mode:0o600});}
    config={format:'personal-ed25519',enabled:true,repository:REPO,appId:trust.APP_ID,publicKey:trust.rawPublicKey(privateKey)};
    await command(['secret','set',SECRET,'--env',ENVIRONMENT,'-R',REPO],{input:privateKey});
    const result=await api('repos/'+REPO+'/contents/release/personal.json',{message:'build: bind personal update public key',branch:'main',sha:entry.sha,content:Buffer.from(JSON.stringify(config,null,2)+'\n').toString('base64')});
    console.log('개인키는 이 컴퓨터와 GitHub Secret에만 보관했습니다. 공개키 연결 완료.\n배포키 백업 위치: '+keyFile);
    await waitForBuild(result.commit.sha);
  }else{
    console.log('이미 개인용 업데이트 키가 연결되어 있습니다. 기존 공개키는 교체하지 않습니다.');
    if(privateKey)await command(['secret','set',SECRET,'--env',ENVIRONMENT,'-R',REPO],{input:privateKey});
  }
  const p=await api('repos/'+REPO+'/contents/app/package.json?ref=main');const version=JSON.parse(Buffer.from(p.content,'base64').toString('utf8')).version;
  try{await api('repos/'+REPO+'/releases/tags/personal-v'+version);}
  catch{
    console.log('이 버전의 배포가 아직 없습니다. 개인용 빌드를 다시 요청합니다.');
    const requestedAt=Date.now()-1000;
    await command(['workflow','run','personal-release.yml','-R',REPO,'--ref','main']);
    const ref=await api('repos/'+REPO+'/git/ref/heads/main');
    await new Promise(r=>setTimeout(r,5000));await waitForBuild(ref.object.sha,requestedAt);
  }
  await installRelease(config,version);
  console.log('\n완료. 다음 버전부터 앱 안에서 업데이트 알림과 재시작 설치를 사용할 수 있습니다.');
}
if(require.main===module)main().catch(e=>{console.error('\n'+e.message+'\n기존 앱과 다운로드 영상은 삭제하지 않았습니다.');process.exitCode=1;});
module.exports={readLocalKey,privateDirectory};
