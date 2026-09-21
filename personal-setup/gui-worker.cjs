'use strict';
// Non-interactive publisher setup. Only a validated IPC start message from the
// consented local GUI starts this process. No tokens, keys, or raw CLI logs leave it.
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {spawn,execFileSync}=require('node:child_process');
const trust=require('../app/lib/personal-trust.cjs'),network=require('../app/lib/personal-network.cjs');
const {privateDirectory,readLocalKey}=require('./setup.cjs');
const gh=path.resolve(__dirname,'../runtime',process.platform==='win32'?'gh.exe':'gh');
const children=new Set();let started=false,stopping=false;
const emit=e=>{if(process.connected)process.send(e);};
const say=message=>emit({type:'progress',message});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function command(args,input){return new Promise((resolve,reject)=>{
 const login=args[0]==='auth'&&args[1]==='login';
 const env={...process.env,GH_NO_UPDATE_NOTIFIER:'1',GH_NO_EXTENSION_UPDATE_NOTIFIER:'1',NO_COLOR:'1',CLICOLOR:'0'};
 if(login)env.GH_BROWSER=process.platform==='win32'?'cmd /d /c exit 0':'/usr/bin/true';
 const child=spawn(gh,args,{shell:false,windowsHide:true,stdio:['pipe','pipe','pipe'],env});children.add(child);
 const output=[];let count=0,diagnostic='';
 const timer=setTimeout(()=>{child.kill();reject(Error('GitHub 연결 대기 시간이 초과됐습니다. 다시 시도하세요.'));},login?15*60*1000:90000);timer.unref();
 const inspect=b=>{if(!login)return;diagnostic=(diagnostic+b.toString('utf8')).slice(-8000);const m=diagnostic.match(/(?:one-time code|code:)\s*:?\s*([A-Z0-9]{4}-[A-Z0-9]{4})/i);if(m)emit({type:'auth',code:m[1]});};
 child.stdout.on('data',b=>{count+=b.length;if(count>4*1024*1024)child.kill();else output.push(b);inspect(b);});child.stderr.on('data',inspect);
 child.stdin.on('error',()=>{});child.stdin.end(login?'\n':input);
 child.once('error',()=>{clearTimeout(timer);reject(Error('내장 GitHub 도구를 실행하지 못했습니다.'));});
 child.once('close',code=>{clearTimeout(timer);children.delete(child);code===0?resolve(Buffer.concat(output).toString('utf8')):reject(Error('GitHub 작업 실패 ('+code+'). 관리자 계정과 tubesave-release 환경을 확인하세요.'));});
});}
async function api(endpoint,body){return JSON.parse(await command(['api','--hostname','github.com',endpoint,...(body===undefined?[]:['--method','PUT','--input','-'])],body===undefined?undefined:JSON.stringify(body)));}
async function waitBuild(sha,notBefore=0){
 const deadline=Date.now()+40*60*1000;
 while(Date.now()<deadline&&!stopping){
  const runs=JSON.parse(await command(['run','list','-R',trust.REPO,'--workflow','personal-release.yml','--branch','main','--limit','20','--json','databaseId,headSha,createdAt,status,conclusion']));
  const run=runs.find(r=>r.headSha===sha&&Date.parse(r.createdAt)>=notBefore);
  if(run?.status==='completed'){if(run.conclusion!=='success')throw Error('개인용 설치본 빌드가 실패했습니다. GitHub Actions에서 Personal release 실행을 확인하세요.');return;}
  say('GitHub에서 개인용 설치본을 빌드하고 있어요.\nMac·Windows 파일을 준비하는 동안 이 창을 열어 두세요.');await sleep(10000);
 }
 throw Error('빌드 대기 시간이 초과됐습니다. 나중에 연결을 다시 시작하면 이어서 확인합니다.');
}
async function main(){
 if(!['darwin','win32'].includes(process.platform))throw Error('Mac 또는 Windows용 앱에서 실행하세요.');
 say('GitHub 로그인을 확인하고 있어요.');
 try{await command(['auth','status','--hostname','github.com']);}catch{await command(['auth','login','--hostname','github.com','--web','--git-protocol','https','--scopes','repo,workflow','--skip-ssh-key']);}
 const repo=await api('repos/'+trust.REPO);if(!repo.permissions?.admin)throw Error('parkkiyun/tubesave의 관리자 계정으로 로그인해야 합니다.');
 const entry=await api('repos/'+trust.REPO+'/contents/release/personal.json?ref=main');
 let config=JSON.parse(Buffer.from(entry.content,'base64').toString('utf8'));
 if(config.repository!==trust.REPO||config.appId!==trust.APP_ID)throw Error('예상하지 않은 배포 설정입니다.');
 const dir=await privateDirectory(),keyFile=path.join(dir,'update-private.pem');let privateKey=await readLocalKey(keyFile);
 const bound=typeof config.publicKey==='string'&&config.publicKey.length>0;
 if(bound)trust.keyObject(config.publicKey);
 if(bound&&privateKey&&trust.rawPublicKey(privateKey)!==config.publicKey)throw Error('기존 공개키와 이 컴퓨터의 개인키가 다릅니다. 기존 키를 바꾸지 않았습니다.');
 if(!bound){
  if(!privateKey){privateKey=crypto.generateKeyPairSync('ed25519').privateKey.export({format:'pem',type:'pkcs8'});await fs.writeFile(keyFile,privateKey,{flag:'wx',mode:0o600});}
  config={format:'personal-ed25519',enabled:true,repository:trust.REPO,appId:trust.APP_ID,publicKey:trust.rawPublicKey(privateKey)};
  await command(['secret','set','TUBESAVE_UPDATE_PRIVATE_KEY','--env','tubesave-release','-R',trust.REPO],privateKey);
  const commit=await api('repos/'+trust.REPO+'/contents/release/personal.json',{message:'build: connect personal updates from desktop setup',branch:'main',sha:entry.sha,content:Buffer.from(JSON.stringify(config,null,2)+'\n').toString('base64')});
  say('공개키 연결 완료. 개인키는 이 컴퓨터와 GitHub 비밀값 저장소에만 보관했어요.');await waitBuild(commit.commit.sha);
 }else{say('이미 개인용 업데이트가 연결돼 있어요. 기존 공개키를 유지합니다.');if(privateKey)await command(['secret','set','TUBESAVE_UPDATE_PRIVATE_KEY','--env','tubesave-release','-R',trust.REPO],privateKey);}
 const pkg=await api('repos/'+trust.REPO+'/contents/app/package.json?ref=main');const version=JSON.parse(Buffer.from(pkg.content,'base64').toString('utf8')).version;
 trust.compare(version,version);
 try{await api('repos/'+trust.REPO+'/releases/tags/personal-v'+version);}catch{
  const notBefore=Date.now()-1000;await command(['workflow','run','personal-release.yml','-R',trust.REPO,'--ref','main']);const ref=await api('repos/'+trust.REPO+'/git/ref/heads/main');await waitBuild(ref.object.sha,notBefore);
 }
 say('서명된 설치 파일을 받고 있어요.');
 const base='https://github.com/'+trust.REPO+'/releases/download/personal-v'+version;
 const manifest=trust.verifyEnvelope(await network.read(base+'/personal-update.json'),config.publicKey);
 if(manifest.version!==version)throw Error('릴리스 버전이 일치하지 않습니다.');
 const info=manifest.files.find(f=>f.platform===process.platform&&f.arch===process.arch);if(!info)throw Error('이 컴퓨터에 맞는 설치 파일이 없습니다.');
 const downloads=path.join(os.homedir(),'Downloads');await fs.mkdir(downloads,{recursive:true});const stage=await fs.mkdtemp(path.join(downloads,'TubeSave-Personal-')),file=path.join(stage,info.name);
 await network.download(info.url,file,{size:info.size});await trust.verifyArchive(file,info,config.publicKey);
 say('설치 파일 서명 검증 완료. 설치를 시작합니다.');
 if(process.platform==='darwin'){
  execFileSync('/usr/bin/ditto',['-x','-k',file,stage]);const source=path.join(stage,'TubeSave Personal.app');await fs.access(source);
  const applications=path.join(os.homedir(),'Applications');await fs.mkdir(applications,{recursive:true});const target=path.join(applications,'TubeSave Personal.app');
  let exists=false;try{await fs.lstat(target);exists=true;}catch(e){if(e.code!=='ENOENT')throw e;}
  if(exists){execFileSync('/usr/bin/open',[stage]);say('기존 Personal 앱을 보호하기 위해 설치 파일 폴더를 열었어요. 기존 앱을 종료한 뒤 새 앱으로 교체해 주세요.');}
  else{execFileSync('/usr/bin/ditto',[source,target]);execFileSync('/usr/bin/open',[target]);say('설치 위치: '+target);}
 }else{const child=spawn(file,[],{detached:true,stdio:'ignore',shell:false,windowsHide:false});await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});child.unref();}
 emit({type:'done'});
}
process.on('message',async m=>{if(m?.action!=='start'||started)return;started=true;try{await main();}catch(e){emit({type:'error',message:String(e.message).slice(0,1500)});}finally{if(process.connected)process.disconnect();}});
process.on('disconnect',()=>{stopping=true;for(const child of children)child.kill();process.exit(0);});
