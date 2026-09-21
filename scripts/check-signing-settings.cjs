'use strict';
// Presence-only check: never prints secret values, certificates, or passwords.
const fs=require('node:fs');
const groups={mac:['MAC_CERTIFICATE_BASE64','MAC_CERTIFICATE_PASSWORD','MAC_SIGN_IDENTITY','APPLE_ID','APPLE_APP_SPECIFIC_PASSWORD','APPLE_TEAM_ID'],windows:['WINDOWS_CERTIFICATE_BASE64','WINDOWS_CERTIFICATE_PASSWORD']};
const result={};
for(const [platform,names] of Object.entries(groups)){
  const missing=names.filter(name=>!process.env[name]);
  result[platform]={configured:missing.length===0,missing};
}
const config=JSON.parse(fs.readFileSync('release/config.json','utf8'));
result.windows.publisherConfigured=typeof config.windowsPublisherName==='string'&&!!config.windowsPublisherName.trim();
if(!result.windows.publisherConfigured)result.windows.configured=false;
console.log(JSON.stringify(result,null,2));
if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,'## Signing readiness (presence only)\n\n```json\n'+JSON.stringify(result,null,2)+'\n```\n\nPresence does not prove a certificate is valid. No signing or release was performed.\n');
if(!result.mac.configured||!result.windows.configured)process.exitCode=1;
