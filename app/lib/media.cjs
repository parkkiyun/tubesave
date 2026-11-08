'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {UserError}=require('./core.cjs');

// Imageio's FFmpeg bundle does not include ffprobe. Probe a tiny audio sample
// without writing a file, and require a successful mapped audio stream.
async function audioCodec(ffmpeg,file,{runner,signal}){
  let codec=null;
  const result=await runner(ffmpeg,['-hide_banner','-nostdin','-i',file,'-map','0:a:0','-t','0.1','-c','copy','-f','null','-'],{
    signal,timeout:60000,onLine:line=>{
      const match=line.match(/^\s*Stream #\d+:\d+(?:\[[^\]]+\])?(?:\([^)]+\))?: Audio:\s*([\w-]+)/i);
      if(match&&!codec)codec=match[1].toLowerCase();
    }
  });
  if(result!==0||!codec)throw new UserError('완성된 파일의 음성 트랙을 확인하지 못했습니다. 파일을 저장 완료로 처리하지 않았습니다. 설정에서 다운로드 엔진을 업데이트한 후 다시 시도해 주세요.');
  return codec;
}

async function ensureAudio(ffmpeg,file,{runner,signal,mode,onStage=()=>{}}){
  const codec=await audioCodec(ffmpeg,file,{runner,signal});
  if(mode!=='mp4'||codec==='aac')return file;

  onStage();
  // MP4 with Opus/Vorbis/etc. can play silently on common players. Copy video
  // losslessly and encode only the primary audio stream to broadly supported AAC.
  const temp=path.join(path.dirname(file),'.tubesave-aac-'+crypto.randomUUID()+'.mp4');
  try {
    const code=await runner(ffmpeg,['-hide_banner','-nostdin','-n','-i',file,'-map','0:v:0','-map','0:a:0','-c:v','copy','-c:a','aac','-b:a','192k','-disposition:a:0','default','-movflags','+faststart',temp],{signal,onLine:()=>{}});
    if(code!==0)throw new UserError('MP4 음성을 AAC로 변환하지 못했습니다. 엔진 업데이트 후 다시 시도해 주세요.');
    if(await audioCodec(ffmpeg,temp,{runner,signal})!=='aac')throw new UserError('변환한 파일의 AAC 음성을 확인하지 못했습니다.');

    // Keep the video's original title-based filename; do not risk overwriting
    // the downloaded original until the converted file has been verified.
    const backup=file+'.original-'+crypto.randomUUID();
    await fs.rename(file,backup);
    try {await fs.rename(temp,file);}
    catch(error){await fs.rename(backup,file);throw error;}
    await fs.rm(backup,{force:true}).catch(()=>{});
    return file;
  }finally{await fs.rm(temp,{force:true}).catch(()=>{});}
}
module.exports={audioCodec,ensureAudio};
