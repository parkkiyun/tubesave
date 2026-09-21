'use strict';
// Version-only metadata update; preserves the already reviewed dependency graph.
const fs=require('node:fs');
for(const prefix of ['', 'app/']){
 const manifest=JSON.parse(fs.readFileSync(prefix+'package.json','utf8'));
 const file=prefix+'package-lock.json',lock=JSON.parse(fs.readFileSync(file,'utf8'));
 if(lock.lockfileVersion!==3||!lock.packages[''])throw Error('Unknown lock format.');
 lock.version=manifest.version;lock.packages[''].version=manifest.version;
 fs.writeFileSync(file,JSON.stringify(lock,null,2)+'\n');
}
