import crypto from "node:crypto";
import { getStory as getStoredStory, searchStories, getSnapshot, listSnapshots, storeStatus, saveOverride } from "./store.js";
import { teamContext, matchesAround, standings, leagueOptions } from "./matches.js";
import { ensureEditor, editStory, applyEditorial } from "./editor.js";

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
    +'</head><body><main><div class="top"><a href="/">首页</a><a href="/search">历史搜索</a><a href="/archive">每日归档</a><a href="/matches">赛程与积分榜</a></div>'
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
    const timeline=(versions.length?versions:members).map(v=>'<div class="row"><div class="muted">'+esc(new Date(v.publishedAt||v.recordedAt||0).toLocaleString("zh-CN"))+'</div><div>'+esc(v.title||"")+'</div></div>').join("");
    const reports=members.map(m=>'<tr><td>'+esc(new Date(m.publishedAt||0).toLocaleString("zh-CN"))+'</td><td>'+esc(m.source||"")+'</td><td>'+(m.url?'<a href="'+esc(m.url)+'" target="_blank" rel="noopener">'+esc(m.title)+'</a>':esc(m.title))+'</td></tr>').join("");
    const contextHtml=context.map(c=>'<div class="card"><strong>'+esc(c.team)+'</strong><div class="muted">最近比赛 / 下一场</div>'+[...(c.previous||[]),...(c.next||[])].map(m=>'<div>'+esc(m.date)+' · '+esc(m.team1)+' '+(m.ft?esc(m.ft.join("-")):"vs")+' '+esc(m.team2)+' · '+esc(m.leagueName||"")+'</div>').join("")+'</div>').join("");
    let body='<div class="card"><div class="muted">'+esc(story.category||"综合")+' · '+(story.confirmations||0)+' 个来源 · 首次 '+esc(new Date(story.firstSeenAt||story.publishedAt||0).toLocaleString("zh-CN"))+'</div><div class="big">'+esc(story.title)+'</div><div>'+sourceBadges+'</div></div>';
    if(contextHtml)body+='<h2>比赛上下文</h2><div class="grid">'+contextHtml+'</div>';
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
    const date=String(req.query.date||localDateKey()).slice(0,10);
    const league=String(req.query.league||"epl");
    const [matches,table]=await Promise.all([matchesAround(date,3),standings(league)]);
    const leagues=leagueOptions();
    const matchRows=matches.map(m=>'<tr><td>'+esc(m.date)+'</td><td>'+esc(m.leagueName)+'</td><td>'+esc(m.team1)+'</td><td>'+(m.ft?esc(m.ft.join("-")):"vs")+'</td><td>'+esc(m.team2)+'</td></tr>').join("");
    const tableRows=table.map((r,i)=>'<tr><td>'+(i+1)+'</td><td>'+esc(r.team)+'</td><td>'+r.p+'</td><td>'+r.w+'</td><td>'+r.d+'</td><td>'+r.l+'</td><td>'+r.gd+'</td><td><strong>'+r.pts+'</strong></td></tr>').join("");
    const opts=leagues.map(l=>'<option value="'+l.id+'" '+(l.id===league?"selected":"")+'>'+l.name+'</option>').join("");
    const body='<h1>赛程与积分榜</h1><form method="get"><input type="date" name="date" value="'+esc(date)+'"><select name="league">'+opts+'</select><button>查看</button></form>'
      +'<p class="muted">比赛数据来自 OpenFootball 公共数据集；用于新闻上下文和历史查询，不作为官方实时比分源。</p>'
      +'<h2>前后 3 天比赛</h2><div class="card"><table><thead><tr><th>日期</th><th>联赛</th><th>主队</th><th>比分</th><th>客队</th></tr></thead><tbody>'+(matchRows||'<tr><td colspan="5">暂无比赛</td></tr>')+'</tbody></table></div>'
      +'<h2>'+esc(leagues.find(x=>x.id===league)?.name||league)+'积分榜</h2><div class="card"><table><thead><tr><th>#</th><th>球队</th><th>场</th><th>胜</th><th>平</th><th>负</th><th>净胜</th><th>分</th></tr></thead><tbody>'+tableRows+'</tbody></table></div>';
    res.send(shell("赛程与积分榜",body));
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
