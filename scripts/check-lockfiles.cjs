'use strict';
const fs=require('node:fs');
for(const prefix of ['', 'app/']){
  const manifest=JSON.parse(fs.readFileSync(prefix+'package.json','utf8'));
  const lock=JSON.parse(fs.readFileSync(prefix+'package-lock.json','utf8'));
  if(lock.lockfileVersion!==3||lock.version!==manifest.version||lock.name!==manifest.name)throw Error('Lockfile metadata mismatch: '+prefix);
  const root=lock.packages[''];
  for(const group of ['dependencies','devDependencies']){
    const expected=manifest[group]||{},actual=root[group]||{};
    if(Object.keys(actual).length!==Object.keys(expected).length)throw Error('Dependency set mismatch: '+prefix+group);
    for(const [name,version]of Object.entries(expected)){
      if(actual[name]!==version||lock.packages['node_modules/'+name]?.version!==version)throw Error('Pinned version mismatch: '+name);
    }
  }
  for(const [name,pkg]of Object.entries(lock.packages)){
    if(!name)continue;
    if(pkg.link||!pkg.resolved||!pkg.integrity)throw Error('Unpinned package: '+name);
    const u=new URL(pkg.resolved);
    if(u.protocol!=='https:'||u.hostname!=='registry.npmjs.org'||u.username||u.password)throw Error('Unexpected dependency registry: '+name);
    if(!/^sha(512|384|256|1)-[A-Za-z0-9+/=]+$/.test(pkg.integrity))throw Error('Invalid dependency integrity: '+name);
  }
  console.log(prefix+'package-lock.json: metadata, pinned direct versions, registry origins and integrity fields checked; '+(Object.keys(lock.packages).length-1)+' packages.');
}
console.log('This structure check is not a full dependency security audit or native installer test.');
