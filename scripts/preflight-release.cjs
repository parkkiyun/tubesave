'use strict';
const fs=require('node:fs'),path=require('node:path');
const {createBuildConfig}=require('../build/release-config.cjs');
function preflight({platform=process.platform,arch=process.arch,env=process.env}={}){
  const release=JSON.parse(fs.readFileSync(path.resolve('release/config.json'),'utf8'));
  const config=createBuildConfig({platform,arch,release});
  for(const lock of ['package-lock.json','app/package-lock.json'])if(!fs.existsSync(lock))throw Error('Generate, review and commit both npm lockfiles first (see docs/RELEASE.md).');
  if(env.GITHUB_REPOSITORY&&env.GITHUB_REPOSITORY!==release.owner+'/'+release.repo)throw Error('This workflow must run in the configured release repository.');
  const root=require('../package.json'),app=require('../app/package.json');
  if(root.version!==app.version||!/^[0-9]+\.[0-9]+\.[0-9]+$/.test(app.version))throw Error('Use the same stable version in both package.json files.');
  const keys=platform==='darwin'?['CSC_NAME','CSC_KEYCHAIN']:['CSC_LINK','CSC_KEY_PASSWORD'];
  for(const key of keys)if(!env[key])throw Error('Missing release signing setting: '+key);
  return{release,config};
}
if(require.main===module){try{preflight();console.log('Release preflight passed.');}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={preflight};
