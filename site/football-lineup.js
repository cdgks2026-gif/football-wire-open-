/* Position-aware football formation selector. MIT-style standalone implementation for this project.
 * Roles from historical Transfermarkt profiles are separately marked from generated fallback positions.
 * Does not claim to reproduce official lineups or complete match-by-match position histories.
 */
(function(){
"use strict";
const ROLES={GK:"门将",LB:"左后卫",CB:"中卫",RB:"右后卫",DM:"后腰",CM:"中前卫",AM:"前腰",LW:"左边锋",RW:"右边锋",ST:"中锋",LM:"左前卫",RM:"右前卫",SS:"影锋"};
const TRANSLATE={
 "goalkeeper":"GK","keeper":"GK","left-back":"LB","left back":"LB",
 "centre-back":"CB","center-back":"CB","centre back":"CB","right-back":"RB","right back":"RB",
 "defensive midfield":"DM","central midfield":"CM","attacking midfield":"AM",
 "left midfield":"LM","right midfield":"RM",
 "left winger":"LW","right winger":"RW",
 "centre-forward":"ST","center-forward":"ST","centre forward":"ST","striker":"ST",
 "second striker":"SS","forward":"ST",
 "gk":"GK","lb":"LB","cb":"CB","rb":"RB","dm":"DM","cm":"CM","am":"AM",
 "lw":"LW","rw":"RW","st":"ST","ss":"SS","lm":"LM","rm":"RM",
 "lcb":"CB","rcb":"CB","ldm":"DM","rdm":"DM","lcm":"CM","rcm":"CM"};
const TEMPLATES={
 "4-2-3-1":[["ST"],["LW","AM","RW"],["DM","DM"],["LB","CB","CB","RB"],["GK"]],
 "4-3-3":[["LW","ST","RW"],["CM","DM","CM"],["LB","CB","CB","RB"],["GK"]],
 "4-4-2":[["ST","ST"],["LM","CM","CM","RM"],["LB","CB","CB","RB"],["GK"]]
};
const NORMALIZE=s=>String(s||"").toLowerCase().replace(/[–—_]/g,"-").trim();
function role(input){return TRANSLATE[NORMALIZE(input)]||null;}
function info(p){
 const fromSource=window.FOOTBALL_POSITION_DATA?.players?.[p.english];
 if(p.synthetic)return {main:p.pos==="G"?"GK":p.pos==="D"?"CB":p.pos==="M"?"CM":"ST",
  alternates:[],verified:false,origin:"虚构青训球员"};
 if(fromSource){
  const main=role(fromSource.main||fromSource.sub_position);
  if(main){
   const alternates=[...(fromSource.alternates||[]).map(role),
     ...(fromSource.recentPositions||[]).map(record=>role(record[0]))]
      .filter(r=>r&&r!==main);
   return {main,alternates:[...new Set(alternates)],verified:true,
     origin:fromSource.source||"历史德转档案",foot:fromSource.foot||null,
     historical:fromSource.recentPositions||[],asOf:fromSource.lastMatchDate||"2026-07"};
  }
 }
 const primary={G:"GK",D:"CB",M:"CM",F:"ST"}[p.pos]||"CM";
 return {main:primary,alternates:[],verified:false,origin:"粗略分类，位置待核实"};
}
const NEAR={
 GK:[],LB:["LM","LW","CB","RB"],RB:["RM","RW","CB","LB"],CB:["DM","LB","RB"],
 DM:["CM","CB","AM"],CM:["DM","AM","LM","RM"],AM:["CM","LW","RW","SS"],
 LM:["LW","LB","CM","RM"],RM:["RW","RB","CM","LM"],
 LW:["LM","AM","RW","SS","ST"],RW:["RM","AM","LW","SS","ST"],
 ST:["SS","LW","RW","AM"],SS:["ST","AM","LW","RW"]
};
function fit(p,spot){
 const where=info(p),target=role(spot)||spot;
 if(target==="GK")return where.main==="GK"?100:-999;
 if(where.main==="GK")return -999;
 if(where.verified){
  if(where.main===target)return 100;
  if(where.alternates.includes(target))return 88;
  if(NEAR[target]?.includes(where.main))return 58;
  if(where.alternates.some(r=>NEAR[target]?.includes(r)))return 53;
  return 14;
 }
 if(p.pos==="D")return ["CB","RB","LB"].includes(target)?62:["DM","LM","RM"].includes(target)?36:10;
 if(p.pos==="M")return ["DM","CM","AM","LM","RM"].includes(target)?59:["LW","RW"].includes(target)?39:18;
 if(p.pos==="F")return ["ST","LW","RW","SS"].includes(target)?58:["AM","LM","RM"].includes(target)?35:18;
 return 20;
}
function slots(formation){
 const layout=TEMPLATES[formation]||TEMPLATES["4-3-3"],counts={};
 return layout.flatMap((row,rowIndex)=>row.map((roleName,col)=>{
   counts[roleName]=(counts[roleName]||0)+1;
   return {key:roleName+"-"+counts[roleName],role:roleName,row:rowIndex,
     col,index:0,display:ROLES[roleName]};
 })).map((slot,i)=>({...slot,index:i}));
}
function score(p){return p.ability*.68+p.form*.17+p.fitness*.15;}
function buildXI(team,formation){
 const places=slots(formation),available=team.filter(p=>(p.injury||0)===0);
 const picks=new Array(places.length).fill(null),used=new Set();
 // Scarce specialist positions are allocated first; stable tie-break by published score.
 const order=[...places].sort((a,b)=>{
  const qualifying=s=>available.filter(p=>fit(p,s.role)>=82).length;
  return qualifying(a)-qualifying(b)|| (a.role==="GK"?-1:b.role==="GK"?1:0)||a.index-b.index;
 });
 for(const spot of order){
  const options=available.filter(p=>!used.has(p.id))
   .map(p=>({p,suitability:fit(p,spot.role)}))
   .filter(x=>x.suitability>0)
   .sort((x,y)=>(y.suitability*.9+score(y.p)*.58)-
                (x.suitability*.9+score(x.p)*.58));
  const selected=options[0]?.p||null;
  if(selected){picks[spot.index]=selected;used.add(selected.id);}
 }
 return picks;
}
window.FOOTBALL_LINEUP_ENGINE={slots,roles:ROLES,info,fit,buildXI,score};
})();