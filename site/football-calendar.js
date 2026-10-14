/* Football Dynasty transfer windows: data-driven verified 2026/27 schedules.
   Future seasons and unavailable leagues are explicitly SIMULATED estimates.
   Rules constrain the BUYER's league registration, not sellers' ability to accept offers.
*/
(function(){
"use strict";
const SOURCES={
 "英超":"https://www.premierleague.com/ar/news/4664145/when-does-summer-2026-premier-league-transfer-window-open-and-close",
 "西甲":"https://www.laliga.com/en-GB/transfers/laliga-easports?page=9",
 "意甲":"https://en.legaseriea.it/serie-a/news/diretta-calciomercato-serie-a-enilive",
 "德甲":"https://www.bundesliga.com/en/bundesliga/news/official-bundesliga-transfer-centre-summer-2026-37051",
 "法甲":"https://ligue1.com/en/articles/l1_article_5147-",
 "中超":"https://inside.fifa.com/associations/CHN/snapshot"
};
const verified={
 "英超":[["06-15","09-01","夏季转会窗"],["01-01","02-01","冬季转会窗"]],
 "西甲":[["07-01","09-01","夏季转会窗"],["01-02","02-02","冬季转会窗"]],
 "意甲":[["06-29","09-01","夏季转会窗"],["01-02","02-01","冬季转会窗"]],
 "法甲":[["06-15","09-01","夏季转会窗"],["01-01","02-01","冬季转会窗"]],
 "德甲":[["07-01","09-01","夏季转会窗"],["01-02","02-01","冬季转会窗"]],
 "中超":[["01-01","03-06","第一注册期"],["06-18","07-22","第二注册期"]]
};
const partlyVerified={"德甲":[true,false]};
const defaults={
 "葡超":[["07-01","09-01","夏季转会窗"],["01-02","02-01","冬季转会窗"]],
 "荷甲":[["07-01","09-01","夏季转会窗"],["01-02","02-01","冬季转会窗"]],
 "沙特联":[["07-22","10-12","夏季转会窗"],["01-01","02-01","冬季转会窗"]],
 "美职联":[["01-31","04-30","主转会窗"],["07-01","08-31","第二转会窗"]]
};
function list(league,year){
 const china=league==="中超";
 const data=verified[league]||defaults[league]||verified["英超"];
 return data.map(([start,end,name],idx)=>{
   const winter=!china&&idx===1;
   const authoritative=china?year===2026:year===2026;
   const isVerified=!!verified[league]&&authoritative&&
     (partlyVerified[league]?.[idx]!==false);
   return {start:(year+(winter?1:0))+"-"+start,
     end:(year+(winter?1:0))+"-"+end,name,
     source:isVerified?SOURCES[league]:null,
     verified:isVerified,label:isVerified?"2026官方日期":"游戏模拟日期"};
 });
}
window.FOOTBALL_TRANSFER_CALENDAR={list,sources:SOURCES};
})();