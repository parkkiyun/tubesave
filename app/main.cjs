'use strict';
const {app,BrowserWindow,Menu,ipcMain,protocol,dialog,shell,clipboard,session,Notification}=require('electron');
const fs=require('node:fs/promises');
const path=require('node:path');
const {Tools}=require('./lib/tools.cjs');
const {Engine,Service}=require('./lib/service.cjs');
const {UserError,redact}=require('./lib/core.cjs');
const {UpdateController,UpdatePreferences,validReleaseConfig}=require('./lib/updates.cjs');
const VERSION=require('./package.json').version;
const HOME='tubesave://app/index.html';
const ASSETS=new Map([['/index.html',['index.html','text/html; charset=utf-8']],['/style.css',['style.css','text/css; charset=utf-8']],['/app.js',['app.js','text/javascript; charset=utf-8']]]);
app.setName('TubeSave');
app.setAppUserModelId('local.tubesave.desktop');
protocol.registerSchemesAsPrivileged([{scheme:'tubesave',privileges:{standard:true,secure:true,supportFetchAPI:true}}]);
const chosenCookieFiles=new Set();
let win,service,tools,quitting=false,picker=false,quitPending=false,publishTimer,updater,updatePreferences,updateTimer;
if(!app.requestSingleInstanceLock()){app.quit();}else{
  app.on('second-instance',()=>{if(win){if(win.isMinimized())win.restore();win.show();win.focus();}});
  app.on('before-quit',event=>{
    if(quitting)return;event.preventDefault();void requestQuit();
  });
  app.whenReady().then(start).catch(e=>{dialog.showErrorBox('TubeSave 실행 오류',redact(e.message));quitting=true;app.quit();});
}
function changed(){
  if(publishTimer)return;
  publishTimer=setTimeout(()=>{
    publishTimer=null;if(!service||!win||win.isDestroyed())return;
    const state=service.state();win.webContents.send('ts:state-changed');
    const current=state.jobs.find(j=>j.status==='running');win.setProgressBar(current?(current.progress===null?2:Math.max(0,current.progress/100)):-1);
  },180);
}
async function requestQuit(){
  if(quitting)return;
  if(quitPending)return;
  quitPending=true;
  try {
  if(service?.active()||tools?.busy){
    const answer=await dialog.showMessageBox(win,{type:'question',title:'TubeSave 종료',message:'진행 중인 작업을 취소하고 종료할까요?',detail:'완성된 영상 파일은 그대로 보관됩니다.',buttons:['계속 사용','작업 취소 후 종료'],defaultId:0,cancelId:0});
    if(answer.response!==1)return;
  }
  await service?.close();quitting=true;clearTimeout(updateTimer);clearTimeout(publishTimer);updater?.dispose();app.quit();
  }catch(e){dialog.showErrorBox('종료 오류',redact(e.message));}
  finally{quitPending=false;}
}
async function installTools(){
  if(service.maintenance||service.active())throw new UserError('진행·대기 작업과 영상 정보 확인을 마친 뒤 설치해 주세요.');
  const answer=await dialog.showMessageBox(win,{type:'question',title:'다운로드 엔진 설치',message:tools.health.ready?'다운로드 엔진을 업데이트할까요?':'다운로드 엔진을 설치할까요?',detail:'GitHub의 공식 yt-dlp와 PyPI의 imageio-ffmpeg 배포 파일을 다운로드합니다. SHA-256 확인 후 이 컴퓨터의 TubeSave 데이터 폴더에 설치합니다. 계정이나 쿠키는 설치 서버에 보내지 않습니다.',buttons:['취소',tools.health.ready?'업데이트':'복구'],defaultId:1,cancelId:0});
  if(answer.response!==1)return {cancelled:true};if(service.maintenance||service.active()||tools.busy)throw new UserError('진행 중인 작업을 먼저 마쳐 주세요.');await tools.install();return {ok:true};
}
async function nativePicker(kind){
  if(picker)throw new UserError('파일·폴더 선택 창이 이미 열려 있습니다.');picker=true;
  try{
    const result=await dialog.showOpenDialog(win,kind==='folder'?{title:'영상 저장 위치',defaultPath:service.settings.folder,properties:['openDirectory','createDirectory']}:{title:'YouTube cookies.txt 선택',properties:['openFile'],filters:[{name:'쿠키 텍스트 파일',extensions:['txt']},{name:'모든 파일',extensions:['*']}]});
    const selected=result.canceled?null:result.filePaths[0];
    if(kind==='file'&&selected)chosenCookieFiles.add(selected);
    return {[kind==='folder'?'folder':'file']:selected};
  }finally{picker=false;}
}
async function start(){
  const dataDir=path.join(app.getPath('appData'),'TubeSave');await fs.mkdir(dataDir,{recursive:true,mode:0o700});app.setPath('userData',dataDir);
  tools=new Tools(path.join(dataDir,'engines'),{onChange:changed,bundledRoot:path.join(process.resourcesPath||'', 'engines')});
  const engine=new Engine(tools,path.join(dataDir,'private-auth'));
  service=new Service(engine,tools,dataDir,app.getPath('downloads'),changed,job=>{
    if(win&&!win.isFocused()&&Notification.isSupported()){
      const n=new Notification({title:'TubeSave · 저장 완료',body:job.title});n.on('click',()=>{win?.show();win?.focus();});n.show();
    }
  });
  await service.init();
  await setupUpdater(dataDir);
  protocol.handle('tubesave',async request=>{
    try{
      const u=new URL(request.url);const file=ASSETS.get(u.pathname);
      if(u.host!=='app'||u.username||u.password||u.port||u.search||!file||request.method!=='GET')return new Response('Not found',{status:404});
      const bytes=await fs.readFile(path.join(__dirname,'ui',file[0]));
      return new Response(bytes,{headers:{'Content-Type':file[1],'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https://i.ytimg.com; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'"}});
    }catch{return new Response('Not found',{status:404});}
  });
  session.defaultSession.setPermissionRequestHandler((_wc,_permission,cb)=>cb(false));
  session.defaultSession.setPermissionCheckHandler(()=>false);
  win=new BrowserWindow({icon:path.join(__dirname,'tubesave.png'),width:1140,height:820,minWidth:850,minHeight:640,titleBarStyle:process.platform==='darwin'?'hiddenInset':'default',trafficLightPosition:process.platform==='darwin'?{x:20,y:19}:undefined,title:'TubeSave',backgroundColor:'#f7f8fa',show:false,autoHideMenuBar:process.platform==='win32',webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true,webviewTag:false,allowRunningInsecureContent:false}});
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',(event,url)=>{if(url.split('#')[0]!==HOME)event.preventDefault();});
  win.webContents.on('will-attach-webview',event=>event.preventDefault());
  win.on('close',event=>{if(!quitting){event.preventDefault();void requestQuit();}});
  win.once('ready-to-show',()=>win.show());
  const handlers={
    state:()=>({...service.state(),version:VERSION,update:updater.state()}),
    checkUpdate:()=>updater.check(),downloadUpdate:()=>updater.download(),installUpdate:()=>updater.install(),updatePreferences:async data=>{await updatePreferences.save(data.autoCheck);updater.set({autoCheck:data.autoCheck});if(data.autoCheck)void updater.check();return updater.state();},download:data=>service.enqueue(data),info:data=>service.inspect(data),settings:data=>service.saveSettings(data),cancel:data=>service.cancel(data.id),retry:data=>service.retry(data),clearHistory:()=>service.clearHistory(),auth:data=>{if(data.auth?.mode==='file'&&!chosenCookieFiles.has(data.auth.file))throw new UserError('쿠키 파일은 파일 선택 창에서 직접 선택해 주세요.');return service.configureAuth(data.auth);},resetAuth:()=>service.resetAuth(),pickFolder:()=>nativePicker('folder'),pickCookieFile:()=>nativePicker('file'),openFolder:async data=>{const folder=service.folder(data.id);const stat=await fs.stat(folder);if(!stat.isDirectory())throw new UserError('저장 폴더를 찾지 못했습니다.');const error=await shell.openPath(folder);if(error)throw new UserError(error);return {ok:true};},installTools,openYouTube:async()=>{await shell.openExternal('https://www.youtube.com/');return {ok:true};},readClipboard:()=>clipboard.readText(),quit:()=>{setImmediate(()=>void requestQuit());return {ok:true};}
  };
  for(const [action,handler]of Object.entries(handlers))ipcMain.handle('ts:'+action,async(event,data={})=>{
    try{
      if(event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame||event.senderFrame.url.split('#')[0]!==HOME)throw new UserError('허용되지 않은 요청입니다.');
      if(!data||typeof data!=='object'||Array.isArray(data)||JSON.stringify(data).length>65536)throw new UserError('요청 형식이 올바르지 않습니다.');
      return {ok:true,data:await handler(data)};
    }catch(e){return {ok:false,error:redact(e.message)};}
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform==='darwin'?[{label:'TubeSave',submenu:[{role:'about'},{type:'separator'},{role:'hide'},{role:'hideOthers'},{role:'unhide'},{type:'separator'},{label:'TubeSave 종료',accelerator:'Cmd+Q',click:()=>void requestQuit()}]}]:[]),
    {label:'파일',submenu:[{label:'저장 폴더 열기',click:()=>shell.openPath(service.settings.folder).catch(()=>{})},{label:'엔진 복구 / 업데이트',click:()=>installTools().catch(e=>dialog.showErrorBox('엔진 설치',redact(e.message)))},{type:'separator'},{label:'종료',click:()=>void requestQuit()}]},
    {label:'편집',submenu:[{role:'undo'},{role:'redo'},{type:'separator'},{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'}]},
    {label:'보기',submenu:[{role:'resetZoom'},{role:'zoomIn'},{role:'zoomOut'},{type:'separator'},{role:'togglefullscreen'}]},
    {label:'도움말',submenu:[{label:'앱 업데이트 확인',click:()=>{win.webContents.send('ts:open-updates');void updater.check();}},{type:'separator'},{label:'TubeSave 정보',click:()=>dialog.showMessageBox(win,{message:'TubeSave Desktop '+VERSION,detail:'내 컴퓨터에서 실행되는 영상 저장 도구.\n로그인 설정은 이번 실행에서만 유지됩니다.\n본인 소유·허가받은 콘텐츠에 사용하세요.'})}]}
  ]));
  app.setAboutPanelOptions({applicationName:'TubeSave',applicationVersion:VERSION,copyright:'TubeSave · MIT'});
  await win.loadURL(HOME);
  if(updatePreferences.autoCheck){updateTimer=setTimeout(()=>void updater.check(),8000);updateTimer.unref();}
}

async function setupUpdater(dataDir){
  updatePreferences=await new UpdatePreferences(dataDir).init();
  let adapter=null,reason='이 테스트 설치본에는 업데이트 배포 서버가 연결되지 않았어요. 정식 배포본을 한 번 설치한 뒤 앱 내 업데이트를 사용할 수 있습니다.';
  try {
    const distribution=JSON.parse(await fs.readFile(path.join(process.resourcesPath,'distribution.json'),'utf8'));
    if(distribution.format==='electron-builder'&&app.isPackaged&&validReleaseConfig(distribution)){
      // The feed is generated by electron-builder inside the signed app. Never
      // allow the renderer or an arbitrary pasted URL to choose executable code.
      await fs.access(path.join(process.resourcesPath,'app-update.yml'));
      adapter=require('electron-updater').autoUpdater;
      adapter.logger={info:()=>{},warn:()=>{},error:()=>{},debug:()=>{}};
      reason='';
    }
  }catch{ /* Bootstrap/development builds intentionally stay disabled. */ }
  updater=new UpdateController({adapter,version:VERSION,reason,onChange:changed,
    isBusy:()=>service.active()||tools.busy||service.maintenance,
    beforeInstall:async()=>{
      if(service.active()||tools.busy||service.maintenance)throw new UserError('진행 중인 작업을 먼저 마쳐 주세요.');
      service.maintenance=true;changed();
      await service.close();
      quitting=true;
    },
    installFailed:()=>{quitting=false;service.closed=false;service.maintenance=false;changed();}
  });
  updater.set({autoCheck:updatePreferences.autoCheck});
}
