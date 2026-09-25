import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";

const DEFAULT_TTL=30*60_000;
const MAX_HTML_BYTES=1_500_000;

function validHttpUrl(value){
  try{
    const u=new URL(String(value||""));
    return u.protocol==="http:"||u.protocol==="https:";
  }catch{return false}
}

function trimCache(cache,max=320){
  const entries=Object.entries(cache||{});
  if(entries.length<=max)return cache||{};
  entries.sort((a,b)=>(b[1]?.at||0)-(a[1]?.at||0));
  return Object.fromEntries(entries.slice(0,max));
}

export async function extractReadableArticle(url,cache={},opts={}){
  if(!validHttpUrl(url))return {ok:false,reason:"bad-url"};
  const ttl=Number(opts.ttl||DEFAULT_TTL);
  const hit=cache[url];
  if(hit?.at && Date.now()-hit.at<ttl)return hit;

  const result={ok:false,at:Date.now(),url,reason:"unknown"};
  try{
    const res=await fetch(url,{
      redirect:"follow",
      headers:{
        "user-agent":"Mozilla/5.0 (compatible; LuBaiFootball/1.0; +https://football-wire-production.up.railway.app/)",
        "accept":"text/html,application/xhtml+xml"
      },
      signal:AbortSignal.timeout(Number(opts.timeout||5500))
    });
    if(!res.ok){
      result.reason=`http-${res.status}`;
      cache[url]=result;
      return result;
    }

    const type=String(res.headers.get("content-type")||"");
    if(!/text\/html|application\/xhtml\+xml/i.test(type)){
      result.reason="not-html";
      cache[url]=result;
      return result;
    }

    const len=Number(res.headers.get("content-length")||0);
    if(len>MAX_HTML_BYTES){
      result.reason="too-large";
      cache[url]=result;
      return result;
    }

    let html=await res.text();
    if(html.length>MAX_HTML_BYTES)html=html.slice(0,MAX_HTML_BYTES);
    const finalUrl=res.url||url;
    const dom=new JSDOM(html,{url:finalUrl});
    const article=new Readability(dom.window.document,{
      charThreshold:120,
      keepClasses:false
    }).parse();

    const text=String(article?.textContent||"").replace(/\s+/g," ").trim();
    const title=String(article?.title||"").replace(/\s+/g," ").trim();
    const excerpt=String(article?.excerpt||"").replace(/\s+/g," ").trim();

    if(!text || text.length<80){
      result.reason="no-article";
      result.finalUrl=finalUrl;
      result.title=title;
      result.excerpt=excerpt;
      cache[url]=result;
      return result;
    }

    Object.assign(result,{
      ok:true,
      reason:"",
      finalUrl,
      title,
      excerpt,
      byline:String(article?.byline||"").trim(),
      siteName:String(article?.siteName||"").trim(),
      text:text.slice(0,12_000),
      length:text.length
    });
  }catch(err){
    result.reason=String(err?.name||err||"fetch-failed").slice(0,120);
  }

  cache[url]=result;
  return result;
}

export function compactArticleCache(cache,max=320){
  return trimCache(cache,max);
}
