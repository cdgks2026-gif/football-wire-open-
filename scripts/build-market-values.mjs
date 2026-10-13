/*
 * Build a pinned Transfermarkt valuation snapshot, never a live valuation claim.
 * The public dcaribou historical dataset is CC0; as of 2026-10, updates are
 * paused and the player valuation data ends 2026-06-12.
 *
 * If the dataset cannot be fetched, retain hand-verified valuations already
 * present in site/football-values.js; do not invent a number.
 */
import {readFileSync,writeFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import vm from "node:vm";
const ctx={window:{}};
const load=file=>vm.runInNewContext(readFileSync(file,"utf8"),ctx,{timeout:10000});
for(const file of ["site/football-data.js","site/football-world.js","site/football-values.js"])load(file);
const cache=ctx.window.FOOTBALL_TM_VALUES||{};
const clubs=[
...ctx.window.FOOTBALL_DATABASE.clubs,
...ctx.window.FOOTBALL_WORLD.clubs
];
const relevant=new Set(clubs.flatMap(c=>c.players.map(p=>p.name)));
const ascii=s=>String(s||"").normalize("NFKD")
.replace(/[\u0300-\u036f]/g,"").toLowerCase()
.replace(/[‘’´']/g,"").replace(/[^a-z0-9]+/g," ").trim();
const names=new Map();
for(const p of relevant){
 const norm=ascii(p);
 if(!names.has(norm))names.set(norm,[]);
 names.get(norm).push(p);
}
function parseCsv(str){
 let quote=false,field="",record=[],rows=[];
 for(let i=0;i<str.length;i++){
  const ch=str[i];
  if(ch==='"'&&quote&&str[i+1]==='"'){field+='"';i++;continue;}
  if(ch==='"'){quote=!quote;continue;}
  if(!quote&&(ch===','||ch==='\n')){
    record.push(field);field="";
    if(ch==='\n'){rows.push(record);record=[];}
    continue;
  }
  if(ch==='\r'&&!quote)continue;
  field+=ch;
 }
 if(record.length||field){record.push(field);rows.push(record);}
 return rows;
}
try{
 const url="https://pub-e682421888d945d684bcae8890b0ec20.r2.dev/data/players.csv.gz";
 const timeout=AbortSignal.timeout(18000);
 const response=await fetch(url,{signal:timeout,headers:{"User-Agent":"FootballDynasty/1.0 valuation snapshot builder"}});
 if(!response.ok)throw Error("HTTP "+response.status);
 const bytes=new Uint8Array(await response.arrayBuffer());
 const raw=gunzipSync(bytes).toString("utf8");
 const rows=parseCsv(raw);
 const head=rows.shift(),idx=Object.fromEntries(head.map((name,i)=>[name,i]));
 if(idx.player_id===undefined||idx.market_value_in_eur===undefined||idx.name===undefined)
  throw Error("Unexpected CSV format: "+head.slice(0,15));
 const candidates=new Map();
 for(const row of rows){
  const name=row[idx.name],aliases=names.get(ascii(name));
  if(!aliases||!aliases.length)continue;
  const eur=Number(row[idx.market_value_in_eur]);
  const id=Number(row[idx.player_id]);
  if(!Number.isInteger(id)||!Number.isFinite(eur)||eur<20000||eur>300000000)continue;
  for(const candidate of aliases){
   if(!candidates.has(candidate))candidates.set(candidate,[]);
   candidates.get(candidate).push({eur,id});
  }
 }
 const bulk={};
 for(const [name,arr] of candidates){
  const unique=[...new Map(arr.map(p=>[p.id,p])).values()];
  if(unique.length!==1)continue; // Ambiguous same-name player: no false match.
  const p=unique[0];
  bulk[name]={eur:p.eur,date:"2026-07-06",cutoff:"2026-06-12",source:"Historical Transfermarkt snapshot",
   url:"https://www.transfermarkt.com/-/profil/spieler/"+p.id};
 }
 const output={...cache,bulk,coverage:Object.keys(bulk).length,
  asOf:"2026-07-06",datasetCutoff:"2026-06-12"};
 writeFileSync("site/football-values.js",
  "/* Historical Transfermarkt valuations: upstream data not live, last recorded values June 2026. */\n"+
  "window.FOOTBALL_TM_VALUES="+JSON.stringify(output)+";\n");
 console.log("[TM] matched",Object.keys(bulk).length,"of",relevant.size,
 "historical players; pinned direct overrides",Object.keys(cache.sourced||{}).length);
}catch(error){
 console.log("[TM] download unavailable; preserving pinned verified dataset:",error.message);
}
