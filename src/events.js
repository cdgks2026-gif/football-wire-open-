const ENTITY_ALIASES = [
  [/\bReal Madrid\b/gi,"皇家马德里"],
  [/\bFC Barcelona\b|\bBarcelona\b/gi,"巴塞罗那"],
  [/\bInter Milan\b|\bInternazionale\b/gi,"国际米兰"],
  [/\bParis Saint-Germain\b|\bPSG\b/gi,"巴黎圣日耳曼"],
  [/\bManchester United\b|\bMan Utd\b/gi,"曼联"],
  [/\bManchester City\b|\bMan City\b/gi,"曼城"],
  [/\bBayern Munich\b/gi,"拜仁慕尼黑"],
  [/皇马/g,"皇家马德里"],
  [/巴萨/g,"巴塞罗那"],
  [/国米/g,"国际米兰"],
  [/巴黎(?!圣日耳曼)/g,"巴黎圣日耳曼"],
  [/拜仁(?!慕尼黑)/g,"拜仁慕尼黑"],
  [/马竞/g,"马德里竞技"],
  [/特狮/g,"特尔施特根"],
  [/C罗|C\.罗|Cristiano Ronaldo/gi,"克里斯蒂亚诺·罗纳尔多"],
  [/KDB|德布劳内/g,"凯文·德布劳内"],
  [/Vini(?:cius)?\s*Jr\.?/gi,"维尼修斯"],
  [/Lamine Yamal/gi,"亚马尔"],
  [/Kylian Mbapp[eé]/gi,"姆巴佩"],
  [/Erling Haaland/gi,"哈兰德"]
];

function normalizeEntities(title){
  let t=String(title||"");
  for(const [rule,replacement] of ENTITY_ALIASES)t=t.replace(rule,replacement);
  return t;
}

const ENTITIES = [
  "姆巴佩","亚马尔","哈兰德","梅西","罗纳尔多","贝林厄姆","维尼修斯","萨拉赫","凯恩",
  "佩德里","拉菲尼亚","登贝莱","穆西亚拉","维尔茨","奥利塞","孙兴慜","特尔施特根","凯文·德布劳内","克里斯蒂亚诺·罗纳尔多",
  "曼联","皇家马德里","巴塞罗那","曼城","利物浦","阿森纳","切尔西","热刺",
  "拜仁慕尼黑","巴黎圣日耳曼","国际米兰","AC米兰","尤文图斯","马德里竞技","多特蒙德",
  "法国队","英格兰队","西班牙队","葡萄牙队","巴西队","阿根廷队"
];

export function category(title) {
  const t=normalizeEntities(title||"");
  if (/官方确认|官宣|正式宣布/.test(t)) return "官方";
  if (/转会|加盟|签约|租借|续约|报价|免签|离队|体检|协议|交易确认/.test(t)) return "转会";
  if (/伤|缺席|手术|恢复|复出|扭伤|拉伤|骨折|伤停|流感/.test(t)) return "伤停";
  if (/红牌|视频助理裁判|裁判|争议|冲突|禁赛|处罚|罚款|内讧/.test(t)) return "争议";
  if (/主帅|教练|下课|执教/.test(t)) return "教练";
  if (/国家队|世界杯|欧国联|欧洲杯|美洲杯/.test(t)) return "国家队";
  if (/战胜|击败|战平|绝杀|逆转|进球|助攻|帽子戏法|德比|比赛/.test(t)) return "比赛";
  if (/趣闻|调侃|吐槽|搞笑|离谱|尴尬|玩笑/.test(t)) return "趣闻";
  if (ENTITIES.some((x)=>t.includes(x))) return "球星";
  return "综合";
}

function topic(title) {
  const t=normalizeEntities(title||"");
  if (/流感|生病|伤|缺席|恢复|训练|复出|伤停/.test(t)) return "健康训练";
  if (/转会|加盟|签约|租借|报价|离队|体检|协议|交易确认/.test(t)) return "转会";
  if (/续约|合同/.test(t)) return "合同";
  if (/主帅|教练|下课|执教/.test(t)) return "教练";
  if (/红牌|裁判|视频助理裁判|争议|处罚|禁赛/.test(t)) return "争议";
  if (/国家队|欧国联|世界杯|欧洲杯|美洲杯/.test(t)) return "国家队";
  if (/战胜|击败|战平|绝杀|逆转|进球|比赛|德比/.test(t)) return "比赛";
  return category(t);
}

