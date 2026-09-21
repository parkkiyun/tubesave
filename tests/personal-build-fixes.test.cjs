'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
test('Sparkle CLI is built from a pinned source revision and runs as its app bundle', async()=>{
 const prepare=require('../scripts/personal/prepare-sparkle.cjs');
 assert.match(prepare.SOURCE_COMMIT,/^[a-f0-9]{40}$/);
 assert.equal(prepare.CLI_PATH,path.join('sparkle.app','Contents','MacOS','sparkle'));
 const source=await fs.readFile(path.join(__dirname,'../scripts/personal/prepare-sparkle.cjs'),'utf8');
 assert(source.includes("'-scheme','sparkle-cli'"));
 assert(source.includes('local.tubesave.personal.sparkle-cli'));
 const runtime=await fs.readFile(path.join(__dirname,'../app/lib/personal-updater.cjs'),'utf8');
 assert(runtime.includes("path.join(helper,'sparkle.app','Contents','MacOS','sparkle')"));
});
test('setup-kit PowerShell environment references use colon syntax',async()=>{
 const source=await fs.readFile(path.join(__dirname,'../scripts/personal/setup-kit.cjs'),'utf8');
 assert(!source.includes('$env.TS_'));
 for(const name of ['TS_GH_ARCHIVE','TS_GH_UNPACK','TS_KIT','TS_KIT_ZIP'])assert(source.includes('$env:'+name));
});
