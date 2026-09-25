import crypto from "node:crypto";

function sid(value){
  return crypto.createHash("sha1").update(String(value||"")).digest("hex").slice(0,16);
}
function day(value){
  const d=new Date(value||Date.now());
  return Number.isFinite(d.getTime())?d.toISOString().slice(0,10):"unknown";
}
export function assignStoryIds(items=[]){
  return items.map(item=>{
    const members=item.members||[];
    const first=members.map(x=>Date.parse(x.publishedAt||0)).filter(Number.isFinite).sort((a,b)=>a-b)[0];
    const firstDate=day(first||item.firstSeenAt||item.publishedAt);
    const base=item.eventKey||item.aiEventKey||item.title;
    return {...item,storyId:item.storyId||sid(`story|${base}|${firstDate}`)};
  });
}
export function ensureEditor(state){
  state.editor=state.editor||{killed:{},pinned:{},categories:{},merges:{},splits:{}};
  for(const k of ["killed","pinned","categories","merges","splits"])state.editor[k]=state.editor[k]||{};
  return state.editor;
}
export function applyEditorial(items,state){
  const e=ensureEditor(state);
  let out=assignStoryIds(items).filter(x=>!e.killed[x.storyId]);
  out=out.map(x=>e.categories[x.storyId]?{...x,category:e.categories[x.storyId]}:x);

  const splitOut=[];
  for(const item of out){
    const splitMap=e.splits[item.storyId]||{};
    const splitIds=new Set(Object.keys(splitMap).filter(k=>splitMap[k]));
    if(!splitIds.size||!(item.members||[]).length){splitOut.push(item);continue}
    const kept=(item.members||[]).filter(m=>!splitIds.has(String(m.id)));
    if(kept.length){
      splitOut.push({...item,members:kept});
    }
    for(const m of (item.members||[])){
      if(!splitIds.has(String(m.id)))continue;
      splitOut.push({
        ...item,
        storyId:sid(`split|${item.storyId}|${m.id}`),
        id:m.id,
        title:m.title,
        source:m.source,
        tier:m.tier,
        publishedAt:m.publishedAt,
        category:m.category||item.category,
        url:m.url||"",
        contentExcerpt:m.contentExcerpt||"",
        confirmations:1,
        sources:[m.source],
        sourceDetails:[{name:m.source,score:m.sourceScore||0,firstPublishedAt:m.publishedAt,firstTitle:m.title,timeReliable:true}],
        members:[m],
        firstSeenAt:m.publishedAt,
        lastSeenAt:m.publishedAt,
        exclusive:false,
        platformExclusiveSource:"",
        platformExclusiveAt:""
      });
    }
  }
  out=splitOut;

  const byId=new Map(out.map(x=>[x.storyId,x]));
  for(const [from,to] of Object.entries(e.merges)){
    const a=byId.get(from),b=byId.get(to);
    if(!a||!b||from===to)continue;
    const sources=[...(b.sourceDetails||[]),...(a.sourceDetails||[])];
    const sourceMap=new Map();
    for(const src of sources){
      const old=sourceMap.get(src.name);
      if(!old||(src.score||0)>(old.score||0))sourceMap.set(src.name,src);
    }
    const merged={
      ...b,
      confirmations:sourceMap.size,
      sourceDetails:[...sourceMap.values()].sort((x,y)=>(y.score||0)-(x.score||0)).slice(0,12),
      sources:[...sourceMap.keys()].slice(0,12),
      members:[...(b.members||[]),...(a.members||[])].slice(0,30),
      firstSeenAt:[b.firstSeenAt,a.firstSeenAt].filter(Boolean).sort()[0]||b.firstSeenAt,
      lastSeenAt:[b.lastSeenAt,a.lastSeenAt].filter(Boolean).sort().reverse()[0]||b.lastSeenAt
    };
    byId.set(to,merged);byId.delete(from);
  }
  out=[...byId.values()];
  out.sort((a,b)=>{
    const pa=e.pinned[a.storyId]?1:0,pb=e.pinned[b.storyId]?1:0;
    if(pa!==pb)return pb-pa;
    return (b._rankScore||0)-(a._rankScore||0) || Date.parse(b.publishedAt)-Date.parse(a.publishedAt);
  });
  return out;
}
export function editStory(state,{action,storyId,value}){
  const e=ensureEditor(state);
  if(!storyId)return false;
  if(action==="kill")e.killed[storyId]=true;
  else if(action==="unkill")delete e.killed[storyId];
  else if(action==="pin")e.pinned[storyId]=true;
  else if(action==="unpin")delete e.pinned[storyId];
  else if(action==="category"){
    if(value)e.categories[storyId]=String(value);else delete e.categories[storyId];
  }else if(action==="merge"){
    if(value)e.merges[storyId]=String(value);else delete e.merges[storyId];
  }else if(action==="split"){
    const memberId=String(value||"");
    if(!memberId)return false;
    e.splits[storyId]=e.splits[storyId]||{};
    e.splits[storyId][memberId]=true;
  }else if(action==="unsplit"){
    const memberId=String(value||"");
    if(e.splits[storyId])delete e.splits[storyId][memberId];
  }else return false;
  return true;
}
