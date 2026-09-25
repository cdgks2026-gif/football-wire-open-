import {JSDOM} from "jsdom";

function xml(v){
  return String(v??"").replace(/[<>&'"]/g,c=>({"<":"&lt;",">":"&gt;","&":"&amp;","'":"&apos;",'"':"&quot;"}[c]));
}
function getPath(obj,path){
  if(!path)return obj;
  return String(path).split(".").filter(Boolean).reduce((v,k)=>v==null?undefined:v[k],obj);
}
function xpathString(doc,node,path){
  if(!path)return "";
  try{
    const r=doc.evaluate(path,node,null,doc.defaultView.XPathResult.STRING_TYPE,null);
    return String(r.stringValue||"").trim();
  }catch{return""}
}
async function jsonItems(source){
  const res=await fetch(source.url,{headers:source.headers||{},signal:AbortSignal.timeout(Number(source.timeoutMs||7000))});
  if(!res.ok)throw new Error("json source "+res.status);
  const data=await res.json();
  const list=getPath(data,source.itemsPath)||[];
  if(!Array.isArray(list))return[];
  return list.slice(0,Number(source.limit||100)).map((item,i)=>({
    id:String(getPath(item,source.idPath)||getPath(item,source.urlPath)||i),
    title:String(getPath(item,source.titlePath)||"").trim(),
    url:String(getPath(item,source.urlPath)||source.url||""),
    date:String(getPath(item,source.datePath)||new Date().toISOString()),
    content:String(getPath(item,source.contentPath)||"").trim()
  })).filter(x=>x.title);
}
async function xpathItems(source){
  const res=await fetch(source.url,{headers:{"user-agent":"Mozilla/5.0 (compatible; LuBaiFootball/1.0)",...(source.headers||{})},signal:AbortSignal.timeout(Number(source.timeoutMs||7000))});
  if(!res.ok)throw new Error("xpath source "+res.status);
  const html=await res.text();
  const dom=new JSDOM(html,{url:source.url});
  const doc=dom.window.document;
  const snap=doc.evaluate(source.itemXpath||"//article",doc,null,dom.window.XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,null);
  const out=[];
  for(let i=0;i<snap.snapshotLength&&i<Number(source.limit||100);i++){
    const node=snap.snapshotItem(i);
    const title=xpathString(doc,node,source.titleXpath||".//h1/text()|.//h2/text()|.//h3/text()");
    let url=xpathString(doc,node,source.urlXpath||"string(.//a[1]/@href)");
    try{url=new URL(url,source.url).href}catch{}
    const date=xpathString(doc,node,source.dateXpath||"string(.//time[1]/@datetime)")||new Date().toISOString();
    const content=xpathString(doc,node,source.contentXpath||"string(.)");
    if(title)out.push({id:url||String(i),title,url,date,content});
  }
  return out;
}
export function isPluginSource(source){return ["json","xpath"].includes(source?.type)}
export async function renderPluginRss(source){
  let items=[];
  if(source.type==="json")items=await jsonItems(source);
  else if(source.type==="xpath")items=await xpathItems(source);
  else throw new Error("unsupported plugin type");
  const base=process.env.PUBLIC_URL||"https://football-wire-production.up.railway.app";
  const body=items.map(x=>'<item><guid isPermaLink="false">'+xml(x.id)+'</guid><title>'+xml(x.title)+'</title><link>'+xml(x.url)+'</link><pubDate>'+xml(new Date(x.date).toUTCString())+'</pubDate><description><![CDATA['+String(x.content||"").replace(/]]>/g,"] ]>")+']]></description></item>').join("");
  return '<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>'+xml(source.name)+'</title><link>'+xml(source.url||base)+'</link><description>LuBai source adapter</description>'+body+'</channel></rss>';
}
