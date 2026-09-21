'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const HOSTS = new Set(['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com','youtu.be','www.youtu.be','youtube-nocookie.com','www.youtube-nocookie.com']);
const BROWSERS = new Set(['chrome','firefox','edge','brave','safari','chromium','opera','vivaldi']);
const HEIGHTS = new Set(['best','2160','1440','1080','720','480']);
class UserError extends Error {}
class Cancelled extends Error { constructor() { super('작업이 취소되었습니다.'); this.name='Cancelled'; } }
function text(v, name, limit=4096) {
  if (typeof v!=='string' || v.length>limit || /[\x00-\x1f\x7f]/.test(v)) throw new UserError(`${name}을 확인해 주세요.`);
  return v.trim();
}
function normalizeUrl(value) {
  let s=text(value,'유튜브 링크'); if (!s.includes('://')) s='https://'+s;
  let u; try {u=new URL(s);} catch {throw new UserError('올바른 유튜브 영상 링크를 넣어 주세요.');}
  if (!['http:','https:'].includes(u.protocol) || !HOSTS.has(u.hostname) || u.username || u.password || (u.port && !['80','443'].includes(u.port))) throw new UserError('youtube.com 또는 youtu.be의 영상 링크만 지원합니다.');
  const parts=u.pathname.split('/').filter(Boolean); let id='';
  if (['youtu.be','www.youtu.be'].includes(u.hostname) && parts.length===1) id=parts[0];
  else if (u.pathname.replace(/\/$/,'')==='/watch') id=u.searchParams.get('v')||'';
  else if (parts.length===2 && ['shorts','embed','live','v'].includes(parts[0])) id=parts[1];
  if (!/^[\w-]{11}$/.test(id)) throw new UserError('채널·재생목록이 아닌 개별 영상 링크를 넣어 주세요.');
  return `https://www.youtube.com/watch?v=${id}`;
}
function normalizeUrls(value) {
  const a=Array.isArray(value)?value:typeof value==='string'?value.split(/\r?\n/):[];
  if (!a.length || a.length>20) throw new UserError('링크를 한 줄에 하나씩, 최대 20개 입력해 주세요.');
  const out=[];
  for(const s of a) { if(typeof s!=='string') throw new UserError('링크는 텍스트여야 합니다.'); if(s.trim()) out.push(normalizeUrl(s)); }
  if(!out.length) throw new UserError('먼저 영상 링크를 넣어 주세요.');
  return [...new Set(out)];
}
function formatSelector(mode, quality) {
  if(!['mp4','mkv','mp3'].includes(mode)||!HEIGHTS.has(quality)) throw new UserError('형식·화질을 확인해 주세요.');
  if(mode==='mp3') return 'ba/b';
  const q=quality==='best'?'':`[height<=${quality}]`;
  return mode==='mp4'?`bv${q}+ba[ext=m4a]/bv${q}+ba/b${q}`:`bv${q}+ba/b${q}`;
}
function validateAuth(input={mode:'none'}, platform=process.platform) {
  if(!input || typeof input!=='object' || Array.isArray(input)) throw new UserError('로그인 설정을 확인해 주세요.');
  const mode=input.mode||'none'; if(mode==='none')return {mode};
  if(!['browser','file'].includes(mode)||input.consent!==true) throw new UserError('로그인 쿠키 사용에 동의한 뒤 연결해 주세요.');
  if(mode==='file') {
    let file=text(input.file,'쿠키 파일 경로');
    if(file.startsWith('~/'))file=path.join(os.homedir(),file.slice(2));
    if(!path.isAbsolute(file))throw new UserError('쿠키 파일의 절대 경로를 선택해 주세요.');
    return {mode,file,consent:true};
  }
  const browser=input.browser||'chrome';
  if(!BROWSERS.has(browser))throw new UserError('지원하는 브라우저를 선택해 주세요.');
  if(browser==='safari'&&platform!=='darwin')throw new UserError('Safari는 Mac에서만 연결할 수 있습니다.');
  const profile=text(input.profile||'','프로필');
  const container=browser==='firefox'?text(input.container||'','컨테이너',120):'';
  if(profile.includes('::')||profile.startsWith('-')||container.includes(':')||(browser==='safari'&&profile))throw new UserError('브라우저 프로필·컨테이너 입력을 확인해 주세요.');
  return {mode,browser,profile,container,consent:true};
}
function browserSpec(a) { return a.browser+(a.profile?':'+a.profile:'')+(a.container?'::'+a.container:''); }
function authLabel(a) {return !a||a.mode==='none'?'로그인 없이':a.mode==='file'?'쿠키 파일':`${a.browser} 로그인`;}
function redact(value,secrets=[]) {
  let s=String(value);
  if(s.split('\t').length>=7 || /(?:cookie|authorization)\s*[:=]|(?:SAPISID|APISID|SSID|HSID|__Secure-[\w-]+)\s*[=:]|SAPISIDHASH\s|Bearer\s/i.test(s)) return '[인증 정보가 포함될 수 있는 로그를 숨겼습니다.]';
  for(const secret of secrets)if(secret&&secret.length>=3)s=s.split(secret).join('[비공개]');
  s=s.replace(/https?:\/\/[^\s'"<>]+/g,match=>{try{const u=new URL(match);return u.origin+u.pathname+(u.search?'?[매개변수 숨김]':'');}catch{return '[URL]';}});
  return s.slice(-2500);
}
function cookieSubset(raw) {
  if(typeof raw!=='string'||Buffer.byteLength(raw)>5*1024*1024||!/^#(?: Netscape)? HTTP Cookie File/m.test(raw.replace(/^\uFEFF/,'')))throw new UserError('Netscape 형식의 cookies.txt 파일이어야 합니다.');
  const result=['# Netscape HTTP Cookie File']; const secrets=[];
  for(const line of raw.replace(/^\uFEFF/,'').split(/\r?\n/)) {
    if(!line || (line.startsWith('#')&&!line.startsWith('#HttpOnly_')))continue;
    const f=line.split('\t'); if(f.length!==7)throw new UserError('쿠키 파일의 행 형식이 올바르지 않습니다.');
    const host=f[0].replace(/^#HttpOnly_/,'').replace(/^\./,'').toLowerCase();
    if(!['youtube.com','google.com','googlevideo.com'].some(d=>host===d||host.endsWith('.'+d)))continue;
    if(!['TRUE','FALSE'].includes(f[1])||!['TRUE','FALSE'].includes(f[3])||!/^\d+$/.test(f[4])||!f[5])throw new UserError('쿠키 파일 내용을 확인해 주세요.');
    result.push(line);if(f[6])secrets.push(f[6]);
  }
  if(result.length===1)throw new UserError('YouTube·Google 쿠키가 없는 파일입니다.');
  return {text:result.join('\n')+'\n',secrets};
}
async function authContext(auth, root) {
  if(auth.mode==='none')return {args:[],secrets:[],cleanup:async()=>{}};
  const shared=['--no-cache-dir','--sleep-requests','1','--sleep-interval','5','--max-sleep-interval','10'];
  if(auth.mode==='browser')return {args:['--cookies-from-browser',browserSpec(auth),...shared],secrets:[auth.profile],cleanup:async()=>{}};
  const stat=await fs.stat(auth.file);
  if(!stat.isFile()||stat.size>5*1024*1024)throw new UserError('쿠키 파일이 너무 크거나 일반 파일이 아닙니다.');
  const subset=cookieSubset(await fs.readFile(auth.file,'utf8'));
  await fs.mkdir(root,{recursive:true,mode:0o700});
  const dir=await fs.mkdtemp(path.join(root,'session-'));
  const file=path.join(dir,'cookies.txt');
  try {await fs.writeFile(file,subset.text,{encoding:'utf8',mode:0o600,flag:'wx'});}
  catch(e){await fs.rm(dir,{recursive:true,force:true});throw e;}
  return {args:['--cookies',file,...shared],secrets:[...subset.secrets,auth.file,file],cleanup:()=>fs.rm(dir,{recursive:true,force:true})};
}
function number(v) { if(v===null||v===undefined||v==='')return null; const n=Number(v);return Number.isFinite(n)&&n>=0?n:null; }
function parseEvent(line) {
  for(const [p,k] of [['__TS_META__','meta'],['__TS_PROGRESS__','progress'],['__TS_FILE__','file'],['__TS_POST__','post']]) {
    if(!line.startsWith(p))continue;
    try { const d=JSON.parse(line.slice(p.length));if((['meta','progress'].includes(k)&&(!d||typeof d!=='object'||Array.isArray(d)))||(k==='file'&&typeof d!=='string'))return null;return {kind:k,data:d}; }catch{return null;}
  }return null;
}
function inside(root,target) {const r=path.relative(root,target);return !!r&&!r.startsWith('..'+path.sep)&&r!=='..'&&!path.isAbsolute(r);}
async function outputDirectory(input) {
  let s=text(input,'저장 폴더');if(s.startsWith('~/'))s=path.join(os.homedir(),s.slice(2));
  if(!path.isAbsolute(s))throw new UserError('저장 폴더는 절대 경로로 지정해 주세요.');
  await fs.mkdir(s,{recursive:true});const real=await fs.realpath(s);
  if(!(await fs.stat(real)).isDirectory())throw new UserError('저장 폴더를 확인해 주세요.');
  const test=path.join(real,'.tubesave-write-'+crypto.randomUUID());
  await fs.writeFile(test,'',{flag:'wx'});await fs.unlink(test);return real;
}
async function publishFile(source,dest) {
  const base=path.basename(source);const ext=path.extname(base);const stem=base.slice(0,base.length-ext.length);
  for(let i=0;i<10000;i++) {
    const target=path.join(dest,i?`${stem} (${i})${ext}`:base);
    try {await fs.copyFile(source,target,require('node:fs').constants.COPYFILE_EXCL);await fs.unlink(source);return target;}
    catch(e){if(e.code==='EEXIST')continue;throw e;}
  }throw new UserError('동일한 이름의 파일이 너무 많습니다.');
}
function friendlyError(raw) {
  const s=String(raw).toLowerCase();
  if(/dpapi|app.bound|failed to decrypt/.test(s))return '브라우저 쿠키 암호화를 읽지 못했습니다. Firefox 로그인 연결 또는 로컬 cookies.txt를 사용하세요. 보안 기능을 끄거나 관리자 권한으로 실행하지 마세요.';
  if(/database is locked|could not copy/.test(s))return '브라우저 쿠키가 사용 중입니다. 브라우저 작업을 저장하고 완전히 종료한 뒤 다시 시도하세요.';
  if(/keychain|safe storage|keyring|operation not permitted/.test(s))return '로그인 저장소 접근 권한을 확인해 주세요. Mac 키체인 안내가 나타나면 실행한 yt-dlp 요청인지 확인하세요.';
  if(/members.only|join this channel|membership|channel.s members/.test(s))return '이 영상의 멤버십 시청 권한이 있는 계정·프로필을 연결하세요. 브라우저에서 먼저 해당 영상이 재생되는지 확인하세요.';
  if(/private video/.test(s))return '비공개 영상입니다. 실제 시청 권한이 있는 계정만 사용할 수 있습니다.';
  if(/cookie|sign in|login required|age.restrict|bot/.test(s))return '로그인 연결을 확인해 주세요. 쿠키 만료·프로필 선택·계정 확인 때문에 실패할 수 있습니다.';
  if(/403|429|too many requests|po token/.test(s))return 'YouTube가 요청을 제한했습니다. 엔진 업데이트 후 다시 시도하거나 요청을 중단하고 나중에 확인하세요.';
  if(/requested format/.test(s))return '원하는 스트림이 없습니다. 최고화질 또는 MKV로 바꿔 보세요.';
  if(/no space|not enough space|enospc/.test(s))return '저장 공간이 부족합니다.';
  if(/drm|video unavailable|removed|copyright/.test(s))return '삭제·지역 제한·DRM 등으로 사용할 수 없는 영상입니다.';
  if(/getaddrinfo|name resolution|timed out|network|ssl|unable to download webpage/.test(s))return '서버에 연결하지 못했습니다. 인터넷·방화벽·인증서를 확인해 주세요.';
  return '다운로드에 실패했습니다. 상세 로그를 확인하거나 엔진을 업데이트해 주세요.';
}
module.exports={UserError,Cancelled,text,normalizeUrl,normalizeUrls,formatSelector,validateAuth,browserSpec,authLabel,redact,cookieSubset,authContext,number,parseEvent,inside,outputDirectory,publishFile,friendlyError};
