'use strict';
// Authenticates both release metadata and update archives with a pinned Ed25519 key.
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const {createReadStream} = require('node:fs');
const MAX_FILE = 1024 * 1024 * 1024;
const MAX_ENVELOPE = 65536;
const APP_ID = 'local.tubesave.personal';
const TEST_APP_ID = 'local.tubesave.personal.test';
const REPO = 'parkkiyun/tubesave';
function strictBase64(value, size) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) throw Error('Invalid base64.');
  const b = Buffer.from(value, 'base64');
  if (b.toString('base64') !== value || (size !== undefined && b.length !== size)) throw Error('Invalid base64 size.');
  return b;
}
function keyObject(raw) {
  const bytes = strictBase64(raw, 32);
  return crypto.createPublicKey({key: Buffer.concat([Buffer.from('302a300506032b6570032100','hex'), bytes]), format:'der', type:'spki'});
}
function rawPublicKey(privateKey) {
  const k = crypto.createPublicKey(privateKey);
  if (k.asymmetricKeyType !== 'ed25519') throw Error('Ed25519 key required.');
  return k.export({format:'der',type:'spki'}).subarray(-32).toString('base64');
}
function compare(a,b) {
  function parts(v) {
    if (typeof v !== 'string' || !/^(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})$/.test(v)) throw Error('Stable numeric version required.');
    return v.split('.').map(Number);
  }
  const x=parts(a),y=parts(b); for(let i=0;i<3;i++)if(x[i]!==y[i])return x[i]>y[i]?1:-1; return 0;
}
function fileName(version, platform, arch) {
  compare(version, version);
  if(platform==='darwin'&&['arm64','x64'].includes(arch))return `TubeSave-Personal-${version}-mac-${arch}.zip`;
  if(platform==='win32'&&arch==='x64')return `TubeSave-Personal-Setup-${version}-x64.exe`;
  throw Error('Unsupported update target.');
}
function fileURL(version, platform, arch) {
  return `https://github.com/${REPO}/releases/download/personal-v${version}/${fileName(version,platform,arch)}`;
}
function validateManifest(m, {appId=APP_ID}={}) {
  if(!m || m.format!==1 || m.appId!==appId || ![APP_ID,TEST_APP_ID].includes(appId) || m.repository!==REPO)throw Error('Wrong application or repository.');
  compare(m.version,m.version);
  if(typeof m.notes!=='string'||m.notes.length>12000||typeof m.issuedAt!=='string'||!Number.isFinite(Date.parse(m.issuedAt)))throw Error('Invalid release metadata.');
  if(!Array.isArray(m.files)||m.files.length<1||m.files.length>3)throw Error('Invalid release files.');
  const seen=new Set();
  for(const f of m.files) {
    const target=`${f.platform}-${f.arch}`;
    if(seen.has(target))throw Error('Duplicate target.'); seen.add(target);
    if(f.name!==fileName(m.version,f.platform,f.arch)||f.url!==fileURL(m.version,f.platform,f.arch))throw Error('Unexpected update URL or filename.');
    if(!Number.isSafeInteger(f.size)||f.size<1||f.size>MAX_FILE)throw Error('Invalid file size.');
    strictBase64(f.sha512,64); strictBase64(f.signature,64);
  }
  return m;
}
function envelope(manifest, privateKey) {
  validateManifest(manifest,{appId:manifest.appId});
  const bytes=Buffer.from(JSON.stringify(manifest));
  const encoded=JSON.stringify({payload:bytes.toString('base64'),signature:crypto.sign(null,bytes,privateKey).toString('base64')});
  if(Buffer.byteLength(encoded)>MAX_ENVELOPE)throw Error('Manifest too large.');
  return encoded;
}
function verifyEnvelope(value, publicKey, options={}) {
  const bytes=Buffer.isBuffer(value)?value:Buffer.from(value);
  if(bytes.length>MAX_ENVELOPE)throw Error('Manifest too large.');
  const e=JSON.parse(bytes.toString('utf8'));
  if(Object.keys(e).sort().join(',')!=='payload,signature')throw Error('Invalid envelope.');
  const payload=strictBase64(e.payload),sig=strictBase64(e.signature,64);
  if(!crypto.verify(null,payload,keyObject(publicKey),sig))throw Error('Release signature verification failed.');
  // Do not interpret an unsigned version, notes or URL.
  return validateManifest(JSON.parse(payload.toString('utf8')),options);
}
async function digest(file) {
  const h=crypto.createHash('sha512'); for await(const bytes of createReadStream(file))h.update(bytes); return h.digest('base64');
}
async function verifyArchive(file, info, publicKey) {
  const stat=await fs.lstat(file);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size!==info.size||stat.size>MAX_FILE)throw Error('Update archive size/type mismatch.');
  if(await digest(file)!==info.sha512)throw Error('Update archive checksum mismatch.');
  const bytes=await fs.readFile(file);
  if(!crypto.verify(null,bytes,keyObject(publicKey),strictBase64(info.signature,64)))throw Error('Update archive signature mismatch.');
  return true;
}
async function describeArchive(file, version, platform, arch, privateKey) {
  const stat=await fs.lstat(file);
  if(!stat.isFile()||stat.size<1||stat.size>MAX_FILE)throw Error('Invalid update archive.');
  const info={platform,arch,name:fileName(version,platform,arch),url:fileURL(version,platform,arch),size:stat.size,sha512:await digest(file),signature:crypto.sign(null,await fs.readFile(file),privateKey).toString('base64')};
  await verifyArchive(file,info,rawPublicKey(privateKey)); return info;
}
function xml(s) {return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));}
function appcast(manifest, archive, url=archive.url) {
  return `<?xml version="1.0" encoding="utf-8"?>\n<rss version="2.0" xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle"><channel><title>TubeSave Personal</title><item><title>TubeSave ${xml(manifest.version)}</title><sparkle:version>${xml(manifest.version)}</sparkle:version><sparkle:shortVersionString>${xml(manifest.version)}</sparkle:shortVersionString><sparkle:minimumSystemVersion>12.0</sparkle:minimumSystemVersion><enclosure url="${xml(url)}" length="${archive.size}" type="application/octet-stream" sparkle:edSignature="${xml(archive.signature)}"/></item></channel></rss>\n`;
}
module.exports={APP_ID,TEST_APP_ID,REPO,MAX_FILE,MAX_ENVELOPE,keyObject,rawPublicKey,compare,fileName,fileURL,validateManifest,envelope,verifyEnvelope,digest,verifyArchive,describeArchive,appcast};
