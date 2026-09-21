'use strict';
if(process.versions.electron){
 const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
 app.disableHardwareAcceleration();
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'tubesave-setup-smoke-'));app.setPath('userData',profile);
 const output=path.resolve('dist-desktop');
 const resources=process.platform==='darwin'?path.join(output,process.arch==='arm64'?'mac-arm64':'mac','TubeSave.app','Contents','Resources'):path.join(output,'win-unpacked','resources');
 const timer=setTimeout(()=>{console.error('GUI smoke timeout');app.exit(1);},45000);
 app.whenReady().then(async()=>{
  try{
   const setup=require('../app/lib/setup-window.cjs');assert(await setup.available(resources));
   assert.equal(setup.safeEvent({type:'auth',code:'evil link'}),null);assert.deepEqual(setup.safeEvent({type:'auth',code:'ABCD-1234'}),{type:'auth',code:'ABCD-1234'});
   await setup.open({resourcesPath:resources,dataDir:profile});const win=BrowserWindow.getAllWindows()[0];
   const prefs=win.webContents.getLastWebPreferences();assert(prefs.sandbox&&prefs.contextIsolation&&!prefs.nodeIntegration);
   const result=await win.webContents.executeJavaScript(`(async()=>{
    const check=(v,m)=>{if(!v)throw Error(m);};check(typeof window.require==='undefined','No Node in renderer');check(window.tubeSaveSetup,'Real preload');
    check(!document.getElementById('welcome').hidden,'Welcome displayed');
    document.getElementById('configure').click();check(!document.getElementById('connect').hidden,'Connection step');check(!document.getElementById('consent').checked,'Unselected consent');check(document.getElementById('start').disabled,'Start blocked before consent');
    let denied=false;try{await window.tubeSaveSetup.start(false);}catch{denied=true;}check(denied,'Main-side consent check');
    let urlDenied=false;try{await window.tubeSaveSetup.openGitHub();}catch{urlDenied=true;}check(urlDenied,'Browser opening requires a live device code');
    return {welcome:true,preload:true,consentRequired:true,githubOpenGuard:true};})()`);
   fs.mkdirSync('ci-results',{recursive:true});fs.writeFileSync('ci-results/setup-gui.json',JSON.stringify({...result,platform:process.platform,arch:process.arch},null,2));
   await win.webContents.executeJavaScript("document.getElementById('connect').hidden=true;document.getElementById('welcome').hidden=false;");
   fs.writeFileSync('ci-results/setup-welcome.png',(await win.webContents.capturePage()).toPNG());
   await win.webContents.executeJavaScript("document.getElementById('configure').click();");
   fs.writeFileSync('ci-results/setup-connect.png',(await win.webContents.capturePage()).toPNG());
   console.log('DESKTOP_SETUP_GUI_OK',JSON.stringify(result));clearTimeout(timer);app.exit(0);
  }catch(e){console.error(e);clearTimeout(timer);app.exit(1);}
 });
}
