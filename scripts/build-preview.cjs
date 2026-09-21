'use strict';
// Explicitly non-production installers. The signed release pipeline is unchanged.
const fs=require('node:fs/promises'),path=require('node:path'),{execFileSync}=require('node:child_process');
async function main(){
  if(!['darwin','win32'].includes(process.platform))throw Error('Build on the target desktop OS.');
  if(!['x64','arm64'].includes(process.arch)||(process.platform==='win32'&&process.arch!=='x64'))throw Error('Unsupported architecture.');
  const engines=path.resolve('resources/engines');
  execFileSync(process.execPath,[path.resolve('scripts/prepare-engines.cjs'),engines],{stdio:'inherit'});
  await fs.mkdir('resources',{recursive:true});
  await fs.writeFile('resources/distribution.json',JSON.stringify({format:'preview',enabled:false,reason:'Unsigned testing build; not a production update channel.'},null,2));
  const {build,Platform,Arch}=require('electron-builder');
  const config={appId:'local.tubesave.preview',productName:'TubeSave Preview',electronVersion:'44.4.3',directories:{app:'app',output:'dist-preview',buildResources:'build'},asar:true,npmRebuild:false,
    extraMetadata:{name:'tubesave-preview',main:'preview-main.cjs'},files:['**/*','!**/test{,s}/**','!**/*.map'],
    extraResources:[{from:'resources/engines',to:'engines'},{from:'resources/distribution.json',to:'distribution.json'}],
    artifactName:'TubeSave-Preview-${version}-${os}-${arch}.${ext}',forceCodeSigning:false,publish:null,
    mac:{category:'public.app-category.utilities',icon:'app/tubesave.icns',target:['dmg','zip'],identity:null,notarize:false},
    win:{icon:'app/tubesave.ico',target:['nsis'],signAndEditExecutable:false},
    nsis:{oneClick:false,perMachine:false,allowToChangeInstallationDirectory:true,deleteAppDataOnUninstall:false,createDesktopShortcut:true,createStartMenuShortcut:true,artifactName:'TubeSave-Preview-Setup-${version}-${arch}.${ext}'}};
  const platform=process.platform==='darwin'?Platform.MAC:Platform.WINDOWS;
  await build({config,targets:platform.createTarget(process.platform==='darwin'?['dmg','zip']:['nsis'],Arch[process.arch]),publish:'never'});
  console.log('TEST INSTALLERS ONLY: unsigned, no production auto-update feed. Nothing published to Releases.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
