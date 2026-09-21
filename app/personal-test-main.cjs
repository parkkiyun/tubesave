'use strict';
// This entrypoint is excluded from real personal builds. It only runs inside an
// isolated native integration fixture whose distribution pins a temporary test key.
const {app}=require('electron'),fs=require('node:fs'),path=require('node:path');
const {TEST_APP_ID}=require('./lib/personal-trust.cjs');
const {PersonalUpdater}=require('./lib/personal-updater.cjs');
const {UpdateController}=require('./lib/updates.cjs');
const c=JSON.parse(fs.readFileSync(path.join(process.resourcesPath,'distribution.json'),'utf8'));
if(c.appId!==TEST_APP_ID||!c.testOrigin||!path.isAbsolute(c.testDataDir)||!path.isAbsolute(c.testResult))throw Error('Not an isolated test build.');
app.disableHardwareAcceleration();app.setName('TubeSave Update Test');app.setPath('userData',c.testDataDir);app.setAppUserModelId(TEST_APP_ID);
app.whenReady().then(async()=>{
 const version=app.getVersion();
 if(version===c.testTarget){fs.writeFileSync(c.testResult,JSON.stringify({version,updated:true,platform:process.platform,arch:process.arch}));app.exit(0);return;}
 const adapter=new PersonalUpdater({config:c,version,dataDir:c.testDataDir,resourcesPath:process.resourcesPath,executable:process.execPath,quit:()=>app.quit()});
 adapter.on('error',e=>{fs.writeFileSync(c.testResult+'.failure',String(e.message));});
 const controller=new UpdateController({adapter,version});
 await controller.check();if(controller.state().status!=='available')throw Error('Real update check failed.');
 await controller.download();if(controller.state().status!=='error')throw Error('Tampered first archive was not rejected.');
 fs.writeFileSync(c.testResult+'.tamper-rejected','yes');
 await controller.download();if(controller.state().status!=='downloaded')throw Error('Valid retry did not download.');
 await controller.install();
}).catch(e=>{fs.writeFileSync(c.testResult+'.failure',String(e.stack));app.exit(1);});
