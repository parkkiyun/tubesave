'use strict';
// Ordinary installer edition: usable immediately, optional graphical update setup.
const {app,Menu,MenuItem}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path');
const setup=require('./lib/setup-window.cjs');
app.on('browser-window-created',(_event,win)=>{
 win.webContents.once('did-finish-load',async()=>{
  if(!win.webContents.getURL().startsWith('tubesave://app/'))return;
  const dataDir=app.getPath('userData');
  const open=()=>setup.open({parent:win,resourcesPath:process.resourcesPath,dataDir}).catch(e=>require('electron').dialog.showErrorBox('업데이트 연결',String(e.message)));
  const menu=Menu.getApplicationMenu();
  const help=menu?.items.find(i=>i.label==='도움말');
  if(help){help.submenu.insert(0,new MenuItem({label:'자동 업데이트 연결…',click:open}));Menu.setApplicationMenu(menu);}
  try{await fs.access(path.join(dataDir,'welcome-seen.json'));}catch{await open();}
 });
});
require('./main.cjs');
