import nodemailer from "nodemailer";

function chinaParts(){
  const now=new Date();
  const fmt=new Intl.DateTimeFormat("en-CA",{timeZone:process.env.APP_TIMEZONE||"Asia/Shanghai",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",hour12:false});
  const parts=Object.fromEntries(fmt.formatToParts(now).map(x=>[x.type,x.value]));
  return {date:parts.year+"-"+parts.month+"-"+parts.day,hour:Number(parts.hour||0)};
}
function textDigest(items){
  return items.slice(0,20).map((x,i)=>(i+1)+". "+x.title+" ["+(x.category||"足球")+"] "+(x.confirmations||1)+"源").join("\n");
}
function htmlDigest(items){
  return '<h2>露白足球每日摘要</h2><ol>'+items.slice(0,20).map(x=>'<li><a href="'+(process.env.PUBLIC_URL||"https://football-wire-production.up.railway.app")+'/story/'+encodeURIComponent(x.storyId)+'">'+String(x.title||"").replace(/[<>&"]/g,c=>({"<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;"}[c]))+'</a> <small>'+(x.category||"足球")+' · '+(x.confirmations||1)+'源</small></li>').join("")+'</ol>';
}
async function sendEmail(items,date){
  const host=process.env.SMTP_HOST,to=process.env.DIGEST_TO;
  if(!host||!to)return false;
  const transporter=nodemailer.createTransport({
    host,
    port:Number(process.env.SMTP_PORT||587),
    secure:String(process.env.SMTP_SECURE||"0")==="1",
    auth:process.env.SMTP_USER?{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS||""}:undefined
  });
  const from=process.env.SMTP_FROM||process.env.SMTP_USER||"lubai-football@localhost";
  await transporter.sendMail({from,to,subject:"露白足球每日摘要 "+date,text:textDigest(items),html:htmlDigest(items)});
  return true;
}
async function sendWebhook(items,date){
  const url=process.env.DIGEST_WEBHOOK_URL;
  if(!url)return false;
  const r=await fetch(url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({date,title:"露白足球每日摘要",items:items.slice(0,20).map(x=>({storyId:x.storyId,title:x.title,category:x.category,confirmations:x.confirmations,url:(process.env.PUBLIC_URL||"https://football-wire-production.up.railway.app")+"/story/"+x.storyId}))}),signal:AbortSignal.timeout(6000)});
  return r.ok;
}
export async function maybeSendDailyDigest(state,items=[]){
  const {date,hour}=chinaParts();
  const sendHour=Number(process.env.DIGEST_HOUR||8);
  state.digest=state.digest||{};
  if(hour<sendHour||state.digest.lastDate===date||!items.length)return {sent:false,date,reason:"not-due"};
  const configured=Boolean(process.env.SMTP_HOST&&process.env.DIGEST_TO)||Boolean(process.env.DIGEST_WEBHOOK_URL);
  if(!configured)return {sent:false,date,reason:"not-configured"};
  let email=false,webhook=false;
  try{email=await sendEmail(items,date)}catch(err){state.digest.lastError="email:"+String(err).slice(0,160)}
  try{webhook=await sendWebhook(items,date)}catch(err){state.digest.lastError="webhook:"+String(err).slice(0,160)}
  if(email||webhook){state.digest.lastDate=date;state.digest.lastAt=new Date().toISOString()}
  return {sent:email||webhook,date,email,webhook,error:state.digest.lastError||null};
}
