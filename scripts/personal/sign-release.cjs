'use strict';
// This runs only after successful builds. The private key arrives via a protected
// Actions environment secret, never by command-line argument or repository file.
const fs=require('node:fs/promises'),path=require('node:path');
const trust=require('../../app/lib/personal-trust.cjs');
async function signRelease(dir,config,privateKey){
  if(!privateKey||trust.rawPublicKey(privateKey)!==config.publicKey)throw Error('Signing key does not match the pinned public key.');
  const version=require('../../app/package.json').version;
  const files=[];
  for(const [platform,arch]of [['darwin','arm64'],['darwin','x64'],['win32','x64']])files.push(await trust.describeArchive(path.join(dir,trust.fileName(version,platform,arch)),version,platform,arch,privateKey));
  const notes=await fs.readFile(path.resolve('release/personal-notes.md'),'utf8');
  const manifest={format:1,appId:trust.APP_ID,repository:trust.REPO,version,issuedAt:new Date().toISOString(),notes,files};
  await fs.writeFile(path.join(dir,'personal-update.json'),trust.envelope(manifest,privateKey));
  for(const f of files.filter(f=>f.platform==='darwin'))await fs.writeFile(path.join(dir,`appcast-${f.arch}.xml`),trust.appcast(manifest,f));
  trust.verifyEnvelope(await fs.readFile(path.join(dir,'personal-update.json')),config.publicKey);
  console.log('Ed25519-signed manifest and three authenticated update archives verified.');
}
if(require.main===module)signRelease(path.resolve(process.argv[2]||'dist-personal'),require('../../release/personal.json'),process.env.TUBESAVE_UPDATE_PRIVATE_KEY).catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={signRelease};
