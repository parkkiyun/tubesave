'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),{execFile}=require('node:child_process'),{promisify}=require('node:util');
const exec=promisify(execFile),{refresh}=require('../scripts/refresh-engine-digests.cjs');
module.exports=async context=>{
  const mac=context.electronPlatformName==='darwin';
  const appPath=mac?path.join(context.appOutDir,'TubeSave.app'):context.appOutDir;
  const root=path.join(appPath,mac?'Contents/Resources/engines':'resources/engines');
  if(!mac){await refresh(root);return;}
  const identity=process.env.CSC_NAME,keychain=process.env.CSC_KEYCHAIN;
  if(!identity||!keychain)throw Error('CSC_NAME and CSC_KEYCHAIN are required for the final Mac seal.');
  const m=JSON.parse(await fs.readFile(path.join(root,'current.json'),'utf8'));
  if(!/^runtime-[a-zA-Z0-9-]+$/.test(m.folder))throw Error('Invalid engine manifest.');
  // Sign helper executables explicitly, then refresh their installed-byte
  // checksums and seal only the outer app. A second deep sign would invalidate
  // the newly computed helper digests. Upstream checksums remain in SOURCES.json.
  const opts=['--force','--sign',identity,'--keychain',keychain,'--options','runtime','--timestamp','--entitlements',path.resolve('build/entitlements.mac.plist')];
  for(const name of ['yt-dlp','ffmpeg'])await exec('/usr/bin/codesign',[...opts,path.join(root,m.folder,name)]);
  await refresh(root);
  await exec('/usr/bin/codesign',[...opts,appPath]);
  await exec('/usr/bin/codesign',['--verify','--deep','--strict',appPath]);
  // The credential profile is prepared in the CI keychain; no Apple password
  // is embedded in the app, feed, command output, or release artifacts.
  const zip=path.join(context.appOutDir,'notary-upload.zip');
  try{
    await exec('/usr/bin/ditto',['-c','-k','--keepParent',appPath,zip]);
    const r=await exec('/usr/bin/xcrun',['notarytool','submit',zip,'--keychain-profile','TubeSave-notary','--keychain',keychain,'--wait','--output-format','json'],{timeout:1800000,maxBuffer:2*1024*1024});
    if(JSON.parse(r.stdout).status!=='Accepted')throw Error('Apple notarization did not accept the application.');
    await exec('/usr/bin/xcrun',['stapler','staple',appPath]);
    await exec('/usr/bin/xcrun',['stapler','validate',appPath]);
    await exec('/usr/sbin/spctl',['--assess','--type','execute',appPath]);
  }catch(e){throw Error('Mac signing/notarization failed. No release was published. Inspect local signing/notary logs.');}
  finally{await fs.rm(zip,{force:true});}
};
