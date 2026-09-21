'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {UserError}=require('./core.cjs');
function releaseNotes(value){
  const raw=Array.isArray(value)?value.map(v=>String(v.note||'')).join('\n\n'):String(value||'');
  // Render strictly as text. No HTML, markdown links, or shell arguments.
  return raw.replace(/<[^>]*>/g,'').replace(/[\x00-\x08\x0b-\x1f\x7f]/g,'').slice(0,12000);
}
function validReleaseConfig(c){
  return !!(c&&c.enabled===true&&c.provider==='github'&&/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(c.owner||'')&&/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/.test(c.repo||'')&&!['.','..'].includes(c.repo));
}
class UpdateController {
  constructor({adapter=null,version='2.1.0',reason='',onChange=()=>{},isBusy=()=>false,beforeInstall=async()=>{},installFailed=()=>{},clock=()=>new Date().toISOString()}={}){
    this.adapter=adapter;this.onChange=onChange;this.isBusy=isBusy;this.beforeInstall=beforeInstall;this.installFailed=installFailed;this.clock=clock;this.listeners=[];
    this.value={status:adapter?'idle':'disabled',currentVersion:version,version:null,notes:'',progress:0,bytesPerSecond:0,transferred:0,total:0,lastChecked:null,message:reason,autoCheck:true,retry:null};
    if(adapter){
      adapter.autoDownload=false;adapter.autoInstallOnAppQuit=false;adapter.allowPrerelease=false;adapter.allowDowngrade=false;
      this.listen('checking-for-update',()=>this.set({status:'checking',message:'새 버전을 확인하고 있어요.',retry:null}));
      this.listen('update-available',i=>{
        if(!/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(i?.version||'')){this.error('check');return;}
        this.set({status:'available',version:i.version,notes:releaseNotes(i.releaseNotes),lastChecked:this.clock(),message:'새로운 버전이 있어요.',retry:null});
      });
      this.listen('update-not-available',()=>this.set({status:'up-to-date',version:null,notes:'',lastChecked:this.clock(),message:'최신 버전을 사용하고 있어요.',retry:null}));
      this.listen('download-progress',p=>{
        if(this.value.status!=='downloading')return;
        this.set({progress:Math.min(100,Math.max(0,Number(p.percent)||0)),bytesPerSecond:Math.max(0,Number(p.bytesPerSecond)||0),transferred:Math.max(0,Number(p.transferred)||0),total:Math.max(0,Number(p.total)||0)});
      });
      this.listen('update-downloaded',i=>{if(this.value.status==='downloading')this.set({status:'downloaded',progress:100,message:'업데이트가 준비됐어요. 재시작하면 설치됩니다.',retry:null});});
      this.listen('error',()=>{if(this.value.status==='installing'){this.installFailed();this.set({status:'downloaded',message:'설치를 시작하지 못했어요. 현재 앱은 그대로 유지됩니다.'});}else this.error(this.value.status==='downloading'?'download':'check');});
    }
  }
  listen(name,handler){this.adapter.on(name,handler);this.listeners.push([name,handler]);}
  state(){return {...this.value,busy:this.isBusy()};}
  set(patch){Object.assign(this.value,patch);this.onChange();}
  error(retry){
    // Avoid leaking signed URLs, local paths, or headers via library errors.
    this.set({status:'error',retry,message:retry==='download'?'업데이트 파일을 받거나 검증하지 못했어요. 현재 앱은 그대로 유지됩니다.':'업데이트를 확인하지 못했어요. 인터넷 연결 또는 배포 설정을 확인해 주세요.'});
  }
  async check(){
    if(!this.adapter)return this.state();
    if(['checking','downloading','downloaded','installing'].includes(this.value.status))return this.state();
    this.set({status:'checking',message:'새 버전을 확인하고 있어요.',retry:null});
    try{await this.adapter.checkForUpdates();}catch{this.error('check');}
    return this.state();
  }
  async download(){
    if(!this.adapter)throw new UserError(this.value.message||'배포 연결이 필요합니다.');
    if(this.value.status==='downloading')return this.state();
    if(this.value.status!=='available'&&!(this.value.status==='error'&&this.value.retry==='download'))throw new UserError('먼저 새 버전을 확인해 주세요.');
    this.set({status:'downloading',progress:0,message:'업데이트 파일을 받고 있어요.',retry:null});
    try{await this.adapter.downloadUpdate();}catch{this.error('download');}
    return this.state();
  }
  async install(){
    if(this.value.status!=='downloaded')throw new UserError('업데이트 다운로드를 먼저 완료해 주세요.');
    if(this.isBusy())throw new UserError('영상 다운로드·대기 작업·엔진 작업을 마친 뒤 재시작해 주세요.');
    // beforeInstall locks the service synchronously before its first await,
    // so no new job can sneak in during the shutdown transaction.
    this.set({status:'installing',message:'업데이트를 적용하고 있어요.'});
    try{await this.beforeInstall();await this.adapter.quitAndInstall(false,true);}
    catch(e){this.installFailed();this.set({status:'downloaded',message:'설치를 시작하지 못했어요. 현재 앱은 그대로 유지됩니다.'});throw new UserError('업데이트 설치를 시작하지 못했습니다. 앱을 계속 사용하거나 다시 시도하세요.');}
    return this.state();
  }
  dispose(){for(const [n,h]of this.listeners)this.adapter.removeListener(n,h);this.listeners=[];}
}
class UpdatePreferences{
  constructor(dir){this.file=path.join(dir,'update-preferences.json');this.autoCheck=true;this.chain=Promise.resolve();}
  async init(){try{const j=JSON.parse(await fs.readFile(this.file,'utf8'));if(typeof j.autoCheck==='boolean')this.autoCheck=j.autoCheck;}catch{}return this;}
  async save(autoCheck){
    if(typeof autoCheck!=='boolean')throw new UserError('자동 확인 설정을 확인해 주세요.');
    this.autoCheck=autoCheck;
    this.chain=this.chain.catch(()=>{}).then(async()=>{await fs.writeFile(this.file+'.tmp',JSON.stringify({autoCheck}),{mode:0o600});await fs.rename(this.file+'.tmp',this.file);});
    await this.chain;
  }
}
module.exports={UpdateController,UpdatePreferences,validReleaseConfig,releaseNotes};
