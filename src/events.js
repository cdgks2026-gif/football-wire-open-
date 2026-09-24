const ENTITIES = [
  "姆巴佩","亚马尔","哈兰德","梅西","罗纳尔多","贝林厄姆","维尼修斯","萨拉赫","凯恩",
  "佩德里","拉菲尼亚","登贝莱","穆西亚拉","维尔茨","奥利塞","孙兴慜",
  "曼联","皇家马德里","巴塞罗那","曼城","利物浦","阿森纳","切尔西","热刺",
  "拜仁慕尼黑","巴黎圣日耳曼","国际米兰","AC米兰","尤文图斯","马德里竞技","多特蒙德",
  "法国队","英格兰队","西班牙队","葡萄牙队","巴西队","阿根廷队"
];

export function category(title) {
  const t=title||"";
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
  const t=title||"";
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
  const entities=ENTITIES.filter((e)=>title.includes(e)).slice(0,2);
  if (!entities.length) return "";
  return `${entities.join("|")}|${topic(title)}`;
}

function tokens(title) {
  return String(title||"")
    .replace(/官方确认|官方|官宣|突发|重磅|最新|消息|报道|记者|表示|认为/g," ")
    .replace(/[^\u4e00-\u9fa5a-z0-9]+/gi," ")
    .split(/\s+/).filter((x)=>x.length>=2);
}
function similar(a,b) {
  const A=new Set(tokens(a)),B=new Set(tokens(b));
  if (!A.size||!B.size) return false;
  let same=0;for (const x of A) if (B.has(x)) same++;
  return same>=2 && same/Math.min(A.size,B.size)>=0.58;
}
export function sourceWeight(tier) {
  return tier==="官方"?40:tier==="转会专家"?30:tier==="国际媒体"?20:10;
}
export function clusterLatest(items) {
  const sorted=[...items].sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt));
  const groups=[];
  for (const item of sorted) {
    const eKey=eventKey(item.title);
    let group=eKey?groups.find((g)=>g.eventKey===eKey):null;
    if (!group) group=groups.find((g)=>Math.abs(Date.parse(g.head.publishedAt)-Date.parse(item.publishedAt))<36*3600_000 && similar(g.head.title,item.title));
    if (!group) {
      groups.push({eventKey:eKey,head:item,sources:new Set([item.source]),tiers:new Set([item.tier])});
    } else {
      group.sources.add(item.source);group.tiers.add(item.tier);
      const a=Date.parse(item.publishedAt),b=Date.parse(group.head.publishedAt);
      if (a>b || (a===b && sourceWeight(item.tier)>sourceWeight(group.head.tier))) group.head=item;
    }
  }
  return groups.map((g)=>({...g.head,category:category(g.head.title),confirmations:g.sources.size,sources:[...g.sources].slice(0,6),eventKey:g.eventKey}));
}
