'use strict';
const path=require('node:path'),fs=require('node:fs/promises'),os=require('node:os'),assert=require('node:assert/strict');
const {Tools}=require('../../app/lib/tools.cjs'),{runProcess}=require('../../app/lib/process.cjs');
async function main(){
 const output=path.resolve('dist-personal');
 const resources=process.platform==='darwin'?path.join(output,process.arch==='arm64'?'mac-arm64':'mac','TubeSave Personal.app','Contents/Resources'):path.join(output,'win-unpacked/resources');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'personal-package-'));
 try{
  const c=JSON.parse(await fs.readFile(path.join(resources,'distribution.json'),'utf8'));
  assert(require('../../app/lib/personal-updater.cjs').configValid(c));
  assert.equal(c.appId,require('../../app/lib/personal-trust.cjs').APP_ID);
  const {extractFile,listPackage}=require('@electron/asar');const asar=path.join(resources,'app.asar');
  const pkg=JSON.parse(extractFile(asar,'package.json').toString('utf8'));
  assert.equal(pkg.main,'personal-main.cjs');assert.equal(pkg.version,require('../../app/package.json').version);
  assert(!listPackage(asar).some(p=>p.endsWith('personal-test-main.cjs')));
  const tools=new Tools(path.join(dir,'engines'),{bundledRoot:path.join(resources,'engines')});await tools.init();assert(tools.health.ready);
  assert.equal(await runProcess(tools.ytdlp,['--version'],{timeout:30000}),0);
  const audio=path.join(dir,'test.mp3');assert.equal(await runProcess(tools.ffmpeg,['-hide_banner','-loglevel','error','-f','lavfi','-i','sine=frequency=440:duration=0.2','-c:a','libmp3lame',audio],{timeout:30000}),0);assert((await fs.stat(audio)).size>0);
  if(process.platform==='darwin')await fs.access(path.join(resources,'sparkle/bin/sparkle'));
  console.log('PERSONAL_PACKAGE_OK',process.platform,process.arch,pkg.version);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
