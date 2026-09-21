'use strict';
// Explicit Electron integration test. Uses real BrowserWindow, preload and IPC.
// No real account cookies or user media are accessed.
if(process.versions.electron){
  const {app}=require('electron'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
  app.disableHardwareAcceleration(); // CI hosts may lack a GPU; sandbox stays enabled.
  const expectedVersion=require('../app/package.json').version;
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'tubesave-smoke-'));
  app.setPath('appData',profile);app.setPath('userData',profile);
  let finished=false;
  const timer=setTimeout(()=>{console.error('Native smoke test timed out');app.exit(1);},45000);
  app.once('browser-window-created',(_event,win)=>{
    win.webContents.once('did-finish-load',async()=>{
      try{
        const preferences=win.webContents.getLastWebPreferences();
        if(!preferences.sandbox||!preferences.contextIsolation||preferences.nodeIntegration)throw Error('Renderer security regression');
        const result=await win.webContents.executeJavaScript(`(async()=>{
          const assert=(v,m)=>{if(!v)throw Error(m);};
          assert(location.protocol==='tubesave:','Local protocol');
          assert(typeof require==='undefined'&&typeof process==='undefined','Renderer isolation');
          assert(window.tubeSave,'Real preload API');
          const state=await window.tubeSave.state();assert(state.version===${JSON.stringify(expectedVersion)},'IPC version');
          document.querySelector('[data-view="settings"]').click();assert(!document.querySelector('#view-settings').hidden,'Settings navigation');
          document.querySelector('[data-view="history"]').click();assert(!document.querySelector('#view-history').hidden,'History navigation');
          document.querySelector('[data-view="download"]').click();
          document.querySelector('[data-format="mp3"]').click();assert(document.querySelector('#quality').hidden,'Audio-specific controls');
          document.querySelector('[data-format="mp4"]').click();
          document.querySelector('#top-auth').click();assert(document.querySelector('#auth-dialog').open,'Account dialog');
          assert(!document.querySelector('#auth-consent').checked,'Consent is not preselected');
          document.querySelector('#auth-dialog').close();
          return {version:state.version,protocol:location.protocol,preload:true,ipc:true,ui:true};
        })()`);
        const out=path.resolve('ci-results');fs.mkdirSync(out,{recursive:true});
        fs.writeFileSync(path.join(out,'native-smoke.json'),JSON.stringify(result,null,2));
        const image=await win.webContents.capturePage();fs.writeFileSync(path.join(out,'native-smoke.png'),image.toPNG());
        console.log('NATIVE_SMOKE_OK',JSON.stringify(result));finished=true;clearTimeout(timer);app.exit(0);
      }catch(e){console.error('NATIVE_SMOKE_FAILED',e);clearTimeout(timer);app.exit(1);}
    });
  });
  process.on('uncaughtException',e=>{if(!finished){console.error(e);app.exit(1);}});
  require('../app/main.cjs');
}
