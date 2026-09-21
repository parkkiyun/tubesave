'use strict';
const {spawn}=require('node:child_process');
const {StringDecoder}=require('node:string_decoder');
const path=require('node:path');
const {Cancelled,UserError}=require('./core.cjs');
function childEnv() {
  const env={...process.env,PYTHONUTF8:'1',PYTHONIOENCODING:'utf-8',ELECTRON_RUN_AS_NODE:'1',ELECTRON_NO_ATTACH_CONSOLE:'1'};
  for(const k of ['NODE_OPTIONS','NODE_PATH','PYTHONPATH','PYTHONHOME','ELECTRON_ENABLE_LOGGING','ELECTRON_LOG_FILE'])delete env[k];
  return env;
}
function runProcess(exe,args,{signal,onLine=()=>{},timeout=0,maxLine=8*1024*1024,env=childEnv()}={}) {
  if(signal?.aborted)return Promise.reject(new Cancelled());
  return new Promise((resolve,reject)=>{
    let processError=null,timedOut=false,killTimer=null,done=false;
    const proc=spawn(exe,args,{shell:false,windowsHide:true,detached:process.platform!=='win32',stdio:['ignore','pipe','pipe'],env});
    const stop=()=>{
      if(done)return;
      try {
        if(process.platform==='win32') {
          const systemRoot=process.env.SystemRoot||'C:\\Windows';
          const killer=spawn(path.join(systemRoot,'System32','taskkill.exe'),['/PID',String(proc.pid),'/T','/F'],{windowsHide:true,stdio:'ignore',shell:false});
          killer.on('error',()=>{try{proc.kill();}catch{}});
        }else if(proc.pid)process.kill(-proc.pid,'SIGTERM');
      }catch{try{proc.kill();}catch{}}
      if(!killTimer)killTimer=setTimeout(()=>{try{process.platform==='win32'?proc.kill():process.kill(-proc.pid,'SIGKILL');}catch{}},1800);
    };
    signal?.addEventListener('abort',stop,{once:true});
    const timer=timeout?setTimeout(()=>{timedOut=true;stop();},timeout):null;
    for(const stream of [proc.stdout,proc.stderr]) {
      const decoder=new StringDecoder('utf8');let pending='';
      const emit=line=>{if(processError)return;try{onLine(line);}catch(e){processError=e;stop();}};
      stream.on('data',chunk=>{
        pending+=decoder.write(chunk);
        let pos;while((pos=pending.indexOf('\n'))>=0){emit(pending.slice(0,pos).replace(/\r$/,''));pending=pending.slice(pos+1);}
        if(pending.length>maxLine){processError=new UserError('엔진 응답이 허용 길이를 초과했습니다.');stop();}
      });
      stream.on('end',()=>{pending+=decoder.end();if(pending)emit(pending);});
    }
    proc.on('error',e=>{processError=e;});
    proc.on('close',code=>{
      done=true;clearTimeout(timer);clearTimeout(killTimer);signal?.removeEventListener('abort',stop);
      if(signal?.aborted)return reject(new Cancelled());
      if(timedOut)return reject(new UserError('요청 시간이 초과되었습니다. 인터넷·로그인 상태를 확인하세요.'));
      if(processError)return reject(processError);
      resolve(code);
    });
    if(signal?.aborted)stop();
  });
}
module.exports={runProcess,childEnv};
