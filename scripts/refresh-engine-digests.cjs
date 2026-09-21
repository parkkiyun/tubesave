'use strict';
// Build-time only. Signing may change Mach-O/PE bytes after upstream checksums
// were verified. Recompute the installed-binary manifest BEFORE sealing the app.
const fs=require('node:fs/promises'),fss=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
async function refresh(root){
  if(!path.isAbsolute(root))throw Error('An absolute engine path is required.');
  const manifestFile=path.join(root,'current.json');
  const m=JSON.parse(await fs.readFile(manifestFile,'utf8'));
  if(!/^runtime-[a-zA-Z0-9-]+$/.test(m.folder))throw Error('Invalid runtime folder.');
  for(const [key,name]of [['yt_dlp',m.platform==='win32'?'yt-dlp.exe':'yt-dlp'],['ffmpeg',m.platform==='win32'?'ffmpeg.exe':'ffmpeg']]){
    const file=path.join(root,m.folder,name),st=await fs.lstat(file);
    if(!st.isFile()||!st.size||st.isSymbolicLink()||!(await fs.realpath(file)).startsWith((await fs.realpath(root))+path.sep))throw Error('Invalid engine binary.');
    const hash=crypto.createHash('sha256');for await(const chunk of fss.createReadStream(file))hash.update(chunk);
    m.sha256[key]=hash.digest('hex');
  }
  await fs.writeFile(manifestFile+'.tmp',JSON.stringify(m,null,2),{mode:0o600});await fs.rename(manifestFile+'.tmp',manifestFile);
  return m;
}
if(require.main===module)refresh(process.argv[2]||'').catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={refresh};
