#!/usr/bin/env node
'use strict';
// Build verified native engines; no user media. CI authentication is confined to
// the one GitHub metadata endpoint and is never forwarded to downloads or binaries.
const path=require('node:path');
const fs=require('node:fs/promises');
const {Tools,getJson}=require('../app/lib/tools.cjs');
const ciToken=process.env.GITHUB_ACTIONS==='true'?process.env.TUBESAVE_BUILD_GITHUB_TOKEN:null;
delete process.env.TUBESAVE_BUILD_GITHUB_TOKEN;
async function metadata(url,signal){
  if(!ciToken||url!=='https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest')return getJson(url,signal);
  const response=await fetch(url,{headers:{'User-Agent':'TubeSave-CI','Accept':'application/vnd.github+json','Authorization':'Bearer '+ciToken},redirect:'error',signal:AbortSignal.any([signal,AbortSignal.timeout(45000)])});
  if(!response.ok)throw Error('GitHub build metadata response '+response.status);
  const bytes=await response.arrayBuffer();if(bytes.byteLength>8*1024*1024)throw Error('Build metadata too large');
  return JSON.parse(Buffer.from(bytes).toString('utf8'));
}
async function main(){
  const target=process.argv[2];
  if(!target||!path.isAbsolute(target))throw Error('An absolute engine destination is required.');
  if(!['darwin','win32'].includes(process.platform))throw Error('Build engines on their target Mac/Windows OS.');
  if(process.platform==='win32'&&process.arch!=='x64')throw Error('Windows x64 is supported.');
  if(Number(process.versions.node.split('.')[0])<22)throw Error('Node 22+ is required by the download engine.');
  let last='';
  const tools=new Tools(target,{io:{getJson:metadata},onChange:()=>{if(tools.status!==last){last=tools.status;console.log(last);}}});
  process.once('SIGINT',()=>tools.controller?.abort());
  await tools.install();
  if(!tools.health.ready)throw Error('Engine verification failed.');
  await fs.writeFile(path.join(target,'bundle.json'),JSON.stringify({version:require('../app/package.json').version,platform:process.platform,arch:process.arch,prepared:new Date().toISOString()},null,2));
  console.log('Download engines are bundled and verified. No extra engine-install step is needed.');
}
main().catch(e=>{console.error('Engine setup failed:',e.message);process.exitCode=1;});
