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
  mac:{category:'public.app-category.utilities',icon:'app/tubesave.icns',target:['dir'],identity:'-',notarize:false,hardenedRuntime:false,minimumSystemVersion:'12.0'},
  afterSign:platform==='darwin'?require.resolve('./personal/seal-mac.cjs'):undefined,
  win:{icon:'app/tubesave.ico',target:['nsis'],signExecutable:false},
  nsis:{oneClick:false,perMachine:false,allowElevation:false,allowToChangeInstallationDirectory:true,deleteAppDataOnUninstall:false,createDesktopShortcut:true,createStartMenuShortcut:true,runAfterFinish:true,installerLanguages:['ko_KR','en_US'],language:'1042',artifactName:'TubeSave-Setup-${version}-${arch}.${ext}'}
 };
 await build({config,targets:(platform==='darwin'?Platform.MAC:Platform.WINDOWS).createTarget(platform==='darwin'?['dir']:['nsis'],Arch[arch]),publish:'never'});
 const version=require('../app/package.json').version;
 const output=path.resolve('dist-desktop');
 const installer=path.join(output,platform==='darwin'?`TubeSave-${version}-mac-${arch}.dmg`:`TubeSave-Setup-${version}-${arch}.exe`);
 if(platform==='darwin'){
  // Native hdiutil avoids Finder background-alias inode overflow on APFS CI hosts.
  // Only the already sealed, verified app and the Applications shortcut are staged.
  const bundle=path.join(output,arch==='arm64'?'mac-arm64':'mac','TubeSave.app');
  execFileSync('/usr/bin/codesign',['--verify','--deep','--strict',bundle],{stdio:'inherit'});
  const stage=await fs.mkdtemp(path.join(output,'dmg-stage-'));
  try{
   execFileSync('/usr/bin/ditto',[bundle,path.join(stage,'TubeSave.app')]);
   await fs.symlink('/Applications',path.join(stage,'Applications'));
   await fs.rm(installer,{force:true});
   execFileSync('/usr/bin/hdiutil',['create','-volname','TubeSave','-srcfolder',stage,'-ov','-format','UDZO','-fs','HFS+',installer],{stdio:'inherit',timeout:300000});
   execFileSync('/usr/bin/hdiutil',['verify',installer],{stdio:'inherit',timeout:120000});
  }finally{await fs.rm(stage,{recursive:true,force:true});}
 }
 const stat=await fs.stat(installer);
 if(!stat.isFile()||stat.size<20*1024*1024)throw Error('A complete installer was not produced.');
 console.log('DESKTOP_INSTALLER_READY',platform,arch,installer,stat.size);
}
main().catch(e=>{console.error(e);process.exit(1);});
