'use strict';
const path=require('node:path'),fs=require('node:fs/promises'),os=require('node:os'),assert=require('node:assert/strict');
const {Tools}=require('../app/lib/tools.cjs');
const {runProcess}=require('../app/lib/process.cjs');
async function main(){
  const output=path.resolve('dist-preview');
  const resources=process.platform==='darwin'?path.join(output,process.arch==='arm64'?'mac-arm64':'mac','TubeSave Preview.app','Contents','Resources'):path.join(output,'win-unpacked','resources');
  const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'tubesave-bundle-test-'));
  try{
    await fs.access(path.join(resources,'app.asar'));
    const distribution=JSON.parse(await fs.readFile(path.join(resources,'distribution.json'),'utf8'));
    assert.equal(distribution.format,'preview');assert.equal(distribution.enabled,false);
    const tools=new Tools(path.join(tmp,'local-engines'),{bundledRoot:path.join(resources,'engines')});
    await tools.init();assert.equal(tools.health.ready,true,'Packaged engines must pass their integrity manifest');assert.equal(tools.health.source,'bundled');
    assert.equal(await runProcess(tools.ytdlp,['--version'],{timeout:30000}),0);
    const audio=path.join(tmp,'verification.mp3');
    assert.equal(await runProcess(tools.ffmpeg,['-hide_banner','-loglevel','error','-f','lavfi','-i','sine=frequency=440:duration=0.2','-c:a','libmp3lame',audio],{timeout:30000}),0);
    assert((await fs.stat(audio)).size>0,'Real MP3 output');
    const report={platform:process.platform,arch:process.arch,asar:true,engineIntegrity:true,engineExecution:true,mp3Conversion:true,productionUpdates:false};
    await fs.mkdir('ci-results',{recursive:true});await fs.writeFile('ci-results/packaged-engines.json',JSON.stringify(report,null,2));console.log('PACKAGED_ENGINES_OK',JSON.stringify(report));
  }finally{await fs.rm(tmp,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
