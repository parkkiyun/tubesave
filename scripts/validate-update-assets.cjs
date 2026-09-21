'use strict';
// Check the exact files referenced by updater metadata before release creation.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
async function verifyFeed(data,root,version,extension){
  if(!data||data.version!==version||!Array.isArray(data.files)||!data.files.length)throw Error('Invalid update version or file list');
  let target=false;const seen=new Set();
  for(const item of data.files){
    if(typeof item.url!=='string'||!/^TubeSave-[A-Za-z0-9._-]+$/.test(item.url)||seen.has(item.url))throw Error('Invalid or duplicate update asset path');
    seen.add(item.url);const file=path.join(root,item.url),stat=await fs.lstat(file);
    if(!stat.isFile()||stat.isSymbolicLink()||stat.size<=0||(item.size!==undefined&&item.size!==stat.size))throw Error('Invalid update asset size/type');
    if(typeof item.sha512!=='string'||Buffer.from(item.sha512,'base64').length!==64)throw Error('Missing SHA-512');
    const actual=crypto.createHash('sha512').update(await fs.readFile(file)).digest('base64');
    if(item.sha512!==actual)throw Error('Update asset digest mismatch');
    if(item.url.endsWith(extension))target=true;
  }
  if(!target)throw Error('Required updater installer format is missing');
  return true;
}
async function main(){
  const root=path.resolve(process.argv[2]||'artifacts'),version=require('../app/package.json').version;
  const yaml=require('../app/node_modules/js-yaml');
  for(const [name,extension] of [['latest-arm64-mac.yml','.zip'],['latest-x64-mac.yml','.zip'],['latest-x64.yml','.exe']]){
    const data=yaml.load(await fs.readFile(path.join(root,name),'utf8'));
    await verifyFeed(data,root,version,extension);console.log('Verified update feed:',name);
  }
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={verifyFeed};
