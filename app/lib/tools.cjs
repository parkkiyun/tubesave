'use strict';
// Dependencies are prepared by the installer or an explicit repair/update, over HTTPS, with
// SHA-256 checks. No remote install script is ever executed.
const https=require('node:https');
const fs=require('node:fs/promises');
const fss=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const zlib=require('node:zlib');
const {pipeline}=require('node:stream/promises');
const {Transform}=require('node:stream');
const {UserError}=require('./core.cjs');
const {runProcess}=require('./process.cjs');
const HOSTS=new Set(['api.github.com','github.com','objects.githubusercontent.com','release-assets.githubusercontent.com','github-releases.githubusercontent.com','pypi.org','files.pythonhosted.org']);
function validDownloadUrl(url) {
  const u=new URL(url);if(u.protocol!=='https:'||u.username||u.password||u.port||!HOSTS.has(u.hostname))throw new UserError('허용되지 않은 다운로드 서버입니다.');return u;
}
function request(url, redirects=0, signal) {
  return new Promise((resolve,reject)=>{
    let u;try{u=validDownloadUrl(url);}catch(e){reject(e);return;}
    const req=https.get(u,{headers:{'User-Agent':'TubeSave-Desktop/2.1','Accept':'application/json,application/octet-stream;q=0.9,*/*;q=0.8'},signal},res=>{
      if([301,302,303,307,308].includes(res.statusCode)) {
        res.resume();if(redirects>=8)return reject(new UserError('서버 리디렉션이 너무 많습니다.'));
        let next;try{next=new URL(res.headers.location,u).href;}catch{return reject(new UserError('잘못된 다운로드 주소입니다.'));}
        request(next,redirects+1,signal).then(resolve,reject);return;
      }
      if(res.statusCode!==200){res.resume();reject(new UserError(`구성요소 서버 응답 ${res.statusCode}. 인터넷 연결이나 GitHub 요청 제한을 확인하세요.`));return;}
      res.on('error',reject);resolve(res);
    });
    req.setTimeout(45000,()=>req.destroy(new Error('구성요소 서버 연결 시간이 초과되었습니다.')));
    req.on('error',reject);
  });
}
async function getText(url,signal,max=8*1024*1024) {
  const res=await request(url,0,signal);const chunks=[];let n=0;
  for await(const c of res){n+=c.length;if(n>max){res.destroy();throw new UserError('구성요소 정보가 너무 큽니다.');}chunks.push(c);}
  return Buffer.concat(chunks).toString('utf8');
}
async function getJson(url,signal){return JSON.parse(await getText(url,signal));}
function sumFor(text,name){
  for(const line of text.split(/\r?\n/)){const m=line.match(/^([0-9a-f]{64})\s+\*?(.+)$/i);if(m&&m[2]===name)return m[1].toLowerCase();}
  throw new UserError(`${name}의 SHA-256 정보를 찾지 못했습니다.`);
}
async function fetchVerified(url,dest,expected,{signal,onProgress=()=>{}}={}) {
  if(!/^[a-f0-9]{64}$/i.test(expected||''))throw new UserError('구성요소 체크섬이 없습니다.');
  const part=dest+'.part-'+crypto.randomUUID();const hash=crypto.createHash('sha256');let got=0;
  await fs.mkdir(path.dirname(dest),{recursive:true,mode:0o700});
  try {
    const res=await request(url,0,signal);const total=Number(res.headers['content-length'])||0;
    const meter=new Transform({transform(chunk,enc,cb){got+=chunk.length;if(got>512*1024*1024)return cb(new UserError('구성요소 파일이 너무 큽니다.'));hash.update(chunk);onProgress(got,total);cb(null,chunk);}});
    await pipeline(res,meter,fss.createWriteStream(part,{flags:'wx',mode:0o600}),{signal});
    if(hash.digest('hex')!==expected.toLowerCase())throw new UserError('파일 무결성 확인에 실패했습니다. 다시 설치해 주세요.');
    await fs.rename(part,dest);
  }finally{await fs.rm(part,{force:true}).catch(()=>{});}
}
function zipEntries(buffer) {
  let e=-1;for(let i=buffer.length-22;i>=Math.max(0,buffer.length-65557);i--)if(buffer.readUInt32LE(i)===0x06054b50){e=i;break;}
  if(e<0)throw new UserError('구성요소 ZIP 파일이 올바르지 않습니다.');
  const count=buffer.readUInt16LE(e+10);let pos=buffer.readUInt32LE(e+16);const entries=[];
  if(count>10000)throw new UserError('ZIP 파일 항목이 너무 많습니다.');
  for(let i=0;i<count;i++){
    if(pos+46>buffer.length||buffer.readUInt32LE(pos)!==0x02014b50)throw new UserError('손상된 ZIP 디렉터리입니다.');
    const n=buffer.readUInt16LE(pos+28),x=buffer.readUInt16LE(pos+30),c=buffer.readUInt16LE(pos+32);
    const name=buffer.toString('utf8',pos+46,pos+46+n);
    if(name.includes('\\')||name.startsWith('/')||name.split('/').includes('..'))throw new UserError('안전하지 않은 ZIP 경로입니다.');
    entries.push({name,method:buffer.readUInt16LE(pos+10),size:buffer.readUInt32LE(pos+20),uncompressed:buffer.readUInt32LE(pos+24),offset:buffer.readUInt32LE(pos+42),flags:buffer.readUInt16LE(pos+8)});pos+=46+n+x+c;
  }return entries;
}
function unzipMember(buffer,entry) {
  const p=entry.offset;
  if(entry.flags&1||entry.uncompressed>256*1024*1024||p+30>buffer.length||buffer.readUInt32LE(p)!==0x04034b50)throw new UserError('지원하지 않는 ZIP 구성요소입니다.');
  const begin=p+30+buffer.readUInt16LE(p+26)+buffer.readUInt16LE(p+28),end=begin+entry.size;
  if(end>buffer.length)throw new UserError('잘린 ZIP 구성요소입니다.');
  const data=buffer.subarray(begin,end);
  const out=entry.method===0?Buffer.from(data):entry.method===8?zlib.inflateRawSync(data,{maxOutputLength:256*1024*1024}):null;
  if(!out||out.length!==entry.uncompressed)throw new UserError('ZIP 구성요소를 풀지 못했습니다.');return out;
}
function pickWheel(meta,platform,arch) {
  if(!['darwin','win32'].includes(platform))throw new UserError('이 설치기는 Mac·Windows용입니다.');
  if(platform==='win32'&&arch!=='x64')throw new UserError('이 Windows 패키지는 x64용입니다.');
  const test=platform==='win32'?/win_amd64\.whl$/:arch==='arm64'?/macosx_[\w]+_arm64\.whl$/:/macosx_[\w]+_x86_64\.whl$/;
  const w=(meta.urls||[]).find(x=>x.packagetype==='bdist_wheel'&&!x.yanked&&test.test(x.filename));
  if(!w)throw new UserError('이 컴퓨터에 맞는 FFmpeg 구성요소를 찾지 못했습니다.');return w;
}
class Tools {
  constructor(root,{platform=process.platform,arch=process.arch,onChange=()=>{},bundledRoot=null,io={}}={}){this.bundledRoot=bundledRoot;this.io={getJson,getText,fetchVerified,runProcess,...io};this.root=root;this.platform=platform;this.arch=arch;this.onChange=onChange;this.health={ready:false,yt_dlp:'미설치',issues:['설치에 포함된 다운로드 엔진을 확인하고 있습니다.']};this.busy=false;this.status='';this.controller=null;}
  async readRuntime(root, bundled=false){
    if(!root)return null;
    try {
      const m=JSON.parse(await fs.readFile(path.join(root,'current.json'),'utf8'));
      if(!/^runtime-[a-zA-Z0-9-]+$/.test(m.folder))return null;
      const dir=path.join(root,m.folder);
      const yd=path.join(dir,this.platform==='win32'?'yt-dlp.exe':'yt-dlp');
      const ff=path.join(dir,this.platform==='win32'?'ffmpeg.exe':'ffmpeg');
      for(const file of [yd,ff]){
        const st=await fs.lstat(file);
        if(!st.isFile()||st.isSymbolicLink()||!st.size)return null;
        const real=await fs.realpath(file),base=await fs.realpath(root);
        if(!real.startsWith(base+path.sep))return null;
      }
      // New installations always have per-binary digests; refuse incomplete or
      // modified bundles, including legacy v2.0 manifests without digests.
      if(!m.sha256||m.platform!==this.platform||m.arch!==this.arch)return null;
      for(const [file,key]of [[yd,'yt_dlp'],[ff,'ffmpeg']]){
        if(!/^[a-f0-9]{64}$/.test(m.sha256[key]||''))return null;
        const hash=crypto.createHash('sha256');
        for await(const chunk of fss.createReadStream(file))hash.update(chunk);
        if(hash.digest('hex')!==m.sha256[key])return null;
      }
      return {manifest:m,ytdlp:yd,ffmpeg:ff,bundled};
    }catch{return null;}
  }
  async init(){
    await fs.mkdir(this.root,{recursive:true,mode:0o700});
    const local=await this.readRuntime(this.root),bundle=await this.readRuntime(this.bundledRoot,true);
    // An explicitly updated engine wins only when it is at least as new as
    // the bundled engine. Updating the app must not resurrect an old engine.
    const selected=local&&(!bundle||String(local.manifest.ytdlp)>=String(bundle.manifest.ytdlp))?local:bundle;
    if(selected){
      this.ytdlp=selected.ytdlp;this.ffmpeg=selected.ffmpeg;
      this.health={ready:true,yt_dlp:String(selected.manifest.ytdlp),ffmpeg:true,runtime:'Electron Node.js',source:selected.bundled?'bundled':'updated',issues:[]};
    }else{
      this.ytdlp=null;this.ffmpeg=null;
      this.health={ready:false,yt_dlp:'확인 필요',source:'missing',issues:['다운로드 엔진을 확인하지 못했습니다. 설치 프로그램을 다시 실행하거나 설정에서 엔진 복구를 선택하세요.']};
    }
    this.onChange();
  }
  async install(){
    if(this.busy)throw new UserError('이미 엔진을 설치하고 있습니다.');
    this.busy=true;this.controller=new AbortController();const signal=this.controller.signal;
    const folder='runtime-'+crypto.randomUUID();const stage=path.join(this.root,folder);
    const report=s=>{this.status=s;this.onChange();};
    let committed=false, previous=null;
    try{previous=await fs.readFile(path.join(this.root,'current.json'));}catch{}
    try {
      await fs.mkdir(stage,{recursive:true,mode:0o700});
      report('1/3 · yt-dlp 공식 배포 정보 확인 중');
      const release=await this.io.getJson('https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest',signal);
      const assetName=this.platform==='darwin'?'yt-dlp_macos':this.platform==='win32'?'yt-dlp.exe':null;
      const a=(release.assets||[]).find(x=>x.name===assetName),check=(release.assets||[]).find(x=>x.name==='SHA2-256SUMS');
      if(!a||!check)throw new UserError('공식 yt-dlp 실행 파일 또는 체크섬을 찾지 못했습니다.');
      const hash=sumFor(await this.io.getText(check.browser_download_url,signal),assetName);
      const yd=path.join(stage,this.platform==='win32'?'yt-dlp.exe':'yt-dlp');
      let last=0;
      const progress=label=>(got,total)=>{if(Date.now()-last<300)return;last=Date.now();report(`${label} · ${total?Math.floor(got/total*100)+'%':Math.floor(got/1048576)+' MB'}`);};
      await this.io.fetchVerified(a.browser_download_url,yd,hash,{signal,onProgress:progress('1/3 · yt-dlp 설치')});
      await fs.chmod(yd,0o700);
      report('2/3 · FFmpeg 배포 정보 확인 중');
      const meta=await this.io.getJson('https://pypi.org/pypi/imageio-ffmpeg/json',signal);const w=pickWheel(meta,this.platform,this.arch);
      const wheel=path.join(stage,'ffmpeg-package.zip');await this.io.fetchVerified(w.url,wheel,w.digests.sha256,{signal,onProgress:progress('2/3 · FFmpeg 설치')});
      const bytes=await fs.readFile(wheel),entries=zipEntries(bytes);
      const binary=entries.find(x=>/^imageio_ffmpeg\/binaries\/ffmpeg[^/]*$/.test(x.name)&&!x.name.endsWith('.md'));
      if(!binary)throw new UserError('FFmpeg 실행 파일을 찾지 못했습니다.');
      const ff=path.join(stage,this.platform==='win32'?'ffmpeg.exe':'ffmpeg');await fs.writeFile(ff,unzipMember(bytes,binary),{mode:0o700,flag:'wx'});
      await fs.mkdir(path.join(stage,'licenses'));
      for(const entry of entries.filter(x=>/license|copying|readme/i.test(x.name)&&x.uncompressed<1024*1024))await fs.writeFile(path.join(stage,'licenses',entry.name.replaceAll('/','_')),unzipMember(bytes,entry));
      await fs.unlink(wheel);
      report('3/3 · 설치된 엔진 실행 확인 중');
      let version='';if(await this.io.runProcess(yd,['--version'],{signal,timeout:30000,onLine:x=>{version=x.trim();}})!==0)throw new UserError('yt-dlp 실행 확인에 실패했습니다.');
      if(await this.io.runProcess(ff,['-version'],{signal,timeout:30000})!==0)throw new UserError('FFmpeg 실행 확인에 실패했습니다.');
      await fs.writeFile(path.join(stage,'SOURCES.json'),JSON.stringify({yt_dlp:{version:release.tag_name,url:a.browser_download_url,sha256:hash,source:'https://github.com/yt-dlp/yt-dlp',license:'https://github.com/yt-dlp/yt-dlp/blob/master/THIRD_PARTY_LICENSES.txt'},ffmpeg:{packageVersion:meta.info.version,url:w.url,sha256:w.digests.sha256,source:'https://github.com/imageio/imageio-ffmpeg',upstream:'https://ffmpeg.org/legal.html'}},null,2));
      const temp=path.join(this.root,'current.json.tmp');await fs.writeFile(temp,JSON.stringify({schema:2,folder,ytdlp:version,platform:this.platform,arch:this.arch,sha256:{yt_dlp:hash,ffmpeg:crypto.createHash('sha256').update(await fs.readFile(ff)).digest('hex')}}),{mode:0o600});await fs.rename(temp,path.join(this.root,'current.json'));committed=true;
      if(!await this.readRuntime(this.root))throw new UserError('설치된 엔진의 무결성 확인에 실패했습니다.');await this.init();if(!this.health.ready)throw new UserError('설치된 엔진의 무결성 확인에 실패했습니다.');report('엔진 준비 완료');
    }catch(e){
      if(committed){
        try{if(previous){await fs.writeFile(path.join(this.root,'current.json.restore'),previous,{mode:0o600});await fs.rename(path.join(this.root,'current.json.restore'),path.join(this.root,'current.json'));}else await fs.rm(path.join(this.root,'current.json'),{force:true});committed=false;await this.init();}catch{}
      }
      report('설치 실패 · '+e.message);throw e;
    }
    finally {this.busy=false;this.controller=null;if(!committed)await fs.rm(stage,{recursive:true,force:true}).catch(()=>{});this.onChange();}
  }
}
module.exports={Tools,validDownloadUrl,getText,getJson,sumFor,fetchVerified,zipEntries,unzipMember,pickWheel};
