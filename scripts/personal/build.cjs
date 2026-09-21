'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const trust=require('../../app/lib/personal-trust.cjs');
const {configValid}=require('../../app/lib/personal-updater.cjs');
async function buildPersonal({config,version,output=path.resolve('dist-personal'),test=false,engines=true}={}){
  if(!configValid(config))throw Error('Run the personal setup kit once to register the public key.');
  if(config.appId!==(test?trust.TEST_APP_ID:trust.APP_ID))throw Error('Test and real update identities cannot be mixed.');
  trust.compare(version,version);
  if(!['darwin','win32'].includes(process.platform)||!['arm64','x64'].includes(process.arch)||(process.platform==='win32'&&process.arch!=='x64'))throw Error('Unsupported build platform.');
  const generated=path.resolve(test?'resources/personal-test':'resources/personal');await fs.mkdir(generated,{recursive:true});
  const engineDir=path.resolve('resources/engines');
  if(engines){try{await fs.access(path.join(engineDir,'bundle.json'));}catch{execFileSync(process.execPath,['scripts/prepare-engines.cjs',engineDir],{stdio:'inherit'});}}
  await fs.writeFile(path.join(generated,'distribution.json'),JSON.stringify(config,null,2));
  const extraResources=[{from:path.join(generated,'distribution.json'),to:'distribution.json'}];
  if(engines)extraResources.push({from:engineDir,to:'engines'});
  if(process.platform==='darwin')extraResources.push({from:await require('./prepare-sparkle.cjs').prepare(),to:'sparkle',filter:['**/*','!**/*.dSYM/**','!bin/generate_*','!bin/sign_update']});
  const buildConfig={appId:config.appId,productName:test?'TubeSave Update Test':'TubeSave Personal',electronVersion:require('../../package.json').devDependencies.electron,
    directories:{app:'app',output,buildResources:'build'},asar:true,npmRebuild:false,forceCodeSigning:false,publish:null,
    extraMetadata:{name:test?'tubesave-update-test':'tubesave-personal',version,main:test?'personal-test-main.cjs':'personal-main.cjs'},
    files:['**/*','!**/test{,s}/**','!**/*.map',...(test?[]:['!personal-test-main.cjs'])],extraResources,
    artifactName:'TubeSave-Personal-${version}-${os}-${arch}.${ext}',
    mac:{icon:'app/tubesave.icns',category:'public.app-category.utilities',target:test?['zip']:['dmg','zip'],identity:null,notarize:false,hardenedRuntime:false,
      minimumSystemVersion:'12.0',extendInfo:{SUPublicEDKey:config.publicKey,SUFeedURL:`https://github.com/${trust.REPO}/releases/latest/download/appcast-${process.arch}.xml`,SUEnableAutomaticChecks:false,SUAutomaticallyUpdate:false,SUVerifyUpdateBeforeExtraction:true,NSAppTransportSecurity:{NSAllowsLocalNetworking:true}}},
    win:{icon:'app/tubesave.ico',target:['nsis'],signAndEditExecutable:false},
    nsis:{oneClick:false,perMachine:false,allowElevation:false,allowToChangeInstallationDirectory:true,deleteAppDataOnUninstall:false,createDesktopShortcut:!test,createStartMenuShortcut:!test,artifactName:'TubeSave-Personal-Setup-${version}-${arch}.${ext}'}};
  const {build,Platform,Arch}=require('electron-builder');
  await build({config:buildConfig,targets:(process.platform==='darwin'?Platform.MAC:Platform.WINDOWS).createTarget(process.platform==='darwin'?(test?['zip']:['dmg','zip']):['nsis'],Arch[process.arch]),publish:'never'});
  return path.join(output,trust.fileName(version,process.platform,process.arch));
}
if(require.main===module){
  const config=require('../../release/personal.json');
  buildPersonal({config,version:require('../../app/package.json').version}).catch(e=>{console.error(e.message);process.exitCode=1;});
}
module.exports={buildPersonal};
