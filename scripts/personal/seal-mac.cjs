'use strict';
// Ad-hoc code signing is free and keeps the packaged Electron bundle internally
// valid for Sparkle. Ed25519 archive authentication remains mandatory.
const fs=require('node:fs/promises'),path=require('node:path'),{execFileSync}=require('node:child_process');
const {refresh}=require('../refresh-engine-digests.cjs');
module.exports=async context=>{
  if(context.electronPlatformName!=='darwin')return;
  const bundle=path.join(context.appOutDir,context.packager.appInfo.productFilename+'.app');
  const engines=path.join(bundle,'Contents/Resources/engines');
  try{await fs.access(path.join(engines,'current.json'));await refresh(engines);}catch(e){if(e.code!=='ENOENT')throw e;}
  // Re-seal only the outer bundle after updating installed-byte engine hashes.
  // Re-signing nested binaries now would invalidate those hashes again.
  execFileSync('/usr/bin/codesign',['--force','--sign','-','--timestamp=none','--preserve-metadata=entitlements,flags',bundle],{stdio:'inherit'});
  execFileSync('/usr/bin/codesign',['--verify','--deep','--strict',bundle],{stdio:'inherit'});
  console.log('PERSONAL_ADHOC_BUNDLE_VALID',bundle);
};
