import crypto from "node:crypto";
import { getStory as getStoredStory, searchStories, getSnapshot, listSnapshots, storeStatus, saveOverride } from "./store.js";
import { teamContext, matchesAround, standings, leagueOptions, leaguePageData, matchByKey, matchKey, displayTeamName } from "./matches.js";
import { ensureEditor, editStory, applyEditorial } from "./editor.js";
import { summarizeDailyBrief } from "./ai.js";

function esc(value){
  return String(value??"").replace(/[&<>"']/g,(ch)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
}
function ago(value){
  const t=Date.parse(value||"");
  if(!Number.isFinite(t))return "";
  const m=Math.max(0,Math.round((Date.now()-t)/60000));
  if(m<60)return m+"分钟前";
  const h=Math.round(m/60);
  if(h<24)return h+"小时前";
  return Math.round(h/24)+"天前";
}
function localDateKey(){
  try{
    return new Intl.DateTimeFormat("en-CA",{timeZone:process.env.APP_TIMEZONE||"Asia/Shanghai",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  }catch{return new Date().toISOString().slice(0,10)}
}
function shell(title,body,description=""){
  return '<!doctype html><html lang="zh-CN"><head>'
    +'<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    +'<title>'+esc(title)+'｜露白足球</title>'
    +'<meta name="description" content="'+esc(description||title)+'">'
    +'<link rel="manifest" href="/manifest.webmanifest"><meta name="theme-color" content="#06100c">'
    +'<style>*{box-sizing:border-box}body{margin:0;background:#06100c;color:#f3f8f5;font-family:system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif}'
    +'main{width:min(1000px,calc(100% - 24px));margin:auto;padding:22px 0 50px}a{color:#63e7a1;text-underline-offset:3px}'
    +'.top{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:18px}.top a{padding:7px 10px;border:1px solid #233b31;border-radius:9px;text-decoration:none;color:#b7c9c0}'
    +'.card{border:1px solid #233b31;background:#0c1813;border-radius:13px;padding:14px;margin:10px 0}.muted{color:#91a59c;font-size:12px}.big{font-size:24px;font-weight:800;line-height:1.35}'
    +'.badge{display:inline-block;border:1px solid #345546;border-radius:999px;padding:3px 7px;margin:2px 4px 2px 0;font-size:11px;color:#b8cdc2}'
    +'.timeline{border-left:2px solid #29483a;margin-left:8px;padding-left:16px}.timeline .row{margin:14px 0}'
    +'table{width:100%;border-collapse:collapse;font-size:13px}th,td{border-bottom:1px solid #233b31;padding:8px;text-align:left}'
    +'input,select,button{background:#0c1813;color:#f3f8f5;border:1px solid #345546;border-radius:8px;padding:8px}button{cursor:pointer}.danger{border-color:#8a3e3e;color:#ffaaa0}.good{border-color:#2f7656;color:#8cf0b8}'
    +'.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:10px}@media(max-width:650px){.big{font-size:20px}table{font-size:11px}}</style>'
    +'</head><body><main><div class="top"><a href="/">首页</a><a href="/search">历史搜索</a><a href="/archive">每日归档</a><a href="/matches">赛程与积分榜</a><a href="/digest">24小时摘要</a><a href="/sources">来源健康</a><a href="/feed.xml">RSS</a><a href="/topics">专题</a><a href="/transfers">转会中心</a><a href="/injuries">伤停中心</a><a href="/entities">球队/球员</a><a href="/trends">趋势</a><a href="/relations">关系图</a><a href="/hot">热点榜</a><a href="/leagues">联赛</a></div>'
    +body+'<script src="/app.js" defer></script></main></body></html>';
}
function adminAllowed(req){
  const configured=String(process.env.ADMIN_TOKEN||"");
  if(!configured)return false;
  const supplied=String(req.query.token||req.body?.token||req.headers["x-admin-token"]||"");
  if(!supplied||supplied.length!==configured.length)return false;
  try{return crypto.timingSafeEqual(Buffer.from(supplied),Buffer.from(configured))}catch{return false}
}

export function registerFeatureRoutes(app,ctx){
  const getState=ctx.getState;
  const saveState=ctx.saveState;
  const maxVisible=ctx.maxVisible||250;

  app.get("/story/:id",async(req,res)=>{
    const state=getState();
    const id=String(req.params.id||"");
    let story=state.stories?.[id]||null;
    if(!story)story=await getStoredStory(id).catch(()=>null);
    if(!story)return res.status(404).send(shell("未找到故事",'<div class="card">这个故事不存在或已经被删除。</div>'));
    const versions=story.versions||story.history||[];
    const members=story.members||[];
    const context=await teamContext([story.title,...members.map(x=>x.title)].join(" ")).catch(()=>[]);
    const sourceBadges=(story.sources||[]).map(x=>'<span class="badge">'+esc(x)+'</span>').join("");
    const tagBadges=(story.aiTags||[]).map(x=>'<span class="badge">'+esc(x)+'</span>').join("");
    const timeline=(versions.length?versions:members).map(v=>'<div class="row"><div class="muted">'+esc(new Date(v.publishedAt||v.recordedAt||0).toLocaleString("zh-CN"))+'</div><div>'+esc(v.title||"")+'</div></div>').join("");
    const reports=members.map(m=>'<tr><td>'+esc(new Date(m.publishedAt||0).toLocaleString("zh-CN"))+'</td><td>'+esc(m.source||"")+'</td><td>'+(m.url?'<a href="'+esc(m.url)+'" target="_blank" rel="noopener">'+esc(m.title)+'</a>':esc(m.title))+'</td></tr>').join("");
    const contextHtml=context.map(c=>'<div class="card"><strong>'+esc(displayTeamName(c.team))+'</strong><div class="muted">最近比赛 / 下一场</div>'+[...(c.previous||[]),...(c.next||[])].map(m=>'<div>'+esc(m.date)+' · '+esc(displayTeamName(m.team1))+' '+(m.ft?esc(m.ft.join("-")):"vs")+' '+esc(displayTeamName(m.team2))+' · '+esc(m.leagueName||"")+'</div>').join("")+'</div>').join("");
    let body='<div class="card"><div class="muted">'+esc(story.category||"综合")+' · '+(story.confirmations||0)+' 个来源 · 首次 '+esc(new Date(story.firstSeenAt||story.publishedAt||0).toLocaleString("zh-CN"))+'</div><div class="big">'+esc(story.title)+'</div><div>'+sourceBadges+tagBadges+'</div></div>';
    const publicUrl=(process.env.PUBLIC_URL||"https://football-wire-production.up.railway.app").replace(/\/$/,"");
    const structured={
      "@context":"https://schema.org",
      "@type":"NewsArticle",
      headline:String(story.title||"").slice(0,110),
      datePublished:story.firstSeenAt||story.publishedAt||undefined,
      dateModified:story.lastSeenAt||story.publishedAt||undefined,
      mainEntityOfPage:publicUrl+"/story/"+encodeURIComponent(id),
      publisher:{"@type":"Organization",name:"露白足球",url:publicUrl},
      about:(story.aiTags||[]).slice(0,8).map(name=>({"@type":"Thing",name}))
    };
    body+='<script type="application/ld+json">'+JSON.stringify(structured).replace(/<\//g,"<\\/")+'</script>';

    if(contextHtml)body+='<h2>比赛上下文</h2><div class="grid">'+contextHtml+'</div>';
    const relatedPool=[...(state.allEligible||state.latest||[]),...(state.reportLatest||[])];
    const tagSet=new Set((story.aiTags||[]).map(x=>String(x).toLowerCase()));
    const related=relatedPool.filter(x=>(x.storyId||x.id)!==id).map(x=>{
      const tags=(x.aiTags||[]).map(v=>String(v).toLowerCase());
      let score=0; for(const t of tags)if(tagSet.has(t))score+=3;
      if(story.category&&x.category===story.category)score+=1;
      if(story.eventKey&&x.eventKey&&String(story.eventKey)===String(x.eventKey))score+=5;
      return {x,score};
    }).filter(r=>r.score>0).sort((a,b)=>b.score-a.score||Date.parse(b.x.publishedAt||0)-Date.parse(a.x.publishedAt||0)).slice(0,6);
    if(related.length)body+='<h2>相关新闻推荐</h2>'+related.map(({x,score})=>'<div class="card"><div class="muted">关联度 '+score+' · '+esc(x.category||"综合")+' · '+esc(ago(x.publishedAt))+'</div><a class="big" href="/story/'+encodeURIComponent(x.storyId||x.id)+'">'+esc(x.title)+'</a></div>').join("");

    body+='<h2>事件时间线</h2><div class="card timeline">'+(timeline||'<div class="muted">暂无历史版本。</div>')+'</div>';
    body+='<h2>相关报道</h2><div class="card"><table><thead><tr><th>时间</th><th>来源</th><th>标题</th></tr></thead><tbody>'+(reports||'<tr><td colspan="3">暂无成员明细</td></tr>')+'</tbody></table></div>';
    res.set("Cache-Control","no-store");res.send(shell(story.title,body,story.title));
  });

  app.get("/search",async(req,res)=>{
    const state=getState();
    const q=String(req.query.q||"").trim();
    const semantic=String(req.query.semantic||"1")!=="0";
    let results=[];
    if(q)results=await searchStories(q,{limit:80,semantic}).catch(()=>[]);
    if(q&&!results.length){
      results=Object.values(state.stories||{}).filter(x=>(String(x.title||"")+" "+String(x.eventKey||"")+" "+(x.sources||[]).join(" ")).includes(q)).slice(0,80);
    }
    const rows=results.map(x=>'<div class="card"><div class="muted">'+esc(x.category||"")+' · '+(x.confirmations||0)+'源 · '+esc(ago(x.publishedAt))+(x.similarity!=null?' · 相似度 '+Math.round(x.similarity*100)+'%':'')+'</div><a class="big" href="/story/'+encodeURIComponent(x.storyId)+'">'+esc(x.title)+'</a></div>').join("");
    const checked=semantic?"checked":"";
    const body='<h1>历史 / 语义搜索</h1><form method="get"><input name="q" value="'+esc(q)+'" placeholder="搜索球队、球员、事件，例如：热刺 主帅" style="width:min(600px,75%)"><label><input type="checkbox" name="semantic" value="1" '+checked+'> 向量相似搜索</label><button>搜索</button></form>'
      +'<div class="muted">历史库：'+(storeStatus().enabled?"PostgreSQL":"本地缓存")+' · pgvector：'+(storeStatus().vector?"可用":"降级模式")+'</div>'
      +(q?(rows||'<div class="card">没有找到匹配故事。</div>'):'<div class="card">输入关键词开始搜索。支持长期历史库与可选 pgvector 相似检索。</div>');
    res.send(shell("历史/语义搜索",body));
  });

  app.get("/archive",async(_req,res)=>{
    const state=getState();
    let dates=await listSnapshots(120).catch(()=>[]);
    if(!dates.length)dates=Object.keys(state.snapshots||{}).sort().reverse().map(d=>({snapshot_date:d,count:(state.snapshots[d]||[]).length}));
    const rows=dates.map(x=>{const d=String(x.snapshot_date).slice(0,10);return '<div class="card"><a class="big" href="/archive/'+d+'">'+esc(d)+'</a><div class="muted">'+(x.count||0)+' 条主要故事</div></div>'}).join("");
    res.send(shell("每日足球档案",'<h1>每日足球档案</h1><p class="muted">按天保存当时的主要新闻排序，便于回看某一天发生了什么。</p>'+(rows||'<div class="card">快照将在同步后自动生成。</div>')));
  });

  app.get("/archive/:date",async(req,res)=>{
    const state=getState();
    const date=String(req.params.date||"").slice(0,10);
    let snap=state.snapshots?.[date]||null;
    if(!snap){const db=await getSnapshot(date).catch(()=>null);snap=db?.payload||null}
    if(!snap)return res.status(404).send(shell("未找到快照",'<div class="card">该日期暂无历史快照。</div>'));
    const rows=snap.map(x=>'<div class="card"><div class="muted">'+esc(x.category||"")+' · '+(x.confirmations||0)+'源</div><a class="big" href="/story/'+encodeURIComponent(x.storyId)+'">'+esc(x.title)+'</a></div>').join("");
    res.send(shell(date+" 足球档案",'<h1>'+esc(date)+' 足球档案</h1>'+rows));
  });

  app.get("/matches",async(req,res)=>{
    res.set("Cache-Control","no-store, no-cache, must-revalidate, max-age=0");
    res.set("Pragma","no-cache");
    const date=String(req.query.date||localDateKey()).slice(0,10);
    const league=String(req.query.league||"epl");
    const [matches,table]=await Promise.all([matchesAround(date,3),standings(league)]);
    const leagues=leagueOptions();
    const matchRows=matches.map(m=>'<tr><td>'+esc(m.date)+'</td><td><a href="/league/'+esc(m.league)+'">'+esc(m.leagueName)+'</a></td><td>'+esc(displayTeamName(m.team1))+'</td><td><a href="/match/'+matchKey(m)+'">'+(m.ft?esc(m.ft.join("-")):"vs")+'</a></td><td>'+esc(displayTeamName(m.team2))+'</td></tr>').join("");
    const tableRows=table.map((r,i)=>'<tr><td>'+(i+1)+'</td><td>'+esc(displayTeamName(r.team))+'</td><td>'+r.p+'</td><td>'+r.w+'</td><td>'+r.d+'</td><td>'+r.l+'</td><td>'+r.gd+'</td><td><strong>'+r.pts+'</strong></td></tr>').join("");
    const opts=leagues.map(l=>'<option value="'+l.id+'" '+(l.id===league?"selected":"")+'>'+l.name+'</option>').join("");
    const body='<h1>赛程与积分榜</h1><form method="get"><input type="date" name="date" value="'+esc(date)+'"><select name="league">'+opts+'</select><button>查看</button></form>'
      +'<p class="muted">比赛数据来自 OpenFootball 公共数据集；用于新闻上下文和历史查询，不作为官方实时比分源。</p>'
      +'<h2>前后 3 天比赛</h2><div class="card"><table><thead><tr><th>日期</th><th>联赛</th><th>主队</th><th>比分</th><th>客队</th></tr></thead><tbody>'+(matchRows||'<tr><td colspan="5">暂无比赛</td></tr>')+'</tbody></table></div>'
      +'<h2>'+esc(leagues.find(x=>x.id===league)?.name||league)+'积分榜</h2><div class="card"><table><thead><tr><th>#</th><th>球队</th><th>场</th><th>胜</th><th>平</th><th>负</th><th>净胜</th><th>分</th></tr></thead><tbody>'+tableRows+'</tbody></table></div>';
    res.send(shell("赛程与积分榜",body));
  });



  app.get("/hot",(req,res)=>{
    res.set("Cache-Control","no-store, no-cache, must-revalidate, max-age=0");
    res.set("Pragma","no-cache");
    const state=getState();
    const hours=Math.max(1,Math.min(168,Number(req.query.hours||24)));
    const cutoff=Date.now()-hours*3600_000;
    const items=[...(state.allEligible||state.latest||[]),...(state.reportLatest||[])]
      .filter(x=>Date.parse(x.publishedAt||0)>=cutoff)
      .map(x=>({...x,_hot:(x.importance||0)*12+(x.confirmations||0)*18+Math.min(50,x.heat||0)}))
      .sort((a,b)=>b._hot-a._hot||Date.parse(b.publishedAt||0)-Date.parse(a.publishedAt||0)).slice(0,50);
    const rows=items.map((x,i)=>'<div class="card"><div class="muted">#'+(i+1)+' · 热度 '+x._hot+' · '+esc(x.category||"综合")+' · '+(x.confirmations||0)+'源</div><a class="big" href="/story/'+encodeURIComponent(x.storyId||x.id)+'">'+esc(x.title)+'</a></div>').join("");
    res.send(shell(hours+"小时热点榜",'<h1>'+hours+'小时热点榜</h1><p><a href="/hot?hours=24">24小时</a> · <a href="/hot?hours=168">7天</a></p><p class="muted">由重要度、多源确认、热度和时间综合排序。</p>'+(rows||'<div class="card">当前周期暂无新闻。</div>')));
  });

  app.get("/leagues",(_req,res)=>{
    res.set("Cache-Control","no-store, no-cache, must-revalidate, max-age=0");
    res.set("Pragma","no-cache");
    const cards=leagueOptions().map(l=>'<a class="card" style="display:block;text-decoration:none" href="/league/'+esc(l.id)+'"><div class="big">'+esc(l.name)+'</div><div class="muted">积分榜 · 近期赛果 · 下一轮赛程</div></a>').join("");
    res.send(shell("五大联赛","<h1>五大联赛</h1><div class=\"grid\">"+cards+"</div>"));
  });

  app.get("/league/:id",async(req,res)=>{
    res.set("Cache-Control","no-store, no-cache, must-revalidate, max-age=0");
    res.set("Pragma","no-cache");
    const data=await leaguePageData(String(req.params.id||"")).catch(()=>null);
    if(!data)return res.status(404).send(shell("未找到联赛",'<div class="card">暂不支持这个联赛。</div>'));
    const table=data.table.map((r,i)=>'<tr><td>'+(i+1)+'</td><td><a href="/entity/'+encodeURIComponent(displayTeamName(r.team))+'">'+esc(displayTeamName(r.team))+'</a></td><td>'+r.p+'</td><td>'+r.w+'</td><td>'+r.d+'</td><td>'+r.l+'</td><td>'+r.gd+'</td><td><strong>'+r.pts+'</strong></td></tr>').join("");
    const recent=data.recent.map(m=>'<div class="card"><div class="muted">'+esc(m.date)+'</div><a href="/match/'+matchKey(m)+'">'+esc(displayTeamName(m.team1))+' '+esc((m.ft||["",""]).join("-"))+' '+esc(displayTeamName(m.team2))+'</a></div>').join("");
    const next=data.upcoming.map(m=>'<div class="card"><div class="muted">'+esc(m.date)+'</div><a href="/match/'+matchKey(m)+'">'+esc(displayTeamName(m.team1))+' vs '+esc(displayTeamName(m.team2))+'</a></div>').join("");
    const body='<h1>'+esc(data.name)+'</h1><p class="muted">'+esc(data.title||"")+'</p><div class="grid"><div><h2>近期赛果</h2>'+recent+'</div><div><h2>下一轮赛程</h2>'+next+'</div></div><h2>积分榜</h2><div class="card"><table><tr><th>#</th><th>球队</th><th>场</th><th>胜</th><th>平</th><th>负</th><th>净胜</th><th>分</th></tr>'+table+'</table></div>';
    res.send(shell(data.name,body,data.name+"赛程、赛果与积分榜"));
  });

  app.get("/match/:key",async(req,res)=>{
    res.set("Cache-Control","no-store, no-cache, must-revalidate, max-age=0");
    res.set("Pragma","no-cache");
    const m=await matchByKey(String(req.params.key||"")).catch(()=>null);
    if(!m)return res.status(404).send(shell("未找到比赛",'<div class="card">这场比赛不存在或暂未载入。</div>'));
    const state=getState(),needle=[m.team1,m.team2].join(" ").toLowerCase();
    const news=[...(state.allEligible||state.latest||[]),...(state.reportLatest||[])].filter(x=>{
      const h=storyHay(x).toLowerCase(); return h.includes(String(m.team1).toLowerCase())||h.includes(String(m.team2).toLowerCase());
    }).slice(0,16);
    const newsHtml=news.map(x=>'<div class="card"><div class="muted">'+esc(x.category||"综合")+' · '+esc(ago(x.publishedAt))+'</div><a class="big" href="/story/'+encodeURIComponent(x.storyId||x.id)+'">'+esc(x.title)+'</a></div>').join("");
    const score=m.ft?esc(m.ft.join(" - ")):"vs";
    res.send(shell(m.team1+" "+score+" "+m.team2,'<h1>'+esc(displayTeamName(m.team1))+' '+score+' '+esc(displayTeamName(m.team2))+'</h1><div class="card"><div>'+esc(m.date)+' · <a href="/league/'+esc(m.league)+'">'+esc(m.leagueName)+'</a></div></div><h2>相关新闻</h2>'+(newsHtml||'<div class="card">暂无相关报道。</div>')));
  });

  app.get("/digest",async(_req,res)=>{
    const state=getState();
    const cutoff=Date.now()-24*3600_000;
    const items=(state.allEligible||state.latest||[])
      .filter(x=>Date.parse(x.publishedAt||0)>=cutoff)
      .sort((a,b)=>(b.importance||0)-(a.importance||0) || (b.confirmations||0)-(a.confirmations||0) || Date.parse(b.publishedAt||0)-Date.parse(a.publishedAt||0))
      .slice(0,40);
    const groups=new Map();
    for(const x of items){
      const key=x.category||"综合";
      if(!groups.has(key))groups.set(key,[]);
      groups.get(key).push(x);
    }
    const body=[...groups.entries()].map(([cat,list])=>'<h2>'+esc(cat)+'</h2>'+list.map(x=>'<div class="card"><div class="muted">'+esc(ago(x.publishedAt))+' · '+(x.confirmations||0)+'源 · 重要度 '+(x.importance||0)+'</div><a class="big" href="/story/'+encodeURIComponent(x.storyId||x.id)+'">'+esc(x.title)+'</a><div class="muted">'+esc((x.sources||[x.source]).filter(Boolean).join(" · "))+'</div></div>').join("")).join("");
    res.set("Cache-Control","public, max-age=60, stale-while-revalidate=180");
    res.send(shell("24小时足球摘要",'<h1>24小时足球摘要</h1><p class="muted">按重要度、多源确认和时间排序，自动汇总最近24小时的主要足球事件。</p>'+(body||'<div class="card">最近24小时暂无可展示新闻。</div>')));
  });

  app.get("/sources",async(_req,res)=>{
    const state=getState();
    const stats=state.metrics?.filterStatsBySource||{};
    const raw=state.sourceHealth?.rawBySource||{};
    const accepted=state.sourceHealth?.acceptedBySource||{};
    const names=[...new Set([...Object.keys(raw),...Object.keys(stats),...Object.keys(accepted)])].sort((a,b)=>(raw[b]||0)-(raw[a]||0)||a.localeCompare(b,"zh-CN"));
    const rows=names.map(name=>{
      const st=stats[name]||{};
      const r=raw[name]||st.raw||0,a=accepted[name]||st.accepted||0;
      const rate=r?Math.round(a/r*100):0;
      return '<tr><td>'+esc(name)+'</td><td>'+r+'</td><td>'+a+'</td><td>'+rate+'%</td><td>'+(st.commercial||0)+'</td><td>'+(st.lowInfo||0)+'</td><td>'+(st.nonFootball||0)+'</td><td>'+(st.junk||0)+'</td></tr>';
    }).join("");
    const m=state.metrics||{};
    const summary='<div class="grid"><div class="card"><div class="muted">当前主新闻</div><div class="big">'+(m.visibleEvents||0)+'</div></div><div class="card"><div class="muted">商业过滤</div><div class="big">'+(m.commercialFiltered||0)+'</div></div><div class="card"><div class="muted">非足球过滤</div><div class="big">'+(m.nonFootballFiltered||0)+'</div></div><div class="card"><div class="muted">空泛/栏目过滤</div><div class="big">'+(m.lowInformationFiltered||0)+'</div></div></div>';
    const table='<div class="card"><table><thead><tr><th>来源</th><th>原始</th><th>收录</th><th>收录率</th><th>商业</th><th>低信息</th><th>非足球</th><th>垃圾</th></tr></thead><tbody>'+rows+'</tbody></table></div>';
    res.set("Cache-Control","public, max-age=30, stale-while-revalidate=120");
    res.send(shell("来源健康",'<h1>来源健康</h1><p class="muted">用于检查哪些来源有内容、哪些来源被商品页或非足球噪音污染，以及各来源实际收录率。</p>'+summary+table));
  });


  function allStories(state){
    return [...(state.allEligible||state.latest||[]),...(state.reportLatest||[])];
  }
  function storyHay(x){
    return [x.title,x.eventKey,...(x.aiTags||[]),...(x.sources||[])].filter(Boolean).join(" ");
  }
  function entityCandidates(state){
    const stop=new Set(["转会","伤停","比赛","国家队","争议","趣闻","教练","球星","综合","官方","英超","西甲","意甲","德甲","法甲","欧冠","欧联","VAR"]);
    const map=new Map();
    for(const x of allStories(state).slice(0,1000)){
      const tags=(x.aiTags||[]).filter(t=>t&&String(t).length<=24&&!stop.has(String(t)));
      for(const tag of tags){
        const name=String(tag).trim(); if(!name)continue;
        if(!map.has(name))map.set(name,{name,count:0,lastAt:null,categories:new Set()});
        const row=map.get(name); row.count++; row.categories.add(x.category||"综合");
        if(!row.lastAt||Date.parse(x.publishedAt||0)>Date.parse(row.lastAt||0))row.lastAt=x.publishedAt;
      }
    }
    return [...map.values()].map(x=>({...x,categories:[...x.categories]})).sort((a,b)=>b.count-a.count||Date.parse(b.lastAt||0)-Date.parse(a.lastAt||0));
  }
  function centerPage(state,title,description,filter){
    const items=allStories(state).filter(filter).sort((a,b)=>(b.importance||0)-(a.importance||0)||Date.parse(b.publishedAt||0)-Date.parse(a.publishedAt||0)).slice(0,100);
    const cards=items.map(x=>'<div class="card"><div class="muted">'+esc(x.category||"")+' · '+(x.confirmations||0)+'源 · '+esc(ago(x.publishedAt))+'</div><a class="big" href="/story/'+encodeURIComponent(x.storyId||x.id)+'">'+esc(x.title)+'</a><div class="muted">'+esc((x.sources||[x.source]).filter(Boolean).join(" · "))+'</div></div>').join("");
    return shell(title,'<h1>'+esc(title)+'</h1><p class="muted">'+esc(description)+'</p>'+(cards||'<div class="card">当前暂无匹配内容。</div>'),description);
  }

  app.get("/transfers",(_req,res)=>{
    res.set("Cache-Control","no-store, no-cache, must-revalidate, max-age=0");
    res.set("Pragma","no-cache");
    const state=getState();
    res.send(centerPage(state,"转会中心","集中展示加盟、离队、租借、续约、报价、谈判、体检、合同等转会事件。",x=>x.category==="转会"||/(转会|加盟|离队|租借|续约|报价|谈判|体检|合同|签约|Here we go)/i.test(storyHay(x))));
  });

  app.get("/injuries",(_req,res)=>{
    res.set("Cache-Control","no-store, no-cache, must-revalidate, max-age=0");
    res.set("Pragma","no-cache");
    const state=getState();
    res.send(centerPage(state,"伤停中心","集中展示受伤、伤缺、复出、手术、停赛、禁赛等球队人员可用性事件。",x=>x.category==="伤停"||/(受伤|伤缺|缺席|复出|手术|停赛|禁赛|赛季报销|injur|suspend|ban)/i.test(storyHay(x))));
  });

  app.get("/topics",(_req,res)=>{
    res.set("Cache-Control","no-store, no-cache, must-revalidate, max-age=0");
    res.set("Pragma","no-cache");
    const state=getState();
    const topics=new Map();
    for(const x of allStories(state).slice(0,500)){
      const keys=[...(x.aiTags||[])];
      if(x.category)keys.push(x.category);
      for(const k of keys){
        const name=String(k||"").trim(); if(!name||name.length>30)continue;
        if(!topics.has(name))topics.set(name,{name,count:0,importance:0});
        const t=topics.get(name); t.count++; t.importance+=x.importance||0;
      }
    }
    const rows=[...topics.values()].filter(x=>x.count>=2).sort((a,b)=>b.count-a.count||b.importance-a.importance).slice(0,80)
      .map(x=>'<a class="card" style="display:block;text-decoration:none" href="/topic/'+encodeURIComponent(x.name)+'"><div class="big">'+esc(x.name)+'</div><div class="muted">'+x.count+' 条相关事件</div></a>').join("");
    res.send(shell("自动专题",'<h1>自动专题</h1><p class="muted">根据新闻分类和 AI 标签自动生成专题入口，随新闻库变化更新。</p><div class="grid">'+(rows||'<div class="card">专题正在生成。</div>')+'</div>'));
  });

  app.get("/topic/:name",(req,res)=>{
    res.set("Cache-Control","no-store, no-cache, must-revalidate, max-age=0");
    res.set("Pragma","no-cache");
    const state=getState(),name=decodeURIComponent(String(req.params.name||"")).slice(0,60);
    const q=name.toLowerCase();
    const items=allStories(state).filter(x=>storyHay(x).toLowerCase().includes(q)).sort((a,b)=>Date.parse(b.publishedAt||0)-Date.parse(a.publishedAt||0)).slice(0,120);
    const cards=items.map(x=>'<div class="card"><div class="muted">'+esc(x.category||"")+' · '+esc(ago(x.publishedAt))+' · '+(x.confirmations||0)+'源</div><a class="big" href="/story/'+encodeURIComponent(x.storyId||x.id)+'">'+esc(x.title)+'</a></div>').join("");
    res.send(shell(name+" 专题",'<h1>'+esc(name)+'</h1><p class="muted">自动专题 · '+items.length+' 条相关事件</p>'+(cards||'<div class="card">暂无相关事件。</div>'),name+" 足球新闻专题"));
  });

  app.get("/entities",(_req,res)=>{
    res.set("Cache-Control","no-store, no-cache, must-revalidate, max-age=0");
    res.set("Pragma","no-cache");
    const state=getState();
    const rows=entityCandidates(state).slice(0,100).map(x=>'<a class="card" style="display:block;text-decoration:none" href="/entity/'+encodeURIComponent(x.name)+'"><div class="big">'+esc(x.name)+'</div><div class="muted">'+x.count+' 条新闻 · '+esc(x.categories.join(" / "))+'</div></a>').join("");
    res.send(shell("球队 / 球员实体",'<h1>球队 / 球员实体</h1><p class="muted">优先使用 AI 标签自动建立实体页；无需手工维护每一个球队和球员。</p><div class="grid">'+(rows||'<div class="card">实体索引正在生成。</div>')+'</div>'));
  });

  app.get("/entity/:name",async(req,res)=>{
    res.set("Cache-Control","no-store, no-cache, must-revalidate, max-age=0");
    res.set("Pragma","no-cache");
    const state=getState(),name=decodeURIComponent(String(req.params.name||"")).slice(0,60),q=name.toLowerCase();
    const items=allStories(state).filter(x=>storyHay(x).toLowerCase().includes(q)).sort((a,b)=>Date.parse(b.publishedAt||0)-Date.parse(a.publishedAt||0)).slice(0,120);
    const team=await teamContext(name).catch(()=>[]);
    const match=team.map(c=>'<div class="card"><div class="big">'+esc(displayTeamName(c.team))+'</div><div class="muted">最近 / 下一场</div>'+[...(c.previous||[]),...(c.next||[])].slice(0,6).map(m=>'<div>'+esc(m.date)+' · '+esc(displayTeamName(m.team1))+' '+(m.ft?esc(m.ft.join("-")):"vs")+' '+esc(displayTeamName(m.team2))+'</div>').join("")+'</div>').join("");
    const cards=items.map(x=>'<div class="card"><div class="muted">'+esc(x.category||"")+' · '+esc(ago(x.publishedAt))+'</div><a class="big" href="/story/'+encodeURIComponent(x.storyId||x.id)+'">'+esc(x.title)+'</a></div>').join("");
    res.send(shell(name,'<h1>'+esc(name)+'</h1><p class="muted">自动实体页 · '+items.length+' 条新闻</p>'+(match?'<h2>比赛上下文</h2>'+match:"")+'<h2>相关新闻</h2>'+(cards||'<div class="card">暂无相关事件。</div>'),name+" 足球新闻"));
  });

  app.get("/trends",(_req,res)=>{
    res.set("Cache-Control","no-store, no-cache, must-revalidate, max-age=0");
    res.set("Pragma","no-cache");
    const state=getState();
    const snaps=Object.entries(state.snapshots||{}).sort((a,b)=>a[0].localeCompare(b[0])).slice(-14);
    const cats=["转会","伤停","比赛","国家队","争议","趣闻","教练","球星","综合"];
    const rows=cats.map(cat=>{
      const vals=snaps.map(([date,items])=>({date,count:(items||[]).filter(x=>x.category===cat).length}));
      const max=Math.max(1,...vals.map(x=>x.count));
      const bars=vals.map(v=>'<span title="'+esc(v.date)+' '+v.count+'" style="display:inline-block;width:14px;height:'+Math.max(3,Math.round(v.count/max*70))+'px;background:currentColor;opacity:.65;margin-right:3px;vertical-align:bottom"></span>').join("");
      return '<div class="card"><strong>'+esc(cat)+'</strong><div style="height:82px;display:flex;align-items:flex-end;margin-top:8px">'+bars+'</div><div class="muted">最近 '+vals.length+' 天快照</div></div>';
    }).join("");
    res.send(shell("新闻趋势",'<h1>新闻趋势</h1><p class="muted">基于每日快照统计各类新闻变化，不依赖第三方分析平台。</p><div class="grid">'+rows+'</div>'));
  });

  app.get("/relations",(_req,res)=>{
    res.set("Cache-Control","no-store, no-cache, must-revalidate, max-age=0");
    res.set("Pragma","no-cache");
    const state=getState();
    const edges=new Map();
    for(const x of allStories(state).slice(0,500)){
      const tags=[...new Set((x.aiTags||[]).map(v=>String(v).trim()).filter(v=>v&&v.length<=24))].slice(0,6);
      for(let i=0;i<tags.length;i++)for(let j=i+1;j<tags.length;j++){
        const pair=[tags[i],tags[j]].sort((a,b)=>a.localeCompare(b,"zh-CN"));
        const key=pair.join("||");
        edges.set(key,(edges.get(key)||0)+1);
      }
    }
    const top=[...edges.entries()].map(([key,count])=>({pair:key.split("||"),count})).filter(x=>x.count>=2).sort((a,b)=>b.count-a.count).slice(0,60);
    const cards=top.map(x=>'<div class="card"><a href="/entity/'+encodeURIComponent(x.pair[0])+'">'+esc(x.pair[0])+'</a> <strong>↔</strong> <a href="/entity/'+encodeURIComponent(x.pair[1])+'">'+esc(x.pair[1])+'</a><div class="muted">共同出现在 '+x.count+' 个事件中</div></div>').join("");
    const visualEdges=top.slice(0,24);
    const nodes=[...new Set(visualEdges.flatMap(x=>x.pair))].slice(0,18);
    const pos=new Map(nodes.map((name,i)=>{
      const a=Math.PI*2*i/Math.max(1,nodes.length),r=190;
      return [name,{x:260+Math.cos(a)*r,y:240+Math.sin(a)*r}];
    }));
    const lines=visualEdges.map(e=>{const a=pos.get(e.pair[0]),b=pos.get(e.pair[1]);if(!a||!b)return"";return '<line x1="'+a.x+'" y1="'+a.y+'" x2="'+b.x+'" y2="'+b.y+'" stroke="#355848" stroke-width="'+Math.min(6,1+e.count)+'" opacity=".65"/>'}).join("");
    const dots=nodes.map(name=>{const p=pos.get(name);return '<a href="/entity/'+encodeURIComponent(name)+'"><circle cx="'+p.x+'" cy="'+p.y+'" r="9" fill="#63e7a1"/><text x="'+p.x+'" y="'+(p.y-14)+'" text-anchor="middle" fill="#f3f8f5" font-size="11">'+esc(name.slice(0,12))+'</text></a>'}).join("");
    const graph=nodes.length?'<div class="card" style="overflow:auto"><svg viewBox="0 0 520 480" width="100%" style="min-width:520px;max-height:520px">'+lines+dots+'</svg></div>':'';
    res.send(shell("新闻关系图",'<h1>新闻关系图</h1><p class="muted">根据同一事件中的球队、球员和赛事标签共现自动计算关系强度。节点可点击进入实体页。</p>'+graph+'<div class="grid">'+(cards||'<div class="card">关系数据正在积累。</div>')+'</div>'));
  });

  app.get("/brief",async(_req,res)=>{
    res.set("Cache-Control","no-store, no-cache, must-revalidate, max-age=0");
    res.set("Pragma","no-cache");
    const state=getState();
    const cutoff=Date.now()-24*3600_000;
    const items=allStories(state).filter(x=>Date.parse(x.publishedAt||0)>=cutoff).sort((a,b)=>(b.importance||0)-(a.importance||0)||(b.confirmations||0)-(a.confirmations||0)).slice(0,12);
    const brief=await summarizeDailyBrief(state,items).catch(()=>null);
    const lead=brief?'<div class="card"><div class="muted">'+(brief.ai?'AI生成':'规则摘要')+'</div><div class="big">'+esc(brief.title||"过去24小时足球简报")+'</div><p>'+esc(brief.summary||"")+'</p>'+(brief.bullets||[]).map(x=>'<div>• '+esc(x)+'</div>').join("")+'</div>':"";
    const lines=items.map((x,i)=>'<div class="card"><div class="muted">#'+(i+1)+' · '+esc(x.category||"综合")+' · '+(x.confirmations||0)+'源</div><a class="big" href="/story/'+encodeURIComponent(x.storyId||x.id)+'">'+esc(x.title)+'</a></div>').join("");
    res.set("Cache-Control","public, max-age=120, stale-while-revalidate=300");
    res.send(shell("每日简报",'<h1>每日简报</h1><p class="muted">有 AI Key 时自动生成摘要；无 Key 或额度不足时使用规则摘要，不影响页面可用性。</p>'+lead+lines));
  });

  app.get("/admin",(req,res)=>{
    const state=getState();
    if(!process.env.ADMIN_TOKEN)return res.status(503).send(shell("管理后台未启用",'<div class="card">请先在 Railway Variables 设置 ADMIN_TOKEN。</div>'));
    if(!adminAllowed(req))return res.status(401).send(shell("需要管理令牌",'<div class="card">使用 /admin?token=你的ADMIN_TOKEN 访问。</div>'));
    const token=String(req.query.token);
    const editor=ensureEditor(state);
    const items=[...(state.allEligible||[]),...(state.reportLatest||[])].slice(0,160);
    const cards=items.map(x=>{
      const members=(x.members||[]).slice(0,8).map(m=>'<form method="post" action="/api/admin/action?token='+encodeURIComponent(token)+'" style="display:inline"><input type="hidden" name="storyId" value="'+esc(x.storyId)+'"><input type="hidden" name="value" value="'+esc(m.id)+'"><button name="action" value="split">拆出：'+esc((m.source||"")+" "+(m.title||"").slice(0,20))+'</button></form>').join("");
      const cats=["官方","转会","球星","伤停","比赛","国家队","争议","趣闻","教练","综合"].map(c=>'<option>'+c+'</option>').join("");
      return '<div class="card"><div class="muted">'+esc(x.storyId||"")+' · '+(x.confirmations||0)+'源 · '+(editor.pinned[x.storyId]?"已置顶":"")+'</div><div class="big">'+esc(x.title)+'</div>'
        +'<form method="post" action="/api/admin/action?token='+encodeURIComponent(token)+'" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px"><input type="hidden" name="storyId" value="'+esc(x.storyId)+'"><button class="good" name="action" value="'+(editor.pinned[x.storyId]?"unpin":"pin")+'">'+(editor.pinned[x.storyId]?"取消置顶":"置顶")+'</button><button class="danger" name="action" value="kill">隐藏</button><select name="value"><option value="">分类</option>'+cats+'</select><button name="action" value="category">改分类</button><input name="mergeTarget" placeholder="目标 storyId"><button name="action" value="merge">合并到目标</button></form><div style="margin-top:8px">'+members+'</div></div>';
    }).join("");
    const health=Object.entries(state.metrics?.filterStatsBySource||{}).map(([name,v])=>'<tr><td>'+esc(name)+'</td><td>'+(v.raw||0)+'</td><td>'+(v.accepted||0)+'</td><td>'+(v.commercial||0)+'</td><td>'+(v.lowInfo||0)+'</td><td>'+(v.nonFootball||0)+'</td><td>'+(v.junk||0)+'</td></tr>').join("");
    const body='<h1>露白足球编辑台</h1><p class="muted">支持置顶、隐藏、改分类、合并、拆分。操作写入持久状态，并在下一轮同步继续生效。</p><h2>来源健康</h2><div class="card"><table><tr><th>来源</th><th>原始</th><th>收录</th><th>商业</th><th>低信息</th><th>非足球</th><th>垃圾</th></tr>'+health+'</table></div><h2>当前故事</h2>'+cards;
    res.send(shell("编辑台",body));
  });

  app.post("/api/admin/action",async(req,res)=>{
    const state=getState();
    if(!adminAllowed(req))return res.status(401).json({ok:false,error:"unauthorized"});
    const action=String(req.body.action||"");
    const storyId=String(req.body.storyId||"");
    let value=String(req.body.value||"");
    if(action==="merge")value=String(req.body.mergeTarget||value||"");
    const ok=editStory(state,{action,storyId,value});
    if(ok){
      await saveOverride("editor",state.editor).catch(()=>{});
      state.allEligible=applyEditorial(state.allEligible||[],state);
      state.latest=applyEditorial(state.latest||[],state).slice(0,maxVisible);
      state.reportLatest=applyEditorial(state.reportLatest||[],state).slice(0,180);
      saveState();
    }
    const token=encodeURIComponent(String(req.query.token||req.body.token||""));
    if(String(req.headers.accept||"").includes("application/json"))return res.json({ok,editor:state.editor});
    res.redirect("/admin?token="+token);
  });
}