export function eventKey(title) {
  const normalized=normalizeEntities(title);
  const entities=ENTITIES.filter((e)=>normalized.includes(e)).slice(0,2);
  if (!entities.length) return "";
  return `${entities.join("|")}|${topic(normalized)}`;
}

function tokens(title) {
  const clean=normalizeEntities(title)
    .replace(/官方确认|官方|官宣|突发|重磅|最新|消息|报道|记者|表示|认为|据悉|曝/g," ")
    .toLowerCase();
  const out=[];
  const han=clean.match(/[\u4e00-\u9fa5]+/g)||[];
  for(const chunk of han){
    if(chunk.length===2)out.push(chunk);
    else{
      for(let i=0;i<chunk.length-1;i++)out.push(chunk.slice(i,i+2));
    }
  }
  const latin=clean.match(/[a-z0-9]{3,}/g)||[];
  out.push(...latin);
  return out;
}

function itemText(item){
  return `${item?.title||""} ${String(item?.contentExcerpt||"").slice(0,700)}`;
}

function similarItems(a,b,titleThreshold=0.48,bodyThreshold=0.36){
  const titleA=a?.title||"",titleB=b?.title||"";
  const titleScore=similarityScore(titleA,titleB);
  if(titleScore>=titleThreshold)return true;

  const combinedScore=similarityScore(itemText(a),itemText(b));
  return combinedScore>=bodyThreshold;
}

function actionTokens(title){
  const t=normalizeEntities(title);
  const rules=[
    ["转会",/(转会|加盟|签约|租借|报价|体检|协议|离队)/],
    ["续约",/(续约|合同|续签)/],
    ["伤停",/(受伤|伤缺|缺席|手术|复出|恢复|伤停)/],
    ["处罚",/(红牌|禁赛|处罚|罚款|调查)/],
    ["教练",/(主帅|教练|下课|解雇|任命|执教)/],
    ["回应",/(回应|表示|透露|否认|承认|采访)/],
    ["比赛",/(战胜|击败|战平|绝杀|逆转|进球|助攻|比分|半场|全场)/]
  ];
  return rules.filter(([,r])=>r.test(t)).map(([k])=>k);
}

function actionCompatible(a,b){
  const A=actionTokens(a),B=actionTokens(b);
  if(!A.length||!B.length)return true;
  return A.some((x)=>B.includes(x));
}

