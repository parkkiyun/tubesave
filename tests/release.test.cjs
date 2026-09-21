'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createBuildConfig}=require('../build/release-config.cjs');
const release={enabled:true,provider:'github',owner:'example-owner',repo:'TubeSave',windowsPublisherName:'Example Publisher'};
for(const [platform,arch,channel]of [['darwin','arm64','latest-arm64'],['darwin','x64','latest-x64'],['win32','x64','latest-x64']])test(`release ${platform}/${arch} includes engines and architecture-specific feed`,()=>{const c=createBuildConfig({platform,arch,release});assert(c.extraResources.some(r=>r.to==='engines'));assert(c.extraResources.some(r=>r.to==='distribution.json'));assert.equal(c.publish[0].channel,channel);assert(c.forceCodeSigning);assert(c.win.verifyUpdateCodeSignature);assert(c.mac.target.includes('zip'));assert.equal(c.appId,'local.tubesave.desktop');});
test('release build refuses default disabled feed config',()=>assert.throws(()=>createBuildConfig({platform:'darwin',arch:'arm64',release:{enabled:false,provider:'github',owner:'',repo:''}}),/repository/));
test('unsigned Windows feed is not silently enabled',()=>assert.throws(()=>createBuildConfig({platform:'win32',arch:'x64',release:{...release,windowsPublisherName:''}}),/publisher/));
test('unsupported Windows ARM build rejected',()=>assert.throws(()=>createBuildConfig({platform:'win32',arch:'arm64',release}),/Unsupported/));
test('Mac installer prepares engines before swapping applications',()=>{const s=fs.readFileSync(path.join(__dirname,'../install_mac.command'),'utf8');assert(s.indexOf('scripts/prepare-engines.cjs')<s.indexOf('mv "$BUNDLE" "$TARGET"'));assert(s.includes('scripts/refresh-engine-digests.cjs'));assert(!s.includes('spctl --master-disable'));});
test('Windows installer waits for engines before app replacement',()=>{const s=fs.readFileSync(path.join(__dirname,'../install/install_windows.ps1'),'utf8');assert(s.includes('-NoNewWindow -Wait -PassThru'));assert(s.indexOf('$EngineProcess.ExitCode')<s.indexOf('Move-Item -LiteralPath $Unpacked'));});
test('runtime updater never accepts arbitrary renderer feed URLs',()=>{const s=fs.readFileSync(path.join(__dirname,'../app/main.cjs'),'utf8');assert(!s.includes('setFeedURL'));assert(s.includes("app-update.yml"));assert(s.includes('validReleaseConfig(distribution)'));});

test('repository feed is bound to parkkiyun/tubesave',()=>{const r=require('../release/config.json');assert.equal(r.owner,'parkkiyun');assert.equal(r.repo,'tubesave');assert.equal(r.enabled,true);});
