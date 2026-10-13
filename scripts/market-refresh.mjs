/**
 * Automatic public historical Transfermarkt-snapshot checks.
 * Source: https://github.com/dcaribou/transfermarkt-datasets (CC0).
 * This is NOT live Transfermarkt access; the upstream collector was paused.
 * Never synthesize an unsourced market value or label the inspection time
 * as the player's valuation-update date.
 */
import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import {createHash} from "node:crypto";
import vm from "node:vm";

const DATA_ORIGIN="https://pub-e682421888d945d684bcae8890b0ec20.r2.dev/data/";
const valueMin=20000,valueMax=350000000;
const isoDate=x=>/^20\d\d-\d\d-\d\d$/.test(x||"")?x:null;
const ascii=s=>String(s||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"")
  .toLowerCase().replace(/[‘’´']/g,"").replace(/[^a-z0-9]+/g," ").trim();

function* rowsOf(csv){
 let field="",row=[],quote=false;
 for(let i=0;i<csv.length;i++){
  const ch=csv[i];
  if(ch==='"'){
   if(quote&&csv[i+1]==='"'){field+='"';i++;}
   else quote=!quote;
  }else if(!quote&&(ch===","||ch==="\n")){
   row.push(field);field="";
   if(ch==="\n"){yield row;row=[];}
  }else if(ch!=="\r"||quote){field+=ch;}
 }
 if(row.length||field){row.push(field);yield row;}
}
function indexOf(header){return Object.fromEntries(header.map((column,index)=>[column,index]));}
function loadGlobals(root){
 const context={window:{}};
 for(const name of ["football-data.js","football-world.js","football-values.js"]){
  const code=readFileSync(root+"/site/"+name,"utf8");
  vm.runInNewContext(code,context,{timeout:9000,filename:name});
 }
 return context.window;
}
async function downloadCsv(file,timeoutMs=18000){
 const response=await fetch(DATA_ORIGIN+file,{signal:AbortSignal.timeout(timeoutMs),
  headers:{"User-Agent":"FootballDynasty/2.0 source freshness checker"}});
 if(!response.ok)throw Error(file+": upstream HTTP "+response.status);
 const input=Buffer.from(await response.arrayBuffer());
 if(input.byteLength>45000000)throw Error(file+": compressed size unsafe");
 return {csv:gunzipSync(input).toString("utf8"),
  hash:createHash("sha256").update(input).digest("hex")};
}
function candidatePlayers(root){
 const globals=loadGlobals(root);
 const targets=new Map();
 for(const club of [...globals.FOOTBALL_DATABASE.clubs,...globals.FOOTBALL_WORLD.clubs]){
  for(const player of club.players){
   const full=player.name,k=ascii(full);
   if(!k)continue;
   if(!targets.has(k))targets.set(k,new Set());
   targets.get(k).add(full);
  }
 }
 return {globals,targets};
}
export function readPinnedSnapshot(root="/app"){
 return loadGlobals(root).FOOTBALL_TM_VALUES;
}
export async function refreshMarketValues(root="/app",previous=null){
 const {globals,targets}=candidatePlayers(root);
 const pinned=globals.FOOTBALL_TM_VALUES;
 const existing=previous||pinned;
 const checkedAt=new Date().toISOString();
 const downloaded=await downloadCsv("players.csv.gz");
 if(downloaded.hash===existing.sourceHash){
  return {values:{...existing},checkedAt,changed:false,sourceStatus:"源文件未变化"};
 }
 const rows=rowsOf(downloaded.csv);
 const head=rows.next().value||[];
 const cols=indexOf(head);
 if(["player_id","name","market_value_in_eur"].some(k=>cols[k]===undefined))
  throw Error("player CSV structure changed; rejecting update");
 const candidates=new Map(),identityById=new Map();
 for(const row of rows){
  const matches=targets.get(ascii(row[cols.name]));
  if(!matches)continue;
  const id=Number(row[cols.player_id]),eur=Number(row[cols.market_value_in_eur]);
  if(!Number.isSafeInteger(id)||!Number.isFinite(eur)||eur<valueMin||eur>valueMax)continue;
  identityById.set(id,eur);
  for(const name of matches){
   if(!candidates.has(name))candidates.set(name,new Map());
   candidates.get(name).set(id,eur);
  }
 }
 const accepted=new Map();
 for(const [name,found] of candidates)if(found.size===1){
  const [id,eur]=found.entries().next().value;
  accepted.set(name,{id,eur});
 }
 if(accepted.size<300)throw Error("Insufficient exact player matches ("+accepted.size+"); keeping verified cache");

 // Optional second download gives each player's true last valuation date.  It
 // is substantially bigger; failure leaves the snapshot dated, not the player.
 const latest=new Map();
 let latestValuationDate=null,hasDates=false;
 try{
  const valuation=await downloadCsv("player_valuations.csv.gz",16000);
  const rv=rowsOf(valuation.csv),columns=indexOf(rv.next().value||[]);
  if(["player_id","date","market_value_in_eur"].some(k=>columns[k]===undefined))
   throw Error("valuations columns missing");
  const wanted=new Set([...accepted.values()].map(a=>a.id));
  for(const row of rv){
   const id=Number(row[columns.player_id]);
   const when=isoDate(row[columns.date]);
   if(!when)continue;
   if(!latestValuationDate||when>latestValuationDate)latestValuationDate=when;
   if(!wanted.has(id))continue;
   const eur=Number(row[columns.market_value_in_eur]);
   if(!Number.isFinite(eur)||eur<valueMin||eur>valueMax)continue;
   if(!latest.has(id)||latest.get(id).date<when)latest.set(id,{eur,date:when});
  }
  hasDates=true;
 }catch(error){
  console.warn("[TM] individual valuation dates unavailable:",error.message);
 }
 const bulk={};
 for(const [name,record] of accepted){
  const dated=latest.get(record.id);
  // A mismatched valuation cannot be assigned the historic date. Keep amount
  // from player snapshot with an explicitly unknown individual valuation date.
  const actualDate=dated?.eur===record.eur?dated.date:null;
  const old=existing.bulk?.[name];
  if(old?.date&&actualDate&&old.date>actualDate) {
   bulk[name]=old;
   continue;
  }
  bulk[name]={eur:record.eur,date:actualDate,
   snapshot:existing.asOf||"2026-07-06",
   source:"Historical Transfermarkt dataset (not realtime)",
   url:"https://www.transfermarkt.com/-/profil/spieler/"+record.id};
 }
 const values={...existing,
  sourced:{...(existing.sourced||{}),...(pinned.sourced||{})},
  bulk,coverage:Object.keys(bulk).length,
  sourceHash:downloaded.hash,
  datasetCutoff:latestValuationDate||existing.datasetCutoff||"2026-06-12",
  asOf:existing.asOf||"2026-07-06"};
 const oldBulk=existing.bulk||{};
 const edited=Object.keys(bulk).filter(key=>oldBulk[key]?.eur!==bulk[key].eur||oldBulk[key]?.date!==bulk[key].date);
 const changed=edited.length>0||Object.keys(oldBulk).length!==values.coverage;
 return {values,checkedAt,changed,changedCount:edited.length,
   sourceStatus:changed?"检测到历史数据变化":"已检查，估值未变化",
   hasIndividualDates:hasDates,
   matched:values.coverage};
}