function similarityScore(a,b) {
  const A=new Set(tokens(a)),B=new Set(tokens(b));
  if (!A.size||!B.size) return 0;
  let same=0;for (const x of A) if (B.has(x)) same++;
  return same/Math.min(A.size,B.size);
}
function similar(a,b,threshold=0.48) {
  const A=new Set(tokens(a)),B=new Set(tokens(b));
  if (!A.size||!B.size) return false;
  let same=0;for (const x of A) if (B.has(x)) same++;
  return same>=3 && same/Math.min(A.size,B.size)>=threshold;
}
export function sourceWeight(tier) {
  return tier==="官方"?40:tier==="转会专家"?30:tier==="国际媒体"?20:10;
}
export function clusterLatest(items) {
  const sorted=[...items].sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt));
  const groups=[];
  for (const item of sorted) {
    const eKey=String(item.aiEventKey||"").trim()||eventKey(item.title);
    const itemTime=Date.parse(item.publishedAt);
    let group=groups.find((g)=>{
      const within36h=Math.abs(Date.parse(g.head.publishedAt)-itemTime)<36*3600_000;
      if(!within36h)return false;
      if(eKey && g.eventKey){
        if(g.eventKey!==eKey)return false;
        if(!actionCompatible(g.head.title,item.title))return false;
        return similarItems(g.head,item,0.38,0.31);
      }
      const crossPlatform=(item.source==="虎扑" && g.sources.has("懂球帝"))
        || (item.source==="懂球帝" && g.sources.has("虎扑"));
      return similarItems(
        g.head,
        item,
        crossPlatform?0.46:0.60,
        crossPlatform?0.36:0.48
      );
    });
    if (!group) {
      const sources=new Map();
      if (item.sourceVerified!==false && item.source) {
        sources.set(item.source,{
          score:item.sourceScore||0,
          firstPublishedAt:item.publishedAt,
          firstTitle:item.title,
          timeReliable:item.timeReliable!==false
        });
      }
      groups.push({eventKey:eKey,head:item,sources,tiers:new Set([item.tier]),members:[item]});
    } else {
      if (item.sourceVerified!==false && item.source) {
        const old=group.sources.get(item.source);
        if(!old){
          group.sources.set(item.source,{
            score:item.sourceScore||0,
            firstPublishedAt:item.publishedAt,
            firstTitle:item.title
          });
        }else{
          const oldTime=Date.parse(old.firstPublishedAt);
          const newTime=Date.parse(item.publishedAt);
          const incomingReliable=item.timeReliable!==false;
          const shouldReplaceTime=(incomingReliable && !old.timeReliable)
            || (incomingReliable===Boolean(old.timeReliable) && newTime<oldTime);
          group.sources.set(item.source,{
            score:Math.max(old.score||0,item.sourceScore||0),
            firstPublishedAt:shouldReplaceTime?item.publishedAt:old.firstPublishedAt,
            firstTitle:shouldReplaceTime?item.title:old.firstTitle,
            timeReliable:shouldReplaceTime?incomingReliable:Boolean(old.timeReliable)
          });
        }
      }
      group.tiers.add(item.tier);
      group.members.push(item);
      const a=Date.parse(item.publishedAt),b=Date.parse(group.head.publishedAt);
      const headScore=group.head.sourceScore||sourceWeight(group.head.tier);
      const itemScore=item.sourceScore||sourceWeight(item.tier);
      if (a>b || (a===b && itemScore>headScore)) group.head=item;
    }
  }
  return groups.map((g)=>{
    const sourceDetails=[...g.sources.entries()]
      .map(([name,data])=>({
        name,
        score:data.score||0,
        firstPublishedAt:data.firstPublishedAt,
        firstTitle:data.firstTitle,
        timeReliable:Boolean(data.timeReliable)
      }))
      .sort((a,b)=>b.score-a.score || a.name.localeCompare(b.name));

    const dongqiudi=sourceDetails.find((x)=>x.name==="懂球帝");
    const hupu=sourceDetails.find((x)=>x.name==="虎扑");
    let platformExclusiveSource="";
    let platformExclusiveTitle="";
    let platformExclusiveAt="";
    if(dongqiudi && hupu && dongqiudi.timeReliable && hupu.timeReliable){
      const dt=Date.parse(dongqiudi.firstPublishedAt);
      const ht=Date.parse(hupu.firstPublishedAt);
      if(Number.isFinite(dt) && Number.isFinite(ht)){
        if(dt<ht){
          platformExclusiveSource="懂球帝";
          platformExclusiveTitle=dongqiudi.firstTitle;
          platformExclusiveAt=dongqiudi.firstPublishedAt;
        }else if(ht<dt){
          platformExclusiveSource="虎扑";
          platformExclusiveTitle=hupu.firstTitle;
          platformExclusiveAt=hupu.firstPublishedAt;
        }
      }
    }

    const baseTitle=platformExclusiveTitle||g.head.title;
    const basePublishedAt=platformExclusiveAt||g.head.publishedAt;
    const times=(g.members||[]).map((m)=>Date.parse(m.publishedAt||0)).filter(Number.isFinite).sort((a,b)=>a-b);
    const firstSeenAt=times.length?new Date(times[0]).toISOString():basePublishedAt;
    const lastSeenAt=times.length?new Date(times[times.length-1]).toISOString():basePublishedAt;
    const members=(g.members||[])
      .sort((a,b)=>Date.parse(a.publishedAt)-Date.parse(b.publishedAt))
      .slice(0,30)
      .map((m)=>({
        id:m.id,
        title:m.title,
        source:m.source,
        tier:m.tier,
        publishedAt:m.publishedAt,
        url:m.url||"",
        sourceScore:m.sourceScore||0,
        category:m.category||category(m.title),
        contentExcerpt:String(m.contentExcerpt||"").slice(0,300)
      }));
    return {
      ...g.head,
      title:baseTitle,
      publishedAt:basePublishedAt,
      category:category(baseTitle),
      confirmations:sourceDetails.length,
      sources:sourceDetails.map((x)=>x.name).slice(0,6),
      sourceDetails:sourceDetails.slice(0,6),
      primarySource:sourceDetails[0]?.name||g.head.source,
      tiers:[...g.tiers],
      hupuDongqiudiMatched:Boolean(dongqiudi&&hupu),
      platformExclusiveSource,
      platformExclusiveAt,
      eventKey:g.eventKey,
      firstSeenAt,
      lastSeenAt,
      members
    };
  });
}
