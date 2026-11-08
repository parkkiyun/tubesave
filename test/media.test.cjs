'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {audioCodec,ensureAudio}=require('../app/lib/media.cjs');

async function sample(t){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'tubesave-audio-test-'));
  t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const file=path.join(dir,'sample [abcdefghijk].mp4');
  await fs.writeFile(file,'original-media');
  return file;
}
function runnerFor(inputCodec,{noAudio=false,convertError=false}={}){
  const calls=[];
  const runner=async (_exe,args,{onLine})=>{
    calls.push(args);
    if(args.includes('null')){
      if(noAudio)return 1;
      const source=args[args.indexOf('-i')+1];
      const codec=path.basename(source).startsWith('.tubesave-aac-')?'aac':inputCodec;
      onLine('    Stream #0:1[0x2](und): Audio: '+codec+' (LC), 44100 Hz, stereo');
      return 0;
    }
    if(convertError)return 1;
    await fs.writeFile(args.at(-1),'compatible-media');
    return 0;
  };
  return {runner,calls};
}
test('MP4 with AAC audio is verified and left unchanged',async t=>{
  const file=await sample(t),fake=runnerFor('aac');
  const result=await ensureAudio('ffmpeg',file,{runner:fake.runner,mode:'mp4'});
  assert.equal(result,file);
  assert.equal((await fs.readFile(file)).toString(),'original-media');
  assert.equal(fake.calls.length,1);
});
test('MP4 with Opus audio is converted to AAC without changing its filename',async t=>{
  const file=await sample(t),fake=runnerFor('opus');let stages=0;
  const result=await ensureAudio('ffmpeg',file,{runner:fake.runner,mode:'mp4',onStage:()=>stages++});
  assert.equal(result,file);
  assert.equal(stages,1);
  assert.equal((await fs.readFile(file)).toString(),'compatible-media');
  assert.equal(fake.calls.length,3);
  assert.ok(fake.calls[1].includes('copy'));
  assert.ok(fake.calls[1].includes('aac'));
});
test('file with no audio is rejected, not published as success',async t=>{
  const file=await sample(t),fake=runnerFor('opus',{noAudio:true});
  await assert.rejects(()=>ensureAudio('ffmpeg',file,{runner:fake.runner,mode:'mp4'}),/음성 트랙/);
  assert.equal((await fs.readFile(file)).toString(),'original-media');
});
test('failed AAC conversion leaves original download intact',async t=>{
  const file=await sample(t),fake=runnerFor('opus',{convertError:true});
  await assert.rejects(()=>ensureAudio('ffmpeg',file,{runner:fake.runner,mode:'mp4'}),/AAC/);
  assert.equal((await fs.readFile(file)).toString(),'original-media');
});
test('MKV with Opus is allowed after checking its audio track',async t=>{
  const file=await sample(t),fake=runnerFor('opus');
  assert.equal(await ensureAudio('ffmpeg',file,{runner:fake.runner,mode:'mkv'}),file);
  assert.equal(fake.calls.length,1);
});
test('audio probe recognizes normal FFmpeg audio stream description',async()=>{
  const fake=runnerFor('mp3');
  assert.equal(await audioCodec('ffmpeg','example.mp3',{runner:fake.runner}), 'mp3');
});
