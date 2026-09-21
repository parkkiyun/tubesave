'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),{execFileSync}=require('node:child_process');
const {preflight}=require('./preflight-release.cjs');
async function main(){
  const {release,config}=preflight();
  const root=path.resolve('resources/engines');
  // Refuse symlinked output paths before cleaning our generated directory.
  try{if((await fs.lstat(root)).isSymbolicLink())throw Error('Engine output may not be a symlink.');}catch(e){if(e.code!=='ENOENT')throw e;}
  await fs.rm(root,{recursive:true,force:true});
  execFileSync(process.execPath,[path.resolve('scripts/prepare-engines.cjs'),root],{stdio:'inherit'});
  await fs.mkdir('resources',{recursive:true});
  await fs.writeFile('resources/distribution.json',JSON.stringify({format:'electron-builder',enabled:true,provider:'github',owner:release.owner,repo:release.repo,channel:'latest-'+process.arch},null,2));
  const {build,Platform,Arch}=require('electron-builder');
  const platform=process.platform==='darwin'?Platform.MAC:Platform.WINDOWS;
  await build({config,targets:platform.createTarget(process.platform==='darwin'?['dmg','zip']:['nsis'],Arch[process.arch]),publish:'never'});
  console.log('Signed artifacts generated in dist/. Nothing has been publicly published.');
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
