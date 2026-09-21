'use strict';
const $=id=>document.getElementById(id);
const all=s=>[...document.querySelectorAll(s)];
const api=window.tubeSave;
let state=null,format='mp4',filter='all',view='download',authMode='browser',snapshot=0,initialized=false;
let toastTimer,previewUrl='',lastPrompt='',updateOpenRequested=false;
const busy=new Set();
function icon(name){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('icon');svg.setAttribute('aria-hidden','true');const use=document.createElementNS('http://www.w3.org/2000/svg','use');use.setAttribute('href','#i-'+name);svg.append(use);return svg;}
function el(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;}
function text(id,value){$(id).textContent=value??'';}
function show(id,yes){$(id).hidden=!yes;}
function toast(message,error=false){text('toast',message);$('toast').classList.toggle('error',error);show('toast',true);clearTimeout(toastTimer);toastTimer=setTimeout(()=>show('toast',false),error?7000:4000);}
async function task(name,fn){if(busy.has(name))return;busy.add(name);controls();try{return await fn();}catch(e){toast(e.message||'작업에 실패했습니다.',true);}finally{busy.delete(name);controls();}}
function openDialog(id){const d=$(id);if(!d.open)d.showModal();}
function closeDialog(id){$(id).close();}
function navigate(next){view=next;all('[data-view]').forEach(b=>{const selected=b.dataset.view===next;b.classList.toggle('selected',selected);if(selected)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});for(const v of ['download','history','settings'])show('view-'+v,v===next);text('breadcrumb',({download:'다운로드',history:'저장 기록',settings:'설정'})[next]);window.scrollTo(0,0);if(next==='history')renderHistory();}
function lines(){return $('url-input').value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);}
function readableBytes(n){if(!Number.isFinite(n)||n<=0)return '';if(n<1048576)return(n/1024).toFixed(0)+' KB';if(n<1073741824)return(n/1048576).toFixed(1)+' MB';return(n/1073741824).toFixed(2)+' GB';}
function duration(n){if(!Number.isFinite(n))return '';return n>=3600?`${Math.floor(n/3600)}시간 ${Math.floor(n%3600/60)}분`:`${Math.floor(n/60)}분 ${Math.floor(n%60)}초`;}
function shortFolder(p){const parts=String(p||'').split(/[\\/]/).filter(Boolean);return parts.slice(-2).join(' / ');}
function authLabel(a){if(!a||a.mode==='none')return '일반 영상 모드';return a.mode==='file'?'쿠키 파일 연결':({chrome:'Chrome',firefox:'Firefox',edge:'Edge',brave:'Brave',safari:'Safari',chromium:'Chromium',opera:'Opera',vivaldi:'Vivaldi'})[a.browser]+' 연결';}
function controls(){
  const n=lines().length,ready=state?.health.ready&&!state?.health.installing&&!state?.maintenance;
  $('download').disabled=!ready||!n||n>20||busy.has('download');
  $('inspect').disabled=!ready||n!==1||busy.has('inspect');
  $('paste').disabled=busy.has('paste');
  text('download-label',busy.has('download')?'목록에 추가 중…':n>1?`${n}개 다운로드`:'다운로드');
  text('inspect',busy.has('inspect')?'영상 확인 중…':'영상 정보 확인 ›');
  show('clear-input',n>0);
  $('quality').disabled=format==='mp3';show('quality',format!=='mp3');show('audio-quality',format==='mp3');
  all('[data-format]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.format===format)));
  if(state){$('engine-update').disabled=state.health.installing||state.active||busy.has('engine');$('apply-auth').disabled=busy.has('auth');}
}
async function refresh(){
  const seq=++snapshot;try{const s=await api.state();if(seq!==snapshot)return;state=s;
    if(!initialized){format=s.settings.mode;$('quality').value=s.settings.quality;initialized=true;document.body.classList.toggle('mac',s.platform==='darwin');text('shortcut-hint',s.platform==='darwin'?'⌘ V':'Ctrl V');$('browser').querySelector('[value="safari"]').disabled=s.platform!=='darwin';}
    render();
  }catch(e){toast(e.message,true);}
}
function render(){
  text('app-version',state.version||'2.1.0');text('settings-version',state.version||'2.1.0');
  const h=state.health;
  text('engine-short',h.installing?'엔진 준비 중':h.ready?'다운로드 준비 완료':'엔진 확인 필요');
  $('side-engine').classList.toggle('ready',h.ready&&!h.installing);$('side-engine').classList.toggle('error',!h.ready&&!h.installing);
  show('engine-alert',!h.ready);text('engine-alert-text',(h.issues||[]).join(' '));
  text('engine-title',h.ready?(h.source==='bundled'?'앱 설치에 기본 포함':'다운로드 엔진 준비 완료'):'엔진 복구가 필요해요');
  text('engine-detail',h.installing?h.install_status:h.ready?'yt-dlp · FFmpeg · JavaScript 실행환경':'설정·영상 파일은 그대로 두고 엔진만 다시 준비합니다.');
  text('engine-update',h.installing?'준비 중…':h.ready?'엔진 업데이트':'엔진 복구');
  show('engine-progress',!!h.install_status);text('engine-progress',h.install_status);
  text('engine-version-detail',`yt-dlp ${h.yt_dlp||'—'} / FFmpeg ${h.ffmpeg?'준비 완료':'미확인'} / ${h.runtime||'Electron Node.js'}`);
  text('folder-label',shortFolder(state.settings.folder));$('choose-folder').title=state.settings.folder;text('settings-folder',state.settings.folder);
  const a=authLabel(state.auth);text('auth-short',a);text('settings-auth',state.auth.mode==='none'?'시청 권한이 있는 회원 전용 영상에 사용해요.':a+' · 이번 앱 실행에서만 유지');text('account-label',state.auth.mode==='none'?'로그인 연결':a);$('top-auth').classList.toggle('connected',state.auth.mode!=='none');
  const active=state.jobs.filter(j=>['queued','running'].includes(j.status)).length;text('nav-count',active);show('nav-count',active>0);
  renderJobs();renderHistory();renderUpdates();controls();if(state.warning)toast(state.warning,true);
}
function actionButton(name,label,fn){const b=el('button','icon-button');b.title=label;b.setAttribute('aria-label',label);b.append(icon(name));b.addEventListener('click',fn);return b;}
function jobElement(j){
  const row=el('article','job');row.dataset.job=j.id;
  const thumb=el('div','job-thumb');thumb.append(icon(j.mode==='mp3'?'music':'video'));row.append(thumb);
  const body=el('div','job-main'),title=el('strong','job-title',j.title||'영상 정보를 확인하고 있어요');title.title=j.title||j.url;body.append(title);
  const meta=el('div','job-meta');meta.append(el('b','',String(j.mode).toUpperCase()),el('span','',j.mode==='mp3'?'192 kbps':j.quality==='best'?'최고화질':j.quality+'p'));
  if(j.size)meta.append(el('span','',readableBytes(j.size)));
  if(j.status==='running'){if(j.speed)meta.append(el('span','',readableBytes(j.speed)+'/s'));if(j.eta)meta.append(el('span','',duration(j.eta)+' 남음'));}
  else if(j.created){const d=new Date(j.created);if(!Number.isNaN(d.getTime()))meta.append(el('span','',d.toLocaleDateString('ko-KR',{month:'short',day:'numeric'})));}
  body.append(meta);
  if(j.status==='running'){
    const progress=el('div','progress-row'),track=el('div','progress-track'),bar=el('div');track.append(bar);
    if(j.progress===null||j.progress===undefined){track.classList.add('indeterminate');progress.append(track,el('span','progress-number','처리 중'));}
    else{const p=Math.max(0,Math.min(100,j.progress));bar.style.width=p+'%';track.setAttribute('role','progressbar');track.setAttribute('aria-valuenow',String(Math.round(p)));track.setAttribute('aria-label',j.title+' 다운로드');progress.append(track,el('span','progress-number',Math.round(p)+'%'));}
    body.append(progress);
  }
  row.append(body);
  const status=el('span','job-state '+j.status,({queued:'대기 중',running:'저장 중',done:'완료',failed:'실패',cancelled:'취소'})[j.status]||j.status);if(j.status==='done')status.prepend(icon('check'));row.append(status);
  const actions=el('div','job-actions');
  if(['queued','running'].includes(j.status))actions.append(actionButton('close','다운로드 취소',()=>task('cancel-'+j.id,async()=>{await api.cancel({id:j.id});await refresh();})));
  if(['failed','cancelled'].includes(j.status))actions.append(actionButton('refresh','다시 다운로드',()=>task('retry-'+j.id,async()=>{await api.retry({id:j.id});await refresh();})));
  if(j.status==='done')actions.append(actionButton('folder','이 영상의 저장 폴더 열기',()=>task('folder',()=>api.openFolder({id:j.id}))));
  actions.append(actionButton('dots','작업 상세 보기',()=>{text('details-title',j.title||'영상');text('details-meta',`${j.url}\n${j.stage||''}`);text('details-error',j.error||'');show('details-error',!!j.error);text('details-logs',j.logs?.length?j.logs.join('\n'):'이번 실행에 남은 상세 로그가 없습니다.');openDialog('details-dialog');}));
  row.append(actions);return row;
}
function replaceJobs(id,jobs){$(id).replaceChildren(...jobs.map(jobElement));}
function renderJobs(){const jobs=state.jobs.filter(j=>filter==='active'?['running','queued'].includes(j.status):filter==='done'?j.status==='done':true);replaceJobs('job-list',jobs);text('queue-count',state.jobs.length);show('empty-queue',!jobs.length);$('empty-queue').querySelector('h3').textContent=filter==='all'?'첫 영상을 저장해 보세요':'해당하는 다운로드가 없어요';all('[data-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.filter===filter)));}
function renderHistory(){if(!state)return;const q=$('history-search').value.trim().toLowerCase();const jobs=state.jobs.filter(j=>['done','failed','cancelled'].includes(j.status)&&(!q||(j.title+' '+j.url).toLowerCase().includes(q)));replaceJobs('history-list',jobs);show('empty-history',!jobs.length);$('empty-history').querySelector('h3').textContent=q?'검색 결과가 없어요':'아직 저장 기록이 없어요';}
function openAuth(){
  const a=state?.auth||{mode:'none'};authMode=a.mode==='file'?'file':'browser';$('browser').value=a.browser||'chrome';$('profile').value=a.profile||'';$('container').value=a.container||'';$('cookie-file').value=a.file||'';$('auth-consent').checked=!!a.consent;show('auth-error',false);renderAuth();openDialog('auth-dialog');
}
function renderAuth(){show('browser-fields',authMode==='browser');show('file-fields',authMode==='file');all('[data-auth-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.authMode===authMode)));}
async function chooseFolder(){const r=await api.pickFolder();if(r.folder){await api.settings({folder:r.folder,mode:format,quality:$('quality').value});await refresh();toast('저장 폴더를 변경했어요.');}}
function renderUpdates(){
  const u=state.update||{status:'disabled',message:'배포 연결이 필요합니다.',autoCheck:true};
  const visible=['available','downloading','downloaded','installing'].includes(u.status);
  show('update-badge',visible);show('update-dot',visible);
  $('auto-update').checked=u.autoCheck!==false;
  text('update-status-text',u.message||'새 버전을 직접 확인할 수 있어요.');
  text('settings-update',u.status==='disabled'?'배포 연결 필요':u.status==='downloading'?'다운로드 중':u.status==='downloaded'?'재시작하여 설치':u.status==='available'?'업데이트 보기':u.status==='checking'?'확인 중…':'업데이트 확인');
  $('settings-update').disabled=u.status==='disabled'||u.status==='checking'||u.status==='installing';
  text('update-explanation',u.status==='disabled'?u.message:'업데이트 알림 → 파일 다운로드 → 재시작하여 설치. 진행 중인 영상 작업은 강제로 중단하지 않습니다.');
  text('old-version',u.currentVersion||state.version);text('new-version',u.version||'—');
  text('update-dialog-title',({available:'새로운 버전이 있어요',downloading:'더 나은 TubeSave를 준비 중',downloaded:'업데이트가 준비됐어요',installing:'새 버전으로 다시 만나요',error:'업데이트를 완료하지 못했어요',disabled:'배포 연결이 필요해요','up-to-date':'최신 버전을 사용하고 있어요',checking:'새 버전을 확인하고 있어요'})[u.status]||'앱 업데이트');
  text('update-dialog-subtitle',u.version?`TubeSave ${u.version}로 업데이트할 수 있어요.`:'현재 설치된 버전과 새 버전을 확인합니다.');
  text('release-notes',u.notes||'별도의 변경 안내가 없습니다.');
  text('update-dialog-message',u.message||'');show('update-progress-wrap',['downloading','downloaded'].includes(u.status));$('update-progress-bar').style.width=(u.progress||0)+'%';text('update-progress-label',`${Math.round(u.progress||0)}%${u.total?' · '+readableBytes(u.transferred)+' / '+readableBytes(u.total):''}`);
  show('update-busy-note',u.status==='downloaded'&&(u.busy||state.active||state.health.installing));
  const btn=$('update-action');text('update-action',u.status==='downloaded'?'재시작하여 설치':u.status==='downloading'?'다운로드 중…':u.status==='installing'?'재시작 중…':u.status==='error'?'다시 시도':u.status==='available'?'업데이트 다운로드':'업데이트 확인');
  btn.disabled=['disabled','checking','downloading','installing'].includes(u.status)||(u.status==='downloaded'&&(u.busy||state.active||state.health.installing));
  const promptKey=u.version+':'+u.status;
  // Prompt once for a new version and once when its download finishes. Never
  // steal focus from login or file details; retry on the next state refresh.
  if(['available','downloaded'].includes(u.status)&&lastPrompt!==promptKey&&!all('dialog[open]').length){lastPrompt=promptKey;openDialog('update-dialog');}
  if(updateOpenRequested&&!all('dialog[open]').length){updateOpenRequested=false;openDialog('update-dialog');}
}
all('[data-view]').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.view)));
all('[data-close]').forEach(b=>b.addEventListener('click',()=>closeDialog(b.dataset.close)));
all('dialog').forEach(d=>{d.addEventListener('click',e=>{const r=d.getBoundingClientRect();if(e.target===d&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom))d.close();});});
all('[data-format]').forEach(b=>b.addEventListener('click',()=>{format=b.dataset.format;controls();}));
all('[data-filter]').forEach(b=>b.addEventListener('click',()=>{filter=b.dataset.filter;renderJobs();}));
all('[data-auth-mode]').forEach(b=>b.addEventListener('click',()=>{authMode=b.dataset.authMode;$('auth-consent').checked=false;renderAuth();}));
$('url-input').addEventListener('input',()=>{show('video-preview',false);previewUrl='';controls();});
$('clear-input').addEventListener('click',()=>{$('url-input').value='';show('video-preview',false);controls();$('url-input').focus();});
$('paste').addEventListener('click',()=>task('paste',async()=>{const s=await api.readClipboard();if(!s.trim()){toast('클립보드에 링크가 없어요.');return;}$('url-input').value=s.slice(0,65500);show('video-preview',false);controls();$('url-input').focus();}));
$('download').addEventListener('click',()=>task('download',async()=>{const r=await api.download({urls:$('url-input').value,mode:format,quality:$('quality').value,folder:state.settings.folder});$('url-input').value='';show('video-preview',false);filter='all';toast(`${r.added.length}개를 다운로드 목록에 추가했어요.${r.skipped?' 중복된 링크는 건너뛰었습니다.':''}`);await refresh();}));
$('inspect').addEventListener('click',()=>task('inspect',async()=>{const url=lines()[0];const r=await api.info({url});if(lines()[0]!==url)return;previewUrl=url;text('preview-title',r.title);text('preview-meta',[r.channel,duration(r.duration)].filter(Boolean).join(' · '));const img=$('preview-image');if(/^https:\/\/i\.ytimg\.com\/vi\/[\w-]{11}\/[\w.-]+$/.test(r.thumbnail||'')){img.src=r.thumbnail;img.hidden=false;}else img.hidden=true;show('video-preview',true);}));
for(const id of ['top-auth','composer-auth','settings-open-auth'])$(id).addEventListener('click',openAuth);
for(const id of ['choose-folder','settings-pick-folder'])$(id).addEventListener('click',()=>task('folder',chooseFolder));
$('top-folder').addEventListener('click',()=>task('folder',()=>api.openFolder({})));
for(const id of ['side-engine','repair-inline'])$(id).addEventListener('click',()=>navigate('settings'));
$('engine-update').addEventListener('click',()=>task('engine',async()=>{await api.installTools();await refresh();}));
$('open-youtube').addEventListener('click',()=>task('youtube',()=>api.openYouTube()));
$('pick-cookie').addEventListener('click',()=>task('cookie',async()=>{const r=await api.pickCookieFile();if(r.file){$('cookie-file').value=r.file;$('auth-consent').checked=false;}}));
for(const id of ['browser','profile','container'])$(id).addEventListener('input',()=>{$('auth-consent').checked=false;});
$('apply-auth').addEventListener('click',()=>task('auth',async()=>{show('auth-error',false);if(!$('auth-consent').checked){text('auth-error','로그인 쿠키 사용에 동의한 뒤 연결해 주세요.');show('auth-error',true);return;}const auth=authMode==='browser'?{mode:'browser',browser:$('browser').value,profile:$('profile').value,container:$('container').value,consent:true}:{mode:'file',file:$('cookie-file').value,consent:true};try{await api.auth({auth});closeDialog('auth-dialog');toast('로그인 연결 설정을 적용했어요. 영상 정보 확인으로 접근을 확인하세요.');await refresh();}catch(e){text('auth-error',e.message);show('auth-error',true);}}));
$('disconnect').addEventListener('click',()=>task('auth',async()=>{await api.resetAuth();closeDialog('auth-dialog');toast('로그인 연결을 해제했어요.');await refresh();}));
$('history-search').addEventListener('input',renderHistory);
$('clear-history').addEventListener('click',()=>openDialog('confirm-dialog'));
$('confirm-clear').addEventListener('click',()=>task('clear',async()=>{await api.clearHistory();closeDialog('confirm-dialog');await refresh();toast('기록을 비웠어요. 영상 파일은 그대로입니다.');}));
$('auto-update').addEventListener('change',()=>task('update-preferences',async()=>{await api.updatePreferences({autoCheck:$('auto-update').checked});await refresh();}));
$('update-badge').addEventListener('click',()=>openDialog('update-dialog'));
$('settings-update').addEventListener('click',()=>task('check-update',async()=>{const u=state.update;if(['available','downloading','downloaded'].includes(u.status)){openDialog('update-dialog');return;}await api.checkUpdate();await refresh();if(state.update.status==='up-to-date')toast('최신 버전을 사용하고 있어요.');}));
$('update-action').addEventListener('click',()=>task('update-action',async()=>{const u=state.update;if(u.status==='downloaded')await api.installUpdate();else if(u.status==='available'||(u.status==='error'&&u.retry==='download'))await api.downloadUpdate();else await api.checkUpdate();await refresh();}));
document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key==='Enter'&&!all('dialog[open]').length){e.preventDefault();if(!$('download').disabled)$('download').click();}if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='l'&&!all('dialog[open]').length){e.preventDefault();navigate('download');$('url-input').focus();$('url-input').select();}});
if(!api){toast('TubeSave 데스크톱 앱에서 실행해 주세요. 이 HTML 파일은 브라우저용 다운로드 앱이 아닙니다.',true);controls();}
else{api.onStateChanged(()=>void refresh());api.onOpenUpdates?.(()=>{updateOpenRequested=true;if(state)renderUpdates();});void refresh();}
