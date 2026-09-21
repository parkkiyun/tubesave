'use strict';
const {contextBridge,ipcRenderer}=require('electron');
const call=(action,data={})=>ipcRenderer.invoke('tubesave-setup:'+action,data).then(r=>{if(!r.ok)throw Error(r.error);return r.data;});
contextBridge.exposeInMainWorld('tubeSaveSetup',Object.freeze({start:consent=>call('start',{consent}),close:()=>call('close'),openGitHub:()=>call('openGitHub'),onEvent:callback=>{const listener=(_e,v)=>callback(v);ipcRenderer.on('tubesave-setup:event',listener);return()=>ipcRenderer.removeListener('tubesave-setup:event',listener);}}));
