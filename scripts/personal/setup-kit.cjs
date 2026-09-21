'use strict';
// Build a self-contained one-time publisher setup kit. No npm/Python installation on the user's computer.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const network=require('../../app/lib/personal-network.cjs');
async function main(){
  const version='2.101.0',platform=process.platform,arch=process.arch;
  if(!['darwin','win32'].includes(platform)||(platform==='win32'&&arch!=='x64'))throw Error('Native Mac/Windows setup kit required.');
  const root=path.resolve('setup-kits'),name=`TubeSave-Personal-Setup-${platform}-${arch}`,kit=path.join(root,name);
  await fs.mkdir(path.join(kit,'runtime'),{recursive:true});await fs.mkdir(path.join(kit,'personal-setup'),{recursive:true});await fs.mkdir(path.join(kit,'app/lib'),{recursive:true});
  await fs.copyFile(process.execPath,path.join(kit,'runtime',platform==='win32'?'node.exe':'node'));if(platform!=='win32')await fs.chmod(path.join(kit,'runtime/node'),0o755);
  const assetName=`gh_${version}_${platform==='darwin'?'macOS':'windows'}_${arch==='x64'?'amd64':'arm64'}.zip`;
  const headers={'User-Agent':'TubeSave-Build'};
  if(process.env.GITHUB_ACTIONS==='true'&&process.env.TUBESAVE_BUILD_GITHUB_TOKEN)headers.Authorization='Bearer '+process.env.TUBESAVE_BUILD_GITHUB_TOKEN;
  const r=await fetch(`https://api.github.com/repos/cli/cli/releases/tags/v${version}`,{headers,redirect:'error',signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('GitHub CLI metadata unavailable.');
  const asset=(await r.json()).assets.find(a=>a.name===assetName);if(!asset||!/^sha256:[a-f0-9]{64}$/.test(asset.digest||''))throw Error('GitHub CLI asset integrity information missing.');
  const archive=path.join(root,assetName);await fs.rm(archive,{force:true});await network.download(asset.browser_download_url,archive,{size:asset.size});
  if('sha256:'+crypto.createHash('sha256').update(await fs.readFile(archive)).digest('hex')!==asset.digest)throw Error('GitHub CLI archive hash mismatch.');
  const unpack=path.join(root,'gh-unpack');await fs.mkdir(unpack,{recursive:true});
  if(platform==='darwin')execFileSync('/usr/bin/ditto',['-x','-k',archive,unpack]);
  else execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command','Expand-Archive -LiteralPath $env.TS_GH_ARCHIVE -DestinationPath $env.TS_GH_UNPACK -Force'],{env:{...process.env,TS_GH_ARCHIVE:archive,TS_GH_UNPACK:unpack},stdio:'inherit'});
  async function find(dir,filename){for(const e of await fs.readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isFile()&&e.name===filename)return p;if(e.isDirectory()){const f=await find(p,filename);if(f)return f;}}}
  const gh=await find(unpack,platform==='win32'?'gh.exe':'gh');if(!gh)throw Error('CLI binary missing.');await fs.copyFile(gh,path.join(kit,'runtime',platform==='win32'?'gh.exe':'gh'));if(platform!=='win32')await fs.chmod(path.join(kit,'runtime/gh'),0o755);
  for(const f of ['personal-setup/setup.cjs','app/lib/personal-trust.cjs','app/lib/personal-network.cjs'])await fs.copyFile(f,path.join(kit,f));
  for(const [url,name]of [[`https://raw.githubusercontent.com/cli/cli/v${version}/LICENSE`,'GitHub-CLI-LICENSE'],[`https://raw.githubusercontent.com/nodejs/node/v${process.versions.node}/LICENSE`,'Node-LICENSE']]){const r=await fetch(url,{signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('Runtime license unavailable.');await fs.writeFile(path.join(kit,name),await r.text());}
  if(platform==='darwin'){
    const start=path.join(kit,'시작.command');await fs.writeFile(start,'#!/bin/bash\nset -e\ncd "$(dirname "$0")"\n./runtime/node personal-setup/setup.cjs\nprintf "\\n창을 닫으려면 Enter를 누르세요."\nread -r _\n',{mode:0o755});
  }else await fs.writeFile(path.join(kit,'시작.bat'),'@echo off\r\nchcp 65001 >nul\r\ncd /d "%~dp0"\r\n"%~dp0runtime\\node.exe" "%~dp0personal-setup\\setup.cjs"\r\npause\r\n');
  await fs.writeFile(path.join(kit,'사용안내.txt'),'ZIP을 전부 압축 해제한 뒤 시작.command(Mac) 또는 시작.bat(Windows)를 실행하세요.\n무료 Ed25519 서명키 생성 → GitHub 브라우저 로그인 → 비밀키 Secret 저장 → 최초 설치본 빌드 → 서명 검증 후 설치 순서입니다.\nGitHub 로그인 및 y 동의는 본인이 직접 수행합니다. 토큰/키를 채팅으로 보내지 마세요.\n키는 ~/.config/TubeSavePublisher 또는 Windows LOCALAPPDATA/TubeSavePublisher에 저장합니다. 삭제하지 말고 안전하게 백업하세요.\n두 번째 컴퓨터에서는 기존 키를 유지하고 설치만 진행합니다. 운영체제 보안 경고를 끄지는 않습니다.\n');
  execFileSync(path.join(kit,'runtime',platform==='win32'?'node.exe':'node'),[path.join(kit,'personal-setup/setup.cjs'),'--self-test'],{stdio:'inherit'});
  const zip=path.join(root,name+'.zip');await fs.rm(zip,{force:true});
  if(platform==='darwin')execFileSync('/usr/bin/ditto',['-c','-k','--keepParent',kit,zip]);
  else execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command','Compress-Archive -LiteralPath $env.TS_KIT -DestinationPath $env.TS_KIT_ZIP -Force'],{env:{...process.env,TS_KIT:kit,TS_KIT_ZIP:zip},stdio:'inherit'});
  console.log('SETUP_KIT_READY',zip);
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
