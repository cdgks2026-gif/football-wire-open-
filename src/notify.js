function important(item){
  return (item.importance||0)>=Number(process.env.NOTIFY_MIN_IMPORTANCE||8)
    || item.exclusive===true || (item.confirmations||0)>=3;
}
async function ntfy(item){
  const url=process.env.NTFY_URL;
  if(!url)return false;
  const r=await fetch(url,{method:"POST",headers:{
    "Title":encodeURIComponent(item.title||"露白足球"),
    "Tags":"soccer_ball,newspaper",
    "Click":item.storyId?`${process.env.PUBLIC_URL||"https://football-wire-production.up.railway.app"}/story/${item.storyId}`:""
  },body:`${item.category||"足球"} · ${item.confirmations||1}源\n${item.title}`,signal:AbortSignal.timeout(5000)});
  return r.ok;
}
async function telegram(item){
  const token=process.env.TELEGRAM_BOT_TOKEN,chat=process.env.TELEGRAM_CHAT_ID;
  if(!token||!chat)return false;
  const url=`https://api.telegram.org/bot${token}/sendMessage`;
  const link=item.storyId?`${process.env.PUBLIC_URL||"https://football-wire-production.up.railway.app"}/story/${item.storyId}`:"";
  const r=await fetch(url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({
    chat_id:chat,text:`⚽ ${item.title}\n${link}`,disable_web_page_preview:true
  }),signal:AbortSignal.timeout(5000)});
  return r.ok;
}
export async function notifyNewImportant(state,items=[]){
  state.notifications=state.notifications||{sent:{}};
  state.notifications.sent=state.notifications.sent||{};
  const sent=state.notifications.sent;
  const candidates=items.filter(important).filter(x=>!sent[x.storyId||x.id]).slice(0,8);
  let delivered=0;
  for(const item of candidates){
    try{
      const results=await Promise.allSettled([ntfy(item),telegram(item)]);
      if(results.some(x=>x.status==="fulfilled"&&x.value))delivered++;
    }catch{}
    sent[item.storyId||item.id]=Date.now();
  }
  const entries=Object.entries(sent).sort((a,b)=>b[1]-a[1]).slice(0,600);
  state.notifications.sent=Object.fromEntries(entries);
  return {candidates:candidates.length,delivered,ntfy:Boolean(process.env.NTFY_URL),telegram:Boolean(process.env.TELEGRAM_BOT_TOKEN&&process.env.TELEGRAM_CHAT_ID)};
}
