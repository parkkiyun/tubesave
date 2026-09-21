'use strict';
// Read-only completeness audit. Never creates missing application code.
const fs=require('node:fs');
const required=[
  'app/main.cjs','app/preload.cjs','app/package.json',
  'app/lib/core.cjs','app/lib/process.cjs','app/lib/service.cjs','app/lib/tools.cjs','app/lib/updates.cjs',
  'app/ui/index.html','app/ui/app.js','app/ui/style.css',
  'app/tubesave.png','app/tubesave.ico','app/tubesave.icns',
  'build/release-config.cjs','build/after-sign.cjs','build/entitlements.mac.plist',
  'scripts/build-release.cjs','scripts/preflight-release.cjs','scripts/prepare-engines.cjs','scripts/refresh-engine-digests.cjs','scripts/setup-mac-signing.sh',
  'install_mac.command','install_windows.bat','install/install_windows.ps1','install/electron-version.txt',
  'tests/core.test.cjs','tests/process.test.cjs','tests/service.test.cjs','tests/tools.test.cjs','tests/bundled.test.cjs','tests/updates.test.cjs','tests/release.test.cjs',
  'LICENSE','app/LICENSE','THIRD_PARTY_NOTICES.md','app/THIRD_PARTY_NOTICES.md',
  'release/config.json','release/notes.md','package.json','.github/workflows/release.yml'
];
function audit(){return required.filter(p=>{try{return !fs.statSync(p).isFile()||fs.statSync(p).size===0;}catch{return true;}});}
if(require.main===module){
  const missing=audit();
  console.log(JSON.stringify({checked:required.length,missing,complete:missing.length===0},null,2));
  if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,'## Source completeness\n\n'+(missing.length?'Not ready. Missing required files:\n'+missing.map(p=>'- `'+p+'`').join('\n'):'All required files present. This is not an installation or update test.')+'\n');
  process.exitCode=missing.length?1:0;
}
module.exports={required,audit};
