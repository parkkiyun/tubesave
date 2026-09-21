'use strict';
// Preview has its own application-data namespace and cannot replace a production install.
const {app}=require('electron'),path=require('node:path'),fs=require('node:fs');
const base=path.join(app.getPath('appData'),'TubeSave Preview');
fs.mkdirSync(base,{recursive:true});app.setPath('appData',base);app.setPath('userData',base);
app.on('browser-window-created',(_event,win)=>{win.on('page-title-updated',event=>{event.preventDefault();win.setTitle('TubeSave Preview - 테스트 설치본');});});
require('./main.cjs');
