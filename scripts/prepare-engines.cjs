#!/usr/bin/env node
'use strict';
// Executed by the verified Electron Node runtime during bootstrap installation,
// or by Node on the target OS during release builds. Never downloads user media.
const path=require('node:path');
const fs=require('node:fs/promises');
const {Tools}=require('../app/lib/tools.cjs');
async function main(){
  const target=process.argv[2];
  if(!target||!path.isAbsolute(target))throw Error('An absolute engine destination is required.');
  if(!['darwin','win32'].includes(process.platform))throw Error('Build engines on their target Mac/Windows OS.');
  if(process.platform==='win32'&&process.arch!=='x64')throw Error('Windows x64 is supported.');
  if(Number(process.versions.node.split('.')[0])<22)throw Error('Node 22+ is required by the download engine.');
  let last='';
  const tools=new Tools(target,{onChange:()=>{if(tools.status!==last){last=tools.status;console.log(last);}}});
  process.once('SIGINT',()=>tools.controller?.abort());
  await tools.install();
  if(!tools.health.ready)throw Error('Engine verification failed.');
  await fs.writeFile(path.join(target,'bundle.json'),JSON.stringify({version:require('../app/package.json').version,platform:process.platform,arch:process.arch,prepared:new Date().toISOString()},null,2));
  console.log('Download engines are bundled and verified. No extra engine-install step is needed.');
}
main().catch(e=>{console.error('Engine setup failed:',e.message);process.exitCode=1;});
