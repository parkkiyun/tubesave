'use strict';
// Only narrowly-scoped, validated operations cross the renderer boundary.
const {contextBridge,ipcRenderer}=require('electron');
const call=(channel,data={})=>ipcRenderer.invoke('ts:'+channel,data).then(result=>{if(!result.ok)throw new Error(result.error||'요청 실패');return result.data;});
contextBridge.exposeInMainWorld('tubeSave',Object.freeze({
  checkUpdate:()=>call('checkUpdate'),downloadUpdate:()=>call('downloadUpdate'),installUpdate:()=>call('installUpdate'),updatePreferences:d=>call('updatePreferences',d),
  onOpenUpdates:callback=>{const listener=()=>callback();ipcRenderer.on('ts:open-updates',listener);return()=>ipcRenderer.removeListener('ts:open-updates',listener);},
  state:()=>call('state'),download:d=>call('download',d),info:d=>call('info',d),settings:d=>call('settings',d),cancel:d=>call('cancel',d),retry:d=>call('retry',d),clearHistory:()=>call('clearHistory'),auth:d=>call('auth',d),resetAuth:()=>call('resetAuth'),pickFolder:()=>call('pickFolder'),pickCookieFile:()=>call('pickCookieFile'),openFolder:d=>call('openFolder',d),installTools:()=>call('installTools'),openYouTube:()=>call('openYouTube'),readClipboard:()=>call('readClipboard'),quit:()=>call('quit'),
  onStateChanged:callback=>{const listener=()=>callback();ipcRenderer.on('ts:state-changed',listener);return()=>ipcRenderer.removeListener('ts:state-changed',listener);}
}));
