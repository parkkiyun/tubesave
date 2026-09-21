'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
const {execFileSync}=require('node:child_process');
async function main(){
 if(!['darwin','win32'].includes(process.platform))throw Error('Build on the native target OS.');
 const platform=process.platform,arch=process.arch;if(!['arm64','x64'].includes(arch)||(platform==='win32'&&arch!=='x64'))throw Error('Unsupported target.');
 // Engines and publisher tools ship inside the installer, not a first-run download.
 execFileSync(process.execPath,['scripts/prepare-engines.cjs',path.resolve('resources/engines')],{stdio:'inherit'});
 execFileSync(process.execPath,['scripts/personal/setup-kit.cjs'],{stdio:'inherit'});
 const publisher=path.resolve(`setup-kits/TubeSave-Personal-Setup-${platform}-${arch}`);
 await fs.copyFile('personal-setup/gui-worker.cjs',path.join(publisher,'personal-setup/gui-worker.cjs'));
 await fs.writeFile('resources/desktop-distribution.json',JSON.stringify({format:'desktop-onboarding',enabled:false,reason:'Ready to use. Connect personal updates from the graphical welcome window or Help menu.'}));
 const {build,Platform,Arch}=require('electron-builder');
 const config={appId:'local.tubesave.desktop',productName:'TubeSave',electronVersion:require('../package.json').devDependencies.electron,
  directories:{app:'app',output:'dist-desktop',buildResources:'build'},asar:true,npmRebuild:false,forceCodeSigning:false,publish:null,
  extraMetadata:{name:'tubesave-desktop',main:'desktop-main.cjs',author:'TubeSave'},
  files:['**/*','!**/test{,s}/**','!**/*.map','!personal-test-main.cjs'],
  extraResources:[{from:'resources/engines',to:'engines'},{from:'resources/desktop-distribution.json',to:'distribution.json'},{from:publisher,to:'publisher',filter:['**/*','!*.command','!*.bat']}],
  artifactName:'TubeSave-${version}-${os}-${arch}.${ext}',
  mac:{category:'public.app-category.utilities',icon:'app/tubesave.icns',target:['dmg'],identity:'-',notarize:false,hardenedRuntime:false,minimumSystemVersion:'12.0'},
  afterSign:platform==='darwin'?require.resolve('./personal/seal-mac.cjs'):undefined,
  dmg:{title:'TubeSave 설치',window:{width:540,height:380},contents:[{x:155,y:190,type:'file'},{x:385,y:190,type:'link',path:'/Applications'}]},
  win:{icon:'app/tubesave.ico',target:['nsis'],signExecutable:false},
  nsis:{oneClick:false,perMachine:false,allowElevation:false,allowToChangeInstallationDirectory:true,deleteAppDataOnUninstall:false,createDesktopShortcut:true,createStartMenuShortcut:true,runAfterFinish:true,installerLanguages:['ko_KR','en_US'],language:'1042',artifactName:'TubeSave-Setup-${version}-${arch}.${ext}'}
 };
 await build({config,targets:(platform==='darwin'?Platform.MAC:Platform.WINDOWS).createTarget(platform==='darwin'?['dmg']:['nsis'],Arch[arch]),publish:'never'});
 console.log('DESKTOP_INSTALLER_READY',platform,arch);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
