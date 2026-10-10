// Build-time snapshot of 2023 National Bureau of Statistics statistical divisions.
// Source: https://github.com/modood/Administrative-divisions-of-China (WTFPL).
// Fail open to protect the main website if the upstream file is unavailable.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import {Readable} from 'node:stream';

const root=path.resolve('public/geo/villages');
fs.mkdirSync(root,{recursive:true});
const origin='https://raw.githubusercontent.com/modood/Administrative-divisions-of-China/master/dist/';
async function openCsv(name){
 const ctrl=new AbortController();
 const timeout=setTimeout(()=>ctrl.abort(),120000);
 try {
   const response=await fetch(origin+name,{signal:ctrl.signal,headers:{'User-Agent':'CasualChinaGames/1.0 (data-build)'}});
   if(!response.ok||!response.body)throw new Error(name+' HTTP '+response.status);
   return {response,close:()=>clearTimeout(timeout)};
 }catch(error){clearTimeout(timeout);throw error;}
}
function fields(line){
 const out=[];let value='',quoted=false;
 for(let i=0;i<line.length;i++){
  const ch=line[i];
  if(ch==='"'){if(quoted&&line[i+1]==='"'){value+='"';i++;}else quoted=!quoted;}
  else if(ch===','&&!quoted){out.push(value);value='';}
  else value+=ch;
 }
 out.push(value.replace(/\r$/,''));return out;
}
async function rows(name,onRow){
 const stream=await openCsv(name);let headers=null,cnt=0;
 try {
  const lines=readline.createInterface({input:Readable.fromWeb(stream.response.body),crlfDelay:Infinity});
  for await(const line of lines){
   if(!line)continue;
   if(!headers){headers=fields(line.replace(/^\uFEFF/,''));continue;}
   const parts=fields(line);
   if(parts.length!==headers.length)continue;
   const entry=Object.fromEntries(headers.map((key,i)=>[key,parts[i]]));
   onRow(entry);cnt++;
  }
 }finally{stream.close();}
 return cnt;
}
try{
 const areas=new Map();
 const streetMap=new Map();
 const perProvince=new Map();
 const counts={};
 await rows('areas.csv',row=>{if(row.code)areas.set(row.code,row.provinceCode);});
 await rows('streets.csv',row=>{
   if(!row.code||!row.areaCode)return;
   const province=row.provinceCode||areas.get(row.areaCode)||row.code.slice(0,2);
   streetMap.set(row.code,province);
   if(!perProvince.has(province))perProvince.set(province,{index:{},villages:{}});
   const data=perProvince.get(province);
   if(!data.index[row.areaCode])data.index[row.areaCode]={};
   data.index[row.areaCode][row.name]=row.code;
 });
 const total=await rows('villages.csv',row=>{
   if(!row.streetCode||!row.name)return;
   const province=streetMap.get(row.streetCode);
   if(!province)return;
   const data=perProvince.get(province);
   if(!data.villages[row.streetCode])data.villages[row.streetCode]=[];
   data.villages[row.streetCode].push(row.name);
   counts[province]=(counts[province]||0)+1;
 });
 for(const [p,data] of perProvince){
  fs.writeFileSync(path.join(root,p+'.json'),JSON.stringify(data));
 }
 fs.writeFileSync(path.join(root,'status.json'),JSON.stringify({ready:true,source:'国家统计局2023年统计用区划代码（经开源项目整理）',asOf:'2023-06-30',total,provinces:perProvince.size,counts}));
 console.log('Villages prepared:',total,'entries in',perProvince.size,'regions');
}catch(error){
 console.warn('Village snapshot not available during build:',error?.message||String(error));
 fs.writeFileSync(path.join(root,'status.json'),JSON.stringify({ready:false,asOf:'2023-06-30',message:'村级数据暂未载入；省市县乡数据仍可使用'}));
}
