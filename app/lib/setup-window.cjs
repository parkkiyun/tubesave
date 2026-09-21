'use strict';
const {BrowserWindow,ipcMain,dialog,shell,clipboard}=require('electron');
const {fork}=require('node:child_process'),fs=require('node:fs/promises'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {redact}=require('./core.cjs');
let instance=null;
function safeEvent(e){
 if(!e||typeof e!=='object')return null;
 if(e.type==='auth'&&/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(e.code||''))return {type:'auth',code:e.code};
 if(['progress','error'].includes(e.type))return {type:e.type,message:redact(String(e.message||'')).replace(/\x1b\[[0-9;]*m/g,'').slice(-1800)};
 if(e.type==='done')return {type:'done'};return null;
}
async function available(resources){try{const root=path.join(resources,'publisher');await fs.access(path.join(root,'runtime',process.platform==='win32'?'node.exe':'node'));await fs.access(path.join(root,'personal-setup/gui-worker.cjs'));return true;}catch{return false;}}
async function open({parent,resourcesPath,dataDir,isBusy=()=>false}){
 if(instance&&!instance.isDestroyed()){instance.show();instance.focus();return;}
 if(!await available(resourcesPath))throw Error('업데이트 연결 도구가 포함되지 않은 설치본입니다.');
 const ui=path.resolve(__dirname,'../setup-ui'),home=pathToFileURL(path.join(ui,'index.html')).href;
 const win=new BrowserWindow({parent,width:550,height:800,minWidth:500,minHeight:720,resizable:true,show:false,title:'TubeSave 시작하기',backgroundColor:'#ffffff',autoHideMenuBar:true,icon:path.resolve(__dirname,'../tubesave.png'),webPreferences:{preload:path.join(ui,'preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true}});
 instance=win;let worker=null,running=false,code=null,closing=false;
 const send=e=>{const v=safeEvent(e);if(v&&!win.isDestroyed()){if(v.type==='auth')code=v.code;win.webContents.send('tubesave-setup:event',v);}};
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',(e,url)=>{if(url!==home)e.preventDefault();});
 const actions={
   start:async d=>{
     if(d?.consent!==true)throw Error('연결·공개 배포 동의를 먼저 확인해 주세요.');if(running)throw Error('연결이 이미 진행 중입니다.');if(isBusy())throw Error('영상 다운로드와 대기 작업을 마친 뒤 연결해 주세요.');
     const root=path.join(resourcesPath,'publisher');running=true;code=null;
     worker=fork(path.join(root,'personal-setup/gui-worker.cjs'),[],{execPath:path.join(root,'runtime',process.platform==='win32'?'node.exe':'node'),execArgv:[],cwd:root,stdio:['ignore','ignore','ignore','ipc'],windowsHide:true});
     worker.on('message',e=>{if(e.type==='done'||e.type==='error')running=false;send(e);});
     worker.once('error',()=>{running=false;send({type:'error',message:'연결 도구를 실행하지 못했습니다. 앱을 다시 설치해 주세요.'});});
     worker.once('exit',()=>{if(running){running=false;send({type:'error',message:'연결이 중단됐습니다. 설정에서 다시 시도해 주세요.'});}worker=null;});
     worker.send({action:'start'});return {started:true};
   },
   openGitHub:async()=>{if(!running||!code)throw Error('먼저 연결을 시작해 주세요.');clipboard.writeText(code);await shell.openExternal('https://github.com/login/device');return {ok:true};},
   close:async()=>{win.close();return {ok:true};}
 };
 for(const [name,fn]of Object.entries(actions))ipcMain.handle('tubesave-setup:'+name,async(event,d={})=>{try{if(event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame||event.senderFrame.url!==home)throw Error('허용되지 않은 요청입니다.');if(!d||typeof d!=='object'||Array.isArray(d)||JSON.stringify(d).length>1024)throw Error('요청이 올바르지 않습니다.');return {ok:true,data:await fn(d)};}catch(e){return {ok:false,error:redact(e.message)};}});
 win.on('close',e=>{if(running&&!closing){e.preventDefault();closing=true;void dialog.showMessageBox(win,{type:'question',message:'업데이트 연결을 중단할까요?',detail:'이미 저장된 GitHub 설정과 개인키는 유지됩니다. 나중에 이어서 연결할 수 있습니다.',buttons:['계속 연결','중단'],defaultId:0,cancelId:0}).then(r=>{closing=false;if(r.response===1){running=false;worker?.disconnect();win.close();}});}});
 win.once('closed',()=>{if(worker?.connected)worker.disconnect();for(const n of Object.keys(actions))ipcMain.removeHandler('tubesave-setup:'+n);instance=null;});
 await win.loadURL(home);win.show();await fs.writeFile(path.join(dataDir,'welcome-seen.json'),JSON.stringify({seen:true}),{mode:0o600});
}
module.exports={open,available,safeEvent};
