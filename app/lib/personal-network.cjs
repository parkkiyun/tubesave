'use strict';
const https=require('node:https'),http=require('node:http');
const fs=require('node:fs/promises'),{createWriteStream}=require('node:fs');
const {pipeline}=require('node:stream/promises');
const {Transform}=require('node:stream');
const CDN=new Set(['github.com','release-assets.githubusercontent.com','objects.githubusercontent.com','github-releases.githubusercontent.com']);
function allowed(url,testOrigin){
  const u=new URL(url);
  if(u.username||u.password||u.hash)throw Error('Invalid update URL.');
  if(testOrigin&&u.origin===testOrigin&&u.hostname==='127.0.0.1'&&u.protocol==='http:')return u;
  if(u.protocol!=='https:'||(u.port&&u.port!=='443')||!CDN.has(u.hostname))throw Error('Unexpected update host.');return u;
}
function response(url,{testOrigin,redirects=0}={}){
  return new Promise((resolve,reject)=>{
    let u;try{u=allowed(url,testOrigin);}catch(e){reject(e);return;}
    const req=(u.protocol==='http:'?http:https).get(u,{headers:{'User-Agent':'TubeSave-Personal-Updater','Accept-Encoding':'identity'},timeout:30000},res=>{
      if([301,302,303,307,308].includes(res.statusCode)){
        res.resume();if(redirects>=5||!res.headers.location){reject(Error('Too many redirects.'));return;}
        response(new URL(res.headers.location,u).href,{testOrigin,redirects:redirects+1}).then(resolve,reject);return;
      }
      if(res.statusCode!==200){res.resume();const e=Error('Update server returned '+res.statusCode);e.code=res.statusCode===404?'NO_RELEASE':'HTTP_ERROR';reject(e);return;}
      res.setTimeout(30000,()=>res.destroy(Error('Update download timed out.')));resolve(res);
    });
    req.on('timeout',()=>req.destroy(Error('Update request timed out.')));req.on('error',reject);
  });
}
async function read(url,{limit=65536,testOrigin}={}){
  const res=await response(url,{testOrigin});let total=0;const chunks=[];
  for await(const b of res){total+=b.length;if(total>limit){res.destroy();throw Error('Response too large.');}chunks.push(b);}return Buffer.concat(chunks);
}
async function download(url,file,{size,onProgress=()=>{},testOrigin}={}){
  const res=await response(url,{testOrigin});let transferred=0;const start=Date.now();
  const length=res.headers['content-length'];if(length!==undefined&&Number(length)!==size){res.destroy();throw Error('Update length mismatch.');}
  const counter=new Transform({transform(chunk,_encoding,callback){transferred+=chunk.length;if(transferred>size)return callback(Error('Update exceeds signed size.'));onProgress({transferred,total:size,percent:transferred/size*100,bytesPerSecond:transferred*1000/Math.max(1,Date.now()-start)});callback(null,chunk);}});
  try{await pipeline(res,counter,createWriteStream(file,{flags:'wx',mode:0o600}));if(transferred!==size)throw Error('Incomplete update.');}
  catch(e){await fs.rm(file,{force:true});throw e;}
  return file;
}
module.exports={allowed,response,read,download};
