'use strict';
// Rebuild platform icon containers from the original TubeSave geometric mark.
// Local, deterministic and dependency-free: this script performs no network IO.
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const root=path.resolve(__dirname,'..');
function crc(b){let c=0xffffffff;for(const v of b){c^=v;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;}
function chunk(t,d){const type=Buffer.from(t),n=Buffer.alloc(4),c=Buffer.alloc(4);n.writeUInt32BE(d.length);c.writeUInt32BE(crc(Buffer.concat([type,d])));return Buffer.concat([n,type,d,c]);}
function rounded(x,y,l,t,r,b,rad){if(x<l||x>r||y<t||y>b)return false;const dx=Math.max(l+rad-x,0,x-r+rad),dy=Math.max(t+rad-y,0,y-b+rad);return dx*dx+dy*dy<=rad*rad;}
function polygon(x,y,points){let inside=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
const triangle=[[390,248],[746,474],[390,701]];
const arrow=[[671,645],[711,645],[711,754],[744,720],[770,746],[703,814],[691,802],[679,814],[612,746],[638,720],[671,754]];
function color(x,y){let c=[0,0,0,0];if(rounded(x,y,24,24,1000,1000,220))c=[53,92,245,255];if(polygon(x,y,triangle))c=[255,255,255,255];if(rounded(x,y,510,596,872,894,84))c=[23,43,112,255];if(polygon(x,y,arrow))c=[255,255,255,255];return c;}
function png(size){const data=Buffer.alloc(size*(1+size*4)),scale=1024/size;for(let y=0;y<size;y++)for(let x=0;x<size;x++){const c=color((x+0.5)*scale,(y+0.5)*scale);for(let k=0;k<4;k++)data[y*(1+size*4)+1+x*4+k]=c[k];}const h=Buffer.alloc(13);h.writeUInt32BE(size,0);h.writeUInt32BE(size,4);h[8]=8;h[9]=6;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',h),chunk('IDAT',zlib.deflateSync(data,{level:9})),chunk('IEND',Buffer.alloc(0))]);}
const sizes=[16,32,64,128,256,512,1024],images=new Map(sizes.map(s=>[s,png(s)]));
fs.writeFileSync(path.join(root,'app/tubesave.png'),images.get(1024));
const icoSizes=sizes.filter(s=>s<=256),head=Buffer.alloc(6+16*icoSizes.length);head.writeUInt16LE(1,2);head.writeUInt16LE(icoSizes.length,4);let offset=head.length;
icoSizes.forEach((s,i)=>{const p=6+16*i,b=images.get(s);head[p]=s%256;head[p+1]=s%256;head.writeUInt16LE(1,p+4);head.writeUInt16LE(32,p+6);head.writeUInt32LE(b.length,p+8);head.writeUInt32LE(offset,p+12);offset+=b.length;});
fs.writeFileSync(path.join(root,'app/tubesave.ico'),Buffer.concat([head,...icoSizes.map(s=>images.get(s))]));
const types=['icp4','icp5','icp6','ic07','ic08','ic09','ic10'];const entries=sizes.map((s,i)=>{const b=images.get(s),h=Buffer.alloc(8);h.write(types[i]);h.writeUInt32BE(b.length+8,4);return Buffer.concat([h,b]);});const header=Buffer.alloc(8);header.write('icns');header.writeUInt32BE(8+entries.reduce((n,b)=>n+b.length,0),4);fs.writeFileSync(path.join(root,'app/tubesave.icns'),Buffer.concat([header,...entries]));
console.log('Generated PNG, ICO and ICNS icons.');
