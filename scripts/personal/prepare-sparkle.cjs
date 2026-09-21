'use strict';
// Sparkle >=2.9 no longer ships its CLI in the binary SDK. Build the official
// command-line app from an exact reviewed source commit, with our own identity.
const fs=require('node:fs/promises'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const VERSION='2.10.0';
const SOURCE_COMMIT='eef1a539a373c1f1a320624b1130fc5de7b2e100';
const CLI_PATH=path.join('sparkle.app','Contents','MacOS','sparkle');
async function prepare(){
  if(process.platform!=='darwin'||!['arm64','x64'].includes(process.arch))throw Error('Sparkle is prepared on a native supported macOS host only.');
  const dir=path.resolve('.vendor/sparkle-'+VERSION+'-'+process.arch);
  const marker=path.join(dir,'source.json');
  try{
    const c=JSON.parse(await fs.readFile(marker,'utf8'));
    if(c.commit===SOURCE_COMMIT&&c.arch===process.arch){await fs.access(path.join(dir,CLI_PATH));return dir;}
  }catch{}
  const vendor=path.resolve('.vendor');await fs.mkdir(vendor,{recursive:true});
  const source=await fs.mkdtemp(path.join(vendor,'sparkle-source-'));
  const derived=path.join(source,'derived');
  const run=(exe,args)=>execFileSync(exe,args,{cwd:source,stdio:'inherit',timeout:600000});
  run('/usr/bin/git',['init','--quiet']);
  run('/usr/bin/git',['remote','add','origin','https://github.com/sparkle-project/Sparkle.git']);
  run('/usr/bin/git',['-c','core.hooksPath=/dev/null','fetch','--depth=1','origin',SOURCE_COMMIT]);
  run('/usr/bin/git',['-c','core.hooksPath=/dev/null','checkout','--detach','FETCH_HEAD']);
  const actual=execFileSync('/usr/bin/git',['rev-parse','HEAD'],{cwd:source,encoding:'utf8'}).trim();
  if(actual!==SOURCE_COMMIT)throw Error('Sparkle source commit mismatch.');
  const configFile=path.join(source,'Configurations/ConfigSparkleTool.xcconfig');
  const config=await fs.readFile(configFile,'utf8');
  if(!config.includes('PRODUCT_BUNDLE_IDENTIFIER = org.sparkle-project.sparkle-cli'))throw Error('Unexpected Sparkle CLI configuration.');
  await fs.writeFile(configFile,config.replace('PRODUCT_BUNDLE_IDENTIFIER = org.sparkle-project.sparkle-cli','PRODUCT_BUNDLE_IDENTIFIER = local.tubesave.personal.sparkle-cli'));
  // Keep native ad-hoc signing. It requires no purchased certificate and is
  // unrelated to the Ed25519 update archive authentication, which stays enabled.
  run('/usr/bin/xcodebuild',['-project','Sparkle.xcodeproj','-scheme','sparkle-cli','-configuration','Release','-derivedDataPath',derived,'-quiet','ARCHS='+(process.arch==='x64'?'x86_64':'arm64'),'ONLY_ACTIVE_ARCH=NO','CODE_SIGN_IDENTITY=-','DEVELOPMENT_TEAM=','build']);
  const app=path.join(derived,'Build/Products/Release/sparkle.app');
  await fs.access(path.join(app,'Contents/MacOS/sparkle'));
  await fs.access(path.join(app,'Contents/Frameworks/Sparkle.framework'));
  await fs.mkdir(dir,{recursive:true});
  execFileSync('/usr/bin/ditto',[app,path.join(dir,'sparkle.app')]);
  await fs.copyFile(path.join(source,'LICENSE'),path.join(dir,'LICENSE'));
  await fs.writeFile(marker,JSON.stringify({version:VERSION,commit:SOURCE_COMMIT,arch:process.arch},null,2));
  console.log('SPARKLE_CLI_READY',VERSION,process.arch,SOURCE_COMMIT);
  return dir;
}
if(require.main===module)prepare().then(p=>console.log(p)).catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={prepare,VERSION,SOURCE_COMMIT,CLI_PATH};
