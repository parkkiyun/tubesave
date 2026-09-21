'use strict';
const {EventEmitter}=require('node:events');
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),http=require('node:http');
const {createReadStream}=require('node:fs');
const {spawn}=require('node:child_process');
const net=require('./personal-network.cjs');
const trust=require('./personal-trust.cjs');
const FEED=`https://github.com/${trust.REPO}/releases/latest/download/personal-update.json`;
function configValid(c){
  try{return !!(c&&c.format==='personal-ed25519'&&c.enabled===true&&c.repository===trust.REPO&&[trust.APP_ID,trust.TEST_APP_ID].includes(c.appId)&&trust.keyObject(c.publicKey));}catch{return false;}
}
class PersonalUpdater extends EventEmitter{
  constructor({config,version,dataDir,resourcesPath,executable,quit=()=>{},platform=process.platform,arch=process.arch,network=net}={}){
    super();if(!configValid(config))throw Error('Personal update signing key is not configured.');
    trust.compare(version,version);this.config=config;this.version=version;this.platform=platform;this.arch=arch;this.dir=path.join(dataDir,'personal-updates');this.resourcesPath=resourcesPath;this.executable=executable;this.quit=quit;this.network=network;
    this.testOrigin=config.appId===trust.TEST_APP_ID&&config.testOrigin?config.testOrigin:null;
    if(this.testOrigin){const u=new URL(this.testOrigin);if(u.protocol!=='http:'||u.hostname!=='127.0.0.1'||u.pathname!=='/'||u.search||u.hash||u.username||u.password)throw Error('Invalid test origin.');this.testOrigin=u.origin;}
  }
  async checkForUpdates(){
    this.emit('checking-for-update');
    const m=trust.verifyEnvelope(await this.network.read(this.testOrigin?this.testOrigin+'/personal-update.json':FEED,{testOrigin:this.testOrigin}),this.config.publicKey,{appId:this.config.appId});
    if(trust.compare(m.version,this.version)<=0){this.release=null;this.emit('update-not-available',{version:this.version});return;}
    let highest=this.version;try{highest=JSON.parse(await fs.readFile(path.join(this.dir,'highest.json'),'utf8')).version;trust.compare(highest,highest);}catch{}
    if(trust.compare(m.version,highest)<0)throw Error('Previously seen newer signed release; refusing rollback.');
    const info=m.files.find(f=>f.platform===this.platform&&f.arch===this.arch);if(!info)throw Error('No signed update for this architecture.');
    await fs.mkdir(this.dir,{recursive:true,mode:0o700});if((await fs.lstat(this.dir)).isSymbolicLink())throw Error('Unsafe update cache.');
    await fs.writeFile(path.join(this.dir,'highest.json.tmp'),JSON.stringify({version:m.version}),{mode:0o600});await fs.rename(path.join(this.dir,'highest.json.tmp'),path.join(this.dir,'highest.json'));
    this.release=m;this.info=info;this.emit('update-available',{version:m.version,releaseNotes:m.notes});
  }
  async downloadUpdate(){
    if(!this.release||!this.info)throw Error('No verified release selected.');
    await fs.mkdir(this.dir,{recursive:true,mode:0o700});
    if(this.stage)await fs.rm(this.stage,{recursive:true,force:true});
    this.stage=await fs.mkdtemp(path.join(this.dir,'stage-'));this.file=path.join(this.stage,this.info.name);
    const url=this.testOrigin?this.testOrigin+'/'+this.info.name:this.info.url;
    try{await this.network.download(url,this.file,{size:this.info.size,testOrigin:this.testOrigin,onProgress:p=>this.emit('download-progress',p)});
    await trust.verifyArchive(this.file,this.info,this.config.publicKey);
    this.emit('update-downloaded',{version:this.release.version});return [this.file];
    }catch(e){await fs.rm(this.stage,{recursive:true,force:true});this.file=null;this.stage=null;throw e;}
  }
  async quitAndInstall(){
    if(!this.file||!this.info||!this.release)throw Error('No downloaded update.');
    // Revalidate immediately before executable launch; cached bytes are not blindly trusted.
    await trust.verifyArchive(this.file,this.info,this.config.publicKey);
    await fs.writeFile(path.join(this.dir,'receipt.json'),JSON.stringify({from:this.version,to:this.release.version,startedAt:new Date().toISOString()}),{mode:0o600});
    if(this.platform==='win32')return this.installWindows();
    if(this.platform==='darwin')return this.installMac();
    throw Error('Unsupported updater platform.');
  }
  async installWindows(){
    if(path.extname(this.executable).toLowerCase()!=='.exe'||!path.isAbsolute(this.executable))throw Error('Invalid installed app path.');
    const args=['--updated','/S','--force-run',`/D=${path.dirname(this.executable)}`];
    const child=spawn(this.file,args,{detached:true,stdio:'ignore',shell:false,windowsHide:true});
    await new Promise((resolve,reject)=>{child.once('error',reject);child.once('spawn',resolve);});
    child.unref();this.quit();
  }
  async installMac(){
    const bundle=path.resolve(this.resourcesPath,'..','..');
    if(!bundle.endsWith('.app')||bundle.startsWith('/Volumes/')||bundle.includes('/AppTranslocation/'))throw Error('Move TubeSave to a writable Applications folder before updating.');
    await fs.access(path.dirname(bundle),require('node:fs').constants.W_OK);
    // Keep Sparkle outside the app that it is about to replace, preserving framework symlinks.
    const helper=path.join(this.stage,'sparkle');await fs.cp(path.join(this.resourcesPath,'sparkle'),helper,{recursive:true,dereference:false,verbatimSymlinks:true});
    const command=path.join(helper,'sparkle.app','Contents','MacOS','sparkle');await fs.access(command,require('node:fs').constants.X_OK);
    const token=crypto.randomBytes(24).toString('hex');
    const server=http.createServer((req,res)=>{
      if(req.method!=='GET'){res.writeHead(405).end();return;}
      if(req.url===`/${token}/appcast.xml`){const xml=trust.appcast(this.release,this.info,`http://127.0.0.1:${server.address().port}/${token}/archive.zip`);res.writeHead(200,{'Content-Type':'application/xml','Content-Length':Buffer.byteLength(xml)}).end(xml);}
      else if(req.url===`/${token}/archive.zip`){res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Length':this.info.size});createReadStream(this.file).on('error',()=>res.destroy()).pipe(res);}
      else res.writeHead(404).end();
    });
    server.requestTimeout=30000;await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    const args=[bundle,'--check-immediately','--allow-major-upgrades','--user-agent-name','TubeSave Personal','--feed-url',`http://127.0.0.1:${server.address().port}/${token}/appcast.xml`];
    // Sparkle validates against SUPublicEDKey in the installed host Info.plist,
    // stages the archive, then terminates and relaunches the host itself.
    const child=spawn(command,args,{detached:true,stdio:this.config.appId===trust.TEST_APP_ID?'inherit':'ignore',shell:false});
    this.installServer=server;
    try{await new Promise((resolve,reject)=>{child.once('error',reject);child.once('spawn',resolve);});}catch(e){server.close();throw e;}
    const deadline=setTimeout(()=>{child.kill('SIGTERM');server.close();this.emit('error',new Error('Sparkle installation timed out.'));},180000);deadline.unref();
    child.once('exit',code=>{clearTimeout(deadline);server.close();if(code!==0)this.emit('error',new Error('Sparkle installation failed ('+code+').'));});child.unref();
  }
  async completeReceipt(){
    try{const file=path.join(this.dir,'receipt.json');const r=JSON.parse(await fs.readFile(file,'utf8'));if(r.to===this.version){r.completedAt=new Date().toISOString();r.status='installed';await fs.writeFile(file,JSON.stringify(r),{mode:0o600});return r;}return null;}catch{return null;}
  }
}
module.exports={PersonalUpdater,configValid,FEED};
