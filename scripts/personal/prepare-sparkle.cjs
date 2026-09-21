'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const network=require('../../app/lib/personal-network.cjs');
const VERSION='2.10.0';
const URL=`https://github.com/sparkle-project/Sparkle/releases/download/${VERSION}/Sparkle-${VERSION}.tar.xz`;
const SHA256='c2bf58aa8387266ac179357b1415d6f2635f044da8be41042af32425dae6da0c';
async function prepare(){
  if(process.platform!=='darwin')throw Error('Sparkle is prepared on macOS only.');
  const dir=path.resolve('.vendor/sparkle-'+VERSION);
  try{await fs.access(path.join(dir,'bin','sparkle'));return dir;}catch{}
  await fs.mkdir(path.resolve('.vendor'),{recursive:true});
  const archive=path.resolve('.vendor/Sparkle-'+VERSION+'.tar.xz');
  await fs.rm(archive,{force:true});
  await network.download(URL,archive,{size:16319840});
  if(crypto.createHash('sha256').update(await fs.readFile(archive)).digest('hex')!==SHA256)throw Error('Sparkle SDK hash mismatch.');
  await fs.mkdir(dir,{recursive:true});execFileSync('/usr/bin/tar',['-xf',archive,'-C',dir]);
  await fs.access(path.join(dir,'bin','sparkle'));await fs.access(path.join(dir,'Sparkle.framework'));
  return dir;
}
if(require.main===module)prepare().then(p=>console.log(p)).catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={prepare,VERSION,SHA256};
