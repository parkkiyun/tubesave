'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const c=require('./core.cjs');
const {runProcess}=require('./process.cjs');
const TERMINAL=new Set(['done','failed','cancelled']);
const HISTORY_KEYS=['id','url','title','mode','quality','folder','status','stage','progress','size','file','created','error'];
class Engine {
  constructor(tools,authRoot,{nodeExe=process.execPath,runner=runProcess}={}){this.tools=tools;this.authRoot=authRoot;this.nodeExe=nodeExe;this.runner=runner;}
  ready(){if(!this.tools.health.ready||this.tools.busy)throw new c.UserError('엔진을 확인하지 못했습니다. 설정에서 엔진 복구를 실행해 주세요.');}
  baseArgs(){return ['--ignore-config','--no-plugin-dirs','--no-playlist','--no-colors','--encoding','utf-8','--socket-timeout','20','--retries','3','--fragment-retries','3','--extractor-retries','2','--no-js-runtimes','--js-runtimes',`node:${this.nodeExe}`,'--ffmpeg-location',this.tools.ffmpeg];}
  command(job,work){
    const args=[...this.baseArgs(),'--no-simulate','--newline','--progress','--progress-delta','0.4','--windows-filenames','--no-mtime','--no-overwrites','--concurrent-fragments','2','--match-filter','live_status != is_live & live_status != is_upcoming','--format',c.formatSelector(job.mode,job.quality),'--output',path.join(work,'%(title).120B [%(id)s].%(ext)s'),'--print','before_dl:__TS_META__{"title":%(title)j,"duration":%(duration)j,"format":%(format)j}','--print','after_move:__TS_FILE__%(filepath)j','--progress-template','download:__TS_PROGRESS__{"status":%(progress.status)j,"downloaded":%(progress.downloaded_bytes)j,"total":%(progress.total_bytes)j,"estimate":%(progress.total_bytes_estimate)j,"speed":%(progress.speed)j,"eta":%(progress.eta)j}','--progress-template','postprocess:__TS_POST__%(progress.status)j'];
    if(job.mode==='mp4')args.push('--format-sort','res,fps,+codec:avc:m4a');
    if(job.mode!=='mp3')args.push('--merge-output-format',job.mode,'--remux-video',job.mode);
    return args;
  }
  async inspect(url,auth,signal){
    this.ready();const lines=[];let payload=null;const ctx=await c.authContext(auth,this.authRoot);
    try{
      const code=await this.runner(this.tools.ytdlp,[...this.baseArgs(),...ctx.args,'--dump-single-json','--skip-download','--no-progress','--',url],{signal,timeout:120000,onLine:line=>{
        if(line.startsWith('{')){try{const p=JSON.parse(line);if(p&&typeof p==='object'){payload=p;return;}}catch{}}
        lines.push(line.slice(-3000));if(lines.length>30)lines.shift();
      }});
      if(code!==0||!payload)throw new c.UserError(c.friendlyError(lines.join('\n')));
      if(payload.is_live||payload.live_status==='is_upcoming')throw new c.UserError('진행 중·예약된 라이브는 지원하지 않습니다.');
      const heights=[...new Set((payload.formats||[]).filter(f=>!f.has_drm&&c.number(f.height)).map(f=>Number(f.height)))].sort((a,b)=>b-a);
      return {url,title:String(payload.title||'제목 없음'),channel:String(payload.channel||payload.uploader||''),duration:c.number(payload.duration),heights,auth_label:c.authLabel(auth),access_note:'영상 정보를 조회했습니다. 실제 파일 다운로드 성공까지 보장하지는 않습니다.',thumbnail:`https://i.ytimg.com/vi/${new URL(url).searchParams.get('v')}/hqdefault.jpg`};
    }finally{await ctx.cleanup();}
  }
  async download(job,auth,signal,update,log){
    this.ready();const folder=await c.outputDirectory(job.folder);
    const work=await fs.mkdtemp(path.join(folder,'.tubesave-partial-'));
    let file=null,duration=null,ctx=null;const errors=[];
    try {
      ctx=await c.authContext(auth,this.authRoot);
      const line=l=>{
        const ev=c.parseEvent(l);
        if(!ev){if(l.trim()){errors.push(l.slice(-2500));if(errors.length>30)errors.shift();log(c.redact(l,ctx.secrets));}return;}
        const d=ev.data;
        if(ev.kind==='meta'){duration=c.number(d.duration);update({title:String(d.title||'영상'),stage:'다운로드 준비 중'});}
        if(ev.kind==='progress'){
          const total=c.number(d.total)||c.number(d.estimate),downloaded=c.number(d.downloaded)||0;
          update({stage:'영상·음성 스트림 다운로드 중',progress:total?Math.min(100,downloaded/total*100):null,speed:c.number(d.speed),eta:c.number(d.eta)});
        }
        if(ev.kind==='post')update({stage:'영상·음성 병합 및 파일 정리 중',progress:null,speed:null,eta:null});
        if(ev.kind==='file'){const p=path.resolve(d);if(!c.inside(work,p))throw new c.UserError('예상하지 않은 다운로드 파일 경로입니다.');file=p;}
      };
      const code=await this.runner(this.tools.ytdlp,[...this.command(job,work),...ctx.args,'--',job.url],{signal,onLine:line});
      if(code!==0)throw new c.UserError(c.friendlyError(errors.join('\n')));
      if(!file)throw new c.UserError('완성된 파일을 확인하지 못했습니다. 진행 중인 라이브는 지원하지 않습니다.');
      const real=await fs.realpath(file);if(!c.inside(await fs.realpath(work),real))throw new c.UserError('파일 경로가 작업 폴더를 벗어났습니다.');
      if(!(await fs.stat(real)).size)throw new c.UserError('완성된 파일이 비어 있습니다.');
      if(job.mode==='mp3'){
        update({stage:'MP3 오디오로 변환 중',progress:null,speed:null,eta:null});
        const ext=path.extname(file),target=file.slice(0,-ext.length)+(ext==='.mp3'?'_audio':'')+'.mp3';
        const code=await this.runner(this.tools.ffmpeg,['-hide_banner','-nostdin','-n','-i',file,'-vn','-map_metadata','0','-codec:a','libmp3lame','-b:a','192k','-progress','pipe:1','-nostats',target],{signal,onLine:l=>{if(l.startsWith('out_time_us=')&&duration){const t=c.number(l.slice(12));if(t!==null)update({progress:Math.min(99.9,t/(duration*10000))});}else if(!l.includes('='))log(c.redact(l,ctx.secrets));}});
        if(code!==0)throw new c.UserError('MP3 변환에 실패했습니다.');file=target;
      }
      if(signal.aborted)throw new c.Cancelled();
      const st=await fs.stat(file);if(!st.isFile()||!st.size)throw new c.UserError('완성된 파일이 비어 있습니다.');
      const published=await c.publishFile(file,folder);
      // Once publication starts, the completed file is preserved even if a
      // cancellation arrives. Never delete a successfully published video.
      return {file:published,size:st.size};
    }finally{if(ctx)await ctx.cleanup();await fs.rm(work,{recursive:true,force:true}).catch(()=>{});}
  }
}
class Service {
  constructor(engine,tools,dataDir,downloads,onChange=()=>{},onDone=()=>{}){
    this.engine=engine;this.tools=tools;this.dataDir=dataDir;this.settings={folder:path.join(downloads,'YouTube'),mode:'mp4',quality:'1080'};
    this.onChange=onChange;this.onDone=onDone;this.jobs=[];this.auth={mode:'none'};this.authEpoch=0;this.secrets=new Map();this.controls=new Map();this.inspectController=null;this.inspectAuth=false;this.working=false;this.closed=false;this.maintenance=false;this.saveChain=Promise.resolve();this.stateWarning='';
  }
  async init(){
    await fs.mkdir(this.dataDir,{recursive:true,mode:0o700});
    // Crash leftovers for cookie-file sessions belong only to this app.
    await fs.rm(path.join(this.dataDir,'private-auth'),{recursive:true,force:true});
    try{const s=JSON.parse(await fs.readFile(path.join(this.dataDir,'settings.json'),'utf8'));c.formatSelector(s.mode,s.quality);if(typeof s.folder==='string'&&path.isAbsolute(s.folder))this.settings={folder:s.folder,mode:s.mode,quality:s.quality};}catch{}
    try{
      const h=JSON.parse(await fs.readFile(path.join(this.dataDir,'history.json'),'utf8'));
      if(Array.isArray(h))for(const row of h.slice(0,50)){
        if(!row||!TERMINAL.has(row.status)||typeof row.id!=='string')continue;
        try{row.url=c.normalizeUrl(row.url);c.formatSelector(row.mode,row.quality);if(typeof row.folder!=='string'||!path.isAbsolute(row.folder))continue;}catch{continue;}
        const safe=Object.fromEntries(HISTORY_KEYS.filter(k=>Object.hasOwn(row,k)).map(k=>[k,row[k]]));this.jobs.push({...safe,auth_label:'로그인 재연결 필요',logs:[],progress:row.status==='done'?100:null});
      }
    }catch{}
    await this.tools.init();
  }
  state(){return {settings:{...this.settings},platform:process.platform,health:{...this.tools.health,installing:this.tools.busy,install_status:this.tools.status},auth:{...this.auth},jobs:[...this.jobs].reverse(),warning:this.stateWarning,desktop:true,active:this.active(),maintenance:this.maintenance};}
  active(){return this.working||!!this.inspectController||this.jobs.some(j=>['queued','running'].includes(j.status));}
  changed(){this.onChange();}
  persist(){
    const history=this.jobs.filter(j=>TERMINAL.has(j.status)).slice(-50).map(j=>Object.fromEntries(HISTORY_KEYS.map(k=>[k,j[k]])));
    const settings={...this.settings};
    this.saveChain=this.saveChain.catch(()=>{}).then(async()=>{
      for(const [name,data]of [['settings',settings],['history',history]]){const file=path.join(this.dataDir,name+'.json'),tmp=file+'.tmp';await fs.writeFile(tmp,JSON.stringify(data,null,2),{mode:0o600});await fs.rename(tmp,file);}
    }).catch(()=>{this.stateWarning='설정·기록을 저장하지 못했습니다. 앱 데이터 폴더 권한을 확인하세요.';this.changed();});return this.saveChain;
  }
  async saveSettings(data){
    const mode=data.mode??this.settings.mode,quality=data.quality??this.settings.quality;c.formatSelector(mode,quality);
    const folder=await c.outputDirectory(data.folder??this.settings.folder),settings={mode,quality,folder};this.settings=settings;await this.persist();this.changed();return {...settings};
  }
  configureAuth(data){this.auth=c.validateAuth(data);this.changed();return {auth:{...this.auth},note:'연결 설정을 적용했습니다. 영상 접근 확인으로 시청 권한을 확인하세요.'};}
  async inspect(data){
    if(this.closed)throw new c.Cancelled();if(this.maintenance)throw new c.UserError('앱 업데이트 설치를 준비하고 있습니다.');if(this.inspectController)throw new c.UserError('이미 영상 정보를 확인하고 있습니다.');
    const url=c.normalizeUrl(data.url),auth=c.validateAuth(data.auth??this.auth);this.inspectController=new AbortController();this.inspectAuth=auth.mode!=='none';
    try{return await this.engine.inspect(url,auth,this.inspectController.signal);}finally{this.inspectController=null;this.inspectAuth=false;this.changed();}
  }
  async enqueue(data){
    if(this.closed)throw new c.Cancelled();if(this.maintenance)throw new c.UserError('앱 업데이트 설치를 준비하고 있습니다.');this.engine.ready();
    const urls=c.normalizeUrls(data.urls),auth=c.validateAuth(data.auth??this.auth),epoch=this.authEpoch;const settings=await this.saveSettings(data);
    if(this.closed||this.maintenance||(auth.mode!=='none'&&epoch!==this.authEpoch))throw new c.Cancelled();
    if(this.jobs.filter(j=>['queued','running'].includes(j.status)).length+urls.length>100)throw new c.UserError('대기 중인 작업이 많습니다. 완료 후 추가해 주세요.');
    let skipped=0;const added=[];
    for(const url of urls){
      if(this.jobs.some(j=>j.url===url&&j.mode===settings.mode&&j.quality===settings.quality&&j.folder===settings.folder&&['queued','running'].includes(j.status))){skipped++;continue;}
      const id=crypto.randomUUID(),job={id,url,...settings,title:'영상 정보 확인 대기',status:'queued',stage:'대기 중',progress:null,speed:null,eta:null,created:new Date().toISOString(),auth_label:c.authLabel(auth),logs:[]};
      this.jobs.push(job);this.secrets.set(id,{...auth});this.controls.set(id,new AbortController());added.push(id);
    }
    this.auth={...auth};this.changed();void this.pump();return {added,skipped};
  }
  async pump(){
    if(this.working||this.closed)return;this.working=true;
    try{let job;while(!this.closed&&(job=this.jobs.find(j=>j.status==='queued'))){
      const auth=this.secrets.get(job.id)||{mode:'none'},control=this.controls.get(job.id);job.status='running';job.stage=auth.mode==='none'?'영상 정보 확인 중':'로그인 연결 확인 중';this.changed();
      try{
        const result=await this.engine.download(job,auth,control.signal,patch=>{Object.assign(job,patch);this.changed();},line=>{job.logs.push(line);if(job.logs.length>50)job.logs.shift();this.changed();});
        Object.assign(job,result,{status:'done',stage:'저장 완료',progress:100,speed:null,eta:null});
        // Notifications must never turn a successfully saved file into a failed job.
        try{this.onDone(job);}catch{}
      }catch(e){job.status=e instanceof c.Cancelled||control.signal.aborted?'cancelled':'failed';job.error=job.status==='cancelled'?'':c.redact(e.message,[auth.file,auth.profile]);job.stage=job.status==='cancelled'?'취소됨':'실패';}
      finally{this.secrets.delete(job.id);this.controls.delete(job.id);await this.persist();this.changed();}
    }}finally{this.working=false;this.changed();}
  }
  async cancel(id){
    const job=this.jobs.find(j=>j.id===id);if(!job)throw new c.UserError('작업을 찾지 못했습니다.');
    this.controls.get(id)?.abort();
    if(job.status==='queued'){job.status='cancelled';job.stage='취소됨';this.secrets.delete(id);this.controls.delete(id);await this.persist();}
    this.changed();return {ok:true};
  }
  async resetAuth(){
    this.authEpoch++;this.auth={mode:'none'};if(this.inspectAuth)this.inspectController?.abort();
    for(const [id,auth] of [...this.secrets])if(auth.mode!=='none')await this.cancel(id);
    this.changed();return {ok:true};
  }
  async retry(data){const j=this.jobs.find(x=>x.id===data.id);if(!j||!['failed','cancelled'].includes(j.status))throw new c.UserError('다시 시도할 작업이 없습니다.');return this.enqueue({...j,urls:j.url,auth:data.auth??this.auth});}
  async clearHistory(){this.jobs=this.jobs.filter(j=>!TERMINAL.has(j.status));await this.persist();this.changed();return {ok:true};}
  folder(id){if(!id)return this.settings.folder;const j=this.jobs.find(x=>x.id===id);if(!j)throw new c.UserError('작업을 찾지 못했습니다.');return j.folder;}
  async close(){
    this.closed=true;this.auth={mode:'none'};this.inspectController?.abort();this.tools.controller?.abort();
    for(const control of this.controls.values())control.abort();
    for(const j of this.jobs)if(j.status==='queued'){j.status='cancelled';j.stage='앱 종료로 취소됨';}
    this.secrets.clear();
    const start=Date.now();while((this.working||this.inspectController||this.tools.busy)&&Date.now()-start<8000)await new Promise(r=>setTimeout(r,70));
    await this.persist();await fs.rm(path.join(this.dataDir,'private-auth'),{recursive:true,force:true}).catch(()=>{});
  }
}
module.exports={Engine,Service,HISTORY_KEYS};
