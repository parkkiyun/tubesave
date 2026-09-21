'use strict';
// The personal channel cannot overwrite a Preview or a paid-certificate release.
const {app}=require('electron'),path=require('node:path'),fs=require('node:fs');
const base=path.join(app.getPath('appData'),'TubeSave Personal');
fs.mkdirSync(base,{recursive:true,mode:0o700});app.setPath('appData',base);app.setPath('userData',base);
app.on('browser-window-created',(_event,win)=>{win.on('page-title-updated',event=>{event.preventDefault();win.setTitle('TubeSave Personal');});});
require('./main.cjs');
