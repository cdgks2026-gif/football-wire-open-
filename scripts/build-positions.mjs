/* Pinned historic detailed positions. Never claim this 2026-07 snapshot is live. */
import {readFileSync,writeFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import vm from "node:vm";
const folder=process.cwd(),ctx={window:{}};
for(const f of ["football-data.js","football-world.js"]){
 vm.runInNewContext(readFileSync(folder+"/site/"+f,"utf8"),ctx,{timeout:10000});
}
const requested=new Map();
for(const team of [...ctx.window.FOOTBALL_DATABASE.clubs,...ctx.window.FOOTBALL_WORLD.clubs]){
 for(const p of team.players){
  const norm=canonical(p.name);
  if(!requested.has(norm))requested.set(norm,new Set());
  requested.get(norm).add(p.name);
 }
}
function canonical(s){return String(s||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"")
 .toLowerCase().replace(/[’']/g,"").replace(/[^a-z0-9]+/g," ").trim();}
function* csvRows(csv){
 let field="",record=[],quoted=false;
 for(let i=0;i<csv.length;i++){
  const ch=csv[i];
  if(ch==='"'){if(quoted&&csv[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}
  else if(!quoted&&(ch===","||ch==="\n")){
   record.push(field);field="";
   if(ch==="\n"){yield record;record=[];}
  }else if(ch!=="\r"||quoted)field+=ch;
 }
 if(record.length||field){record.push(field);yield record;}
}
const origin="https://pub-e682421888d945d684bcae8890b0ec20.r2.dev/data/";
async function fetchCSV(file,time=16000){
 const response=await fetch(origin+file,{signal:AbortSignal.timeout(time)});
 if(!response.ok)throw Error(file+" HTTP "+response.status);
 const bytes=Buffer.from(await response.arrayBuffer());
 if(bytes.length>45000000)throw Error(file+" too large");
 return gunzipSync(bytes).toString("utf8");
}
function mapFields(columns){return Object.fromEntries(columns.map((key,index)=>[key,index]));}
const data={},wantedIds=new Set(),byId=new Map();
try{
 const rows=csvRows(await fetchCSV("players.csv.gz"));
 const cols=mapFields(rows.next().value||[]);
 if(["name","player_id","sub_position","position"].some(k=>cols[k]===undefined))throw Error("Invalid columns");
 const candidates=new Map();
 for(const row of rows){
  const match=requested.get(canonical(row[cols.name]));
  if(!match)continue;
  const id=Number(row[cols.player_id]);
  if(!Number.isSafeInteger(id))continue;
  const record={id,main:row[cols.sub_position]||"",family:row[cols.position]||"",
    foot:row[cols.foot]||"",dob:row[cols.date_of_birth]||"",
    source:"历史德转球员资料",asOf:"2026-07-06"};
  for(const name of match){
   if(!candidates.has(name))candidates.set(name,new Map());
   candidates.get(name).set(id,record);
  }
 }
 for(const [name,ids] of candidates){
  if(ids.size!==1)continue;
  const record=ids.values().next().value;
  if(!record.main)continue;
  data[name]=record;wantedIds.add(record.id);byId.set(record.id,name);
 }
}catch(error){console.warn("[POS] history unavailable:",error.message);}
const overrides={
 "Matheus Cunha":{main:"Centre-Forward",alternates:["Left Winger","Second Striker","Attacking Midfield"],
   source:"德转球员档案及2025/26赛季位置",url:"https://www.transfermarkt.com/matheus-cunha/profil/spieler/517894"},
 "Bruno Fernandes":{main:"Attacking Midfield",alternates:["Central Midfield"],
   source:"德转2025/26赛季比赛档案",url:"https://www.transfermarkt.com/bruno-fernandes/leistungsdatendetails/spieler/240306"},
 "Bryan Mbeumo":{main:"Right Winger",alternates:["Centre-Forward"]},
 "Amad Diallo":{main:"Right Winger",alternates:["Right Midfield","Attacking Midfield"]},
 "Patrick Dorgu":{main:"Left Winger",alternates:["Left-Back","Left Midfield"]},
 "Marcus Rashford":{main:"Left Winger",alternates:["Centre-Forward"]},
 "Mason Mount":{main:"Attacking Midfield",alternates:["Central Midfield","Left Winger"]},
 "Kobbie Mainoo":{main:"Central Midfield",alternates:["Defensive Midfield"]},
 "Manuel Ugarte":{main:"Defensive Midfield",alternates:["Central Midfield"]},
 "Carlos Baleba":{main:"Defensive Midfield",alternates:["Central Midfield"]},
 "Diogo Dalot":{main:"Right-Back",alternates:["Left-Back"]},
 "Noussair Mazraoui":{main:"Right-Back",alternates:["Left-Back","Centre-Back"]},
 "Luke Shaw":{main:"Left-Back",alternates:["Centre-Back"]},
 "Lisandro Martinez":{main:"Centre-Back",alternates:["Left-Back"]},
 "Matthijs de Ligt":{main:"Centre-Back"},
 "Harry Maguire":{main:"Centre-Back"},
 "Leny Yoro":{main:"Centre-Back"},
 "Benjamin Sesko":{main:"Centre-Forward"},
 "Joshua Zirkzee":{main:"Centre-Forward",alternates:["Second Striker","Attacking Midfield"]},
 "Andrey Santos":{main:"Central Midfield",alternates:["Defensive Midfield"]},
 "Youri Tielemans":{main:"Central Midfield",alternates:["Attacking Midfield"]},
 "Cole Palmer":{main:"Attacking Midfield",alternates:["Right Winger"]},
 "Declan Rice":{main:"Defensive Midfield",alternates:["Central Midfield"]},
 "Phil Foden":{main:"Attacking Midfield",alternates:["Right Winger","Left Winger"]},
 "Lamine Yamal":{main:"Right Winger"},
 "Kylian Mbappe":{main:"Centre-Forward",alternates:["Left Winger"]},
 "Erling Haaland":{main:"Centre-Forward"},
 "Bukayo Saka":{main:"Right Winger"},
 "Vinicius Junior":{main:"Left Winger"}
};
for(const [name,record] of Object.entries(overrides)){
 data[name]={...(data[name]||{}),...record,source:record.source||"历史德转主要位置 + 单独核对的多位置使用"};
}
const positionNameToRole={ "Goalkeeper":"GK","Left-Back":"LB","Centre-Back":"CB",
 "Right-Back":"RB","Defensive Midfield":"DM","Central Midfield":"CM",
 "Attacking Midfield":"AM","Left Midfield":"LM","Right Midfield":"RM",
 "Left Winger":"LW","Right Winger":"RW","Centre-Forward":"ST",
 "Second Striker":"SS"};
// Full historical lineups archive exceeds economical build limits and is not required
// for reliable primary/secondary position data. Opt-in only when provisioned
// with sufficient resources; missing appearance samples remain explicitly empty.
if(process.env.FOOTBALL_IMPORT_HISTORICAL_MATCHES==="1")try{
 const rows=csvRows(await fetchCSV("game_lineups.csv.gz",13000));
 const cols=mapFields(rows.next().value||[]);
 if(["player_id","position","date"].every(k=>cols[k]!==undefined)){
  const counts=new Map(),timeMax=new Map();
  for(const row of rows){
   const id=Number(row[cols.player_id]),when=row[cols.date],raw=row[cols.position];
   if(!wantedIds.has(id)||!when||when<"2024-07-01"||when>"2026-07-06")continue;
   const role=positionNameToRole[raw]||(["GK","LB","CB","RB","DM","CM","AM","LM","RM","LW","RW","ST","SS"].includes(raw)?raw:null);
   if(!role)continue;
   if(!counts.has(id))counts.set(id,new Map());
   counts.get(id).set(role,(counts.get(id).get(role)||0)+1);
   if(!timeMax.has(id)||when>timeMax.get(id))timeMax.set(id,when);
  }
  for(const [id,list] of counts){
   const name=byId.get(id);
   const usage=[...list.entries()].sort((a,b)=>b[1]-a[1]);
   if(name&&data[name]){
    data[name].recentPositions=usage.slice(0,5);
    data[name].lastMatchDate=timeMax.get(id);
   }
  }
  console.log("[POS] historical match appearances sampled:",counts.size);
 }
}catch(error){console.warn("[POS] historical per-match lineup positions unavailable:",error.message);}
const payload={asOf:"2026-07-06",coverage:Object.keys(data).length,
 birthDates:Object.values(data).filter(p=>/^\d{4}-\d{2}-\d{2}$/.test(p.dob||"")).length,
 matchPositions:Object.values(data).filter(p=>p.recentPositions?.length).length,players:data};
writeFileSync(folder+"/site/football-positions.js","/* Transfermarkt historical position snapshots; NOT realtime. */\nwindow.FOOTBALL_POSITION_DATA="+JSON.stringify(payload)+";\n");
console.log("[POS] mapped",payload.coverage,"of",requested.size,
 "player names; sourced birth dates",payload.birthDates,
 "; historical match sample",payload.matchPositions);
