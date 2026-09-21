'use strict';
const {validReleaseConfig}=require('../app/lib/updates.cjs');
function createBuildConfig({platform,arch,release}){
  if(!['darwin','win32'].includes(platform)||!['x64','arm64'].includes(arch)||(platform==='win32'&&arch!=='x64'))throw Error('Unsupported release platform/architecture.');
  if(!validReleaseConfig(release))throw Error('release/config.json: enable and configure an owned release repository first.');
  if(platform==='win32'&&!(typeof release.windowsPublisherName==='string'&&release.windowsPublisherName.trim()))throw Error('A Windows signing certificate publisher name is required.');
  return {
    appId:'local.tubesave.desktop',productName:'TubeSave',electronVersion:'44.4.3',
    directories:{app:'app',output:'dist',buildResources:'build'},asar:true,npmRebuild:false,
    files:['**/*','!**/test{,s}/**','!**/*.map'],
    extraResources:[{from:'resources/engines',to:'engines'},{from:'resources/distribution.json',to:'distribution.json'}],
    artifactName:'TubeSave-${version}-${os}-${arch}.${ext}',
    forceCodeSigning:true,generateUpdatesFilesForAllChannels:false,
    publish:[{provider:'github',owner:release.owner,repo:release.repo,channel:'latest-'+arch,releaseType:'draft'}],
    afterSign:require.resolve('./after-sign.cjs'),
    mac:{category:'public.app-category.utilities',icon:'app/tubesave.icns',target:['dmg','zip'],hardenedRuntime:true,notarize:false,entitlements:'build/entitlements.mac.plist',entitlementsInherit:'build/entitlements.mac.plist',identity:process.env.CSC_NAME||undefined},
    win:{icon:'app/tubesave.ico',target:['nsis'],verifyUpdateCodeSignature:true,signtoolOptions:{publisherName:release.windowsPublisherName}},
    nsis:{oneClick:false,perMachine:false,allowToChangeInstallationDirectory:true,deleteAppDataOnUninstall:false,createDesktopShortcut:true,createStartMenuShortcut:true,artifactName:'TubeSave-Setup-${version}-${arch}.${ext}'}
  };
}
module.exports={createBuildConfig};
