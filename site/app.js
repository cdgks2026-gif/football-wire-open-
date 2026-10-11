(() => {
'use strict';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)],esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const CAMPS=['河洛','逐鹿','三分之地','日落海','大河流域','无阵营'];
const KEY='wxq-academy-v1';
const blank=()=>({team:[],bans:[],master:'',phase:'mid',plan:'',saved:[],reviews:[],known:[],quiz:{attempts:0,correct:0,history:[]}});
let DB=null,S=blank(),tab='heroes',round=[],qIndex=0,qCorrect=0,qLocked=false,page='home';
const titles={home:'总览仪表盘',library:'全能图鉴',lab:'阵容实验室',guide:'机制与阵营联动',quiz:'训练考核',records:'对局复盘',patch:'版本变化追踪',sources:'来源与资料边界'};
try{const raw=JSON.parse(localStorage.getItem(KEY)||'null');if(raw&&typeof raw==='object'){S={...blank(),...raw};S.quiz={...blank().quiz,...(raw.quiz||{})};}}catch{}
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(S));}catch{}};
const unique=a=>[...new Set((a||[]).filter(Boolean))];
const textSnippet=(s,n=95)=>String(s||'').length>n?String(s).slice(0,n)+'…':String(s||'');
const shuffled=arr=>{const a=[...arr];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
const qs=(sel,text)=>{const el=$(sel);if(el)el.textContent=text;};
function goto(id){
 page=titles[id]?id:'home';
 $$('.page').forEach(el=>el.classList.toggle('active',el.id==='page-'+page));
 $$('[data-page]').forEach(el=>el.classList.toggle('active',el.dataset.page===page));
 qs('#crumb strong',titles[page]);if(location.hash!=='#'+page)history.replaceState(null,'','#'+page);
 window.scrollTo({top:0,behavior:'instant'});renderPage();
}
const msg=(title,text)=>'<div class="empty-state"><strong>'+esc(title)+'</strong><p>'+esc(text||'')+'</p></div>';
function modal(html){
 $('#detail-content').innerHTML=html;$('#detail-modal').hidden=false;document.body.style.overflow='hidden';
 $('#detail-modal .modal-close').focus();
}
function closeModal(){$('#detail-modal').hidden=true;document.body.style.overflow='';}
function heroByName(name){return DB.heroes.find(h=>h.name===name);}
function setup(){
 $('#home-stats').innerHTML=[['85','可查英雄','按 V2.0 归档'],[Object.keys(DB.masters).length,'棋手定位','原 V2.0 汇总'],[DB.talents.length,'已有天赋名称','部分效果待核实'],[DB.plans.length,'构筑预设','需按版本判断']].map(x=>'<div class="stat"><strong>'+x[0]+'</strong><small>'+x[1]+'</small><span>'+x[2]+'</span></div>').join('');
 $('#learning-path').innerHTML=[['01','认识英雄','掌握六大阵营与英雄品阶','library'],['02','理解联动','区分阵营、整备、登场、觉醒','guide'],['03','练习组队','禁入阵营与7位置构筑分析','lab'],['04','实战复盘','用记录校正自己的打法','records']].map(x=>'<button class="path-card" data-go="'+x[3]+'"><b>MODULE '+x[0]+'</b><strong>'+x[1]+'</strong><p>'+x[2]+'</p><small>进入学习 →</small></button>').join('');
 $('#featured-mechanics').innerHTML=DB.mechanics.slice(0,5).map((x,i)=>'<button class="brief-line" data-mechanic="'+i+'">'+esc(x.title)+'<span>'+esc(x.tag)+' ↗</span></button>').join('');
 $('#featured-patch').innerHTML=DB.changes.slice(0,5).map(x=>'<button class="brief-line" data-go="patch">'+esc(x.name)+'<span>'+esc(x.type)+'</span></button>').join('');
 $('#library-camp').innerHTML='<option value="">全部阵营</option>'+CAMPS.map(c=>'<option>'+esc(c)+'</option>').join('');
 $('#lab-master').innerHTML='<option value="">未指定棋手</option>'+Object.keys(DB.masters).map(x=>'<option>'+esc(x)+'</option>').join('');
 $('#review-master').innerHTML=Object.keys(DB.masters).map(x=>'<option>'+esc(x)+'</option>').join('');
 $('#lab-plan').innerHTML='<option value="">自由构筑 · 不套模板</option>'+DB.plans.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.name)+'</option>').join('');
 $('#ban-options').innerHTML=CAMPS.map(x=>'<button type="button" class="chip" data-ban="'+esc(x)+'">'+esc(x)+'</button>').join('');
 $('#source-links').innerHTML=DB.meta.source.map(x=>'<div class="source-link"><strong>'+esc(x.name)+'</strong><small>'+esc(x.type)+' '+(x.url?'<a href="'+esc(x.url)+'" rel="noopener" target="_blank">访问 ↗</a>':'')+'</small></div>').join('');
 qs('#source-status',DB.meta.status);
 renderPage();
}
function renderPage(){
 if(page==='library')renderLibrary();
 if(page==='lab')renderLab();
 if(page==='guide')renderGuide();
 if(page==='quiz')renderQuizProgress();
 if(page==='records')renderReviews();
 if(page==='patch')renderPatches();
}
function renderLibrary(){
 const query=$('#library-query').value.trim().toLowerCase(),camp=$('#library-camp').value,cost=$('#library-cost').value;
 $$('#library-tabs [data-tab]').forEach(btn=>btn.classList.toggle('active',btn.dataset.tab===tab));
 const campSelect=$('#library-camp'),costSelect=$('#library-cost');
 campSelect.hidden=tab!=='heroes';costSelect.hidden=tab!=='heroes';
 let items=[];
 if(tab==='heroes')items=DB.heroes.filter(h=>(!camp||camp===h.camp)&&(!cost||Number(cost)===h.cost)&&(!query||(h.name+h.camp+h.cost).toLowerCase().includes(query)));
 if(tab==='masters')items=Object.entries(DB.masters).filter(([name,desc])=>(name+desc).toLowerCase().includes(query)).map(([name,desc])=>({name,desc}));
 if(tab==='talents')items=DB.talents.filter(name=>name.toLowerCase().includes(query)).map(name=>({name}));
 if(tab==='equipment')items=DB.changes.filter(x=>x.type==='装备'||x.type==='效果牌').concat(
  unique(DB.plans.flatMap(p=>p.effects||[])).map(name=>({name,type:'效果牌',after:'原 V2.0 阵容中的建议卡牌，完整效果请以客户端核查。',typeTag:'参考名称'})),
  unique(DB.plans.flatMap(p=>p.items||[])).map(name=>({name,type:'装备',after:'原 V2.0 阵容建议中的装备搭配，具体合成与数值请以客户端核查。',typeTag:'参考搭配'}))
 ).filter(x=>(x.name+x.type+x.after).toLowerCase().includes(query));
 const total=tab==='heroes'?DB.heroes.length:tab==='masters'?Object.keys(DB.masters).length:tab==='talents'?DB.talents.length:items.length;
 qs('#library-summary','找到 '+items.length+' 项 · 当前资料库：'+total+' 项'+(tab==='equipment'?'（仅已查变动与旧方案引用，非完整装备效果牌库）':''));
 $('#library-content').innerHTML=items.length?items.slice(0,300).map((x,i)=>{
  if(tab==='heroes')return '<button class="catalog-card" data-detail="hero" data-id="'+esc(x.name)+'"><span class="camp-badge">'+esc(x.camp)+'</span><b>'+esc(x.name)+'</b><span class="meta">'+x.cost+'阶英雄 · 点击查看</span></button>';
  if(tab==='masters')return '<button class="catalog-card" data-detail="master" data-id="'+esc(x.name)+'"><span class="camp-badge">棋手</span><b>'+esc(x.name)+'</b><span class="desc">'+esc(textSnippet(x.desc,55))+'</span></button>';
  if(tab==='talents')return '<button class="catalog-card" data-detail="talent" data-id="'+esc(x.name)+'"><span class="camp-badge">天赋</span><b>'+esc(x.name)+'</b><span class="meta">来自原 V2.0 天赋名单</span></button>';
  return '<button class="catalog-card" data-detail="item" data-id="'+i+'"><span class="camp-badge">'+esc(x.type)+'</span><b>'+esc(x.name)+'</b><span class="desc">'+esc(textSnippet(x.after,70))+'</span></button>';
 }).join(''):msg('没有匹配结果','尝试清除过滤条件或搜索其他名称。');
 // resolve item by same filter order for clicked item cards
 window.__visibleCatalog=items;
}
function showDetail(type,id){
 if(type==='hero'){
  const h=heroByName(id);if(!h)return;
  const plans=DB.plans.filter(p=>[...(p.core||[]),...(p.engine||[]),...(p.flex||[])].includes(id));
  modal('<div class="eyebrow">HERO DOSSIER</div><h2 id="detail-title">'+esc(h.name)+'</h2><div class="tagrow"><span>'+esc(h.camp)+'</span><span>'+h.cost+'阶</span></div><p>已收录阵营和品阶。旧版 V2.0 未包含完整技能、觉醒分支及当前版本基础属性，避免把未确认数据当作准确卡文。</p><h3>关联阵容</h3>'+(plans.length?'<ul>'+plans.map(p=>'<li>'+esc(p.name)+' · '+esc(p.tag)+'</li>').join('')+'</ul>':'<p>旧方案中暂未作为核心或功能位出现。</p>')+'<button class="btn primary" data-modal-pick="'+esc(h.name)+'">加入实验室</button>');
 }
 if(type==='master'){
  modal('<div class="eyebrow">COMMANDER NOTES</div><h2 id="detail-title">'+esc(id)+'</h2><span class="modal-badge">原 V2.0 定位摘要 · 技能卡文需复核</span><p>'+esc(DB.masters[id]||'资料待核实')+'</p><h3>推荐学习方式</h3><p>选择该棋手后，尝试比较不同阵容的成型速度、资源转化与禁入限制。</p><button class="btn primary" data-modal-master="'+esc(id)+'">带入实验室</button>');
 }
 if(type==='talent'){
  const patch=DB.changes.find(c=>c.name===id&&c.type==='天赋');
  modal('<div class="eyebrow">TALENT INDEX</div><h2 id="detail-title">'+esc(id)+'</h2>'+(patch?'<div class="tagrow"><span>v1.5.1 已核对</span></div><p>'+esc(patch.after)+'</p>':'<p>此天赋名称来自你之前的 V2.0 阵容系统。当前版本完整品阶、触发条件和数值尚未逐一核对，请以游戏内卡牌说明为准。</p>')+'<h3>相关阵容</h3><ul>'+DB.plans.filter(p=>(p.talents||[]).includes(id)).slice(0,6).map(p=>'<li>'+esc(p.name)+'</li>').join('')+'</ul>');
 }
 if(type==='item'){
  const item=window.__visibleCatalog?.[Number(id)];if(!item)return;
  modal('<div class="eyebrow">EQUIPMENT / EFFECT</div><h2 id="detail-title">'+esc(item.name)+'</h2><div class="tagrow"><span>'+esc(item.type)+'</span></div><p>'+esc(item.after||'')+'</p><p class="stat-label">资料来源：'+(item.typeTag?'旧版 V2.0 方案引用':'10月8日 v1.5.1 更新公告')+'</p>');
 }
}
function renderLab(){
 S.team=unique((S.team||[]).filter(x=>heroByName(x))).slice(0,7);
 S.bans=unique((S.bans||[]).filter(x=>CAMPS.includes(x)));
 $('#lab-master').value=S.master||'';$('#lab-phase').value=S.phase||'mid';$('#lab-plan').value=S.plan||'';
 $$('[data-ban]').forEach(b=>b.classList.toggle('banned',S.bans.includes(b.dataset.ban)));
 $('#board-cap').textContent=S.team.length+' / 7 个位置';
 $('#board-grid').innerHTML=Array.from({length:7},(_,i)=>{
  const name=S.team[i],h=heroByName(name);
  return '<button type="button" data-slot="'+i+'" title="'+(name?'点击移除 '+esc(name):'空位置')+'" class="board-slot '+(h?'filled':'')+'">'+(h?'<b>'+esc(h.name)+'</b><span>'+esc(h.camp)+'</span><small>'+h.cost+'阶 ×</small>':'<b>＋</b><span>空位</span>')+'</button>';
 }).join('');
 renderPick();renderAnalysis();renderSaved();
}
function renderPick(){
 const query=$('#pick-query').value.trim().toLowerCase();
 const pool=DB.heroes.filter(h=>(h.name+h.camp).toLowerCase().includes(query)).slice(0,85);
 $('#hero-pick-list').innerHTML=pool.map(h=>'<button type="button" class="hero-pick" data-pick="'+esc(h.name)+'" '+((S.team.includes(h.name)||S.team.length>=7||S.bans.includes(h.camp))?'disabled':'')+'><strong>'+esc(h.name)+'</strong><span>'+esc(h.camp)+' · '+h.cost+'阶'+(S.bans.includes(h.camp)?' · 禁入':'')+'</span></button>').join('');
}
function renderAnalysis(){
 const heroes=S.team.map(heroByName).filter(Boolean),counts=Object.fromEntries(CAMPS.map(c=>[c,heroes.filter(h=>h.camp===c).length]));
 const plan=S.plan?DB.plans.find(p=>p.id===S.plan):null;
 const oldBans=heroes.filter(h=>S.bans.includes(h.camp));
 const covered=plan?(plan.core||[]).filter(n=>S.team.includes(n)).length:0;
 const coreTotal=plan?(plan.core||[]).length:0;
 const focus=Math.max(...Object.values(counts),0);
 // Educational completeness heuristic, emphatically NOT match win odds.
 const score=Math.min(100,Math.max(0,
  (heroes.length>=4?22:heroes.length*5)+(oldBans.length?-30:18)+
  (heroes.some(h=>h.cost<=2)?10:0)+(focus>=3?15:focus*3)+
  (plan?(coreTotal?Math.round(25*covered/coreTotal):10):8)
 ));
 const warnings=[];
 if(!heroes.length)warnings.push('尚未选择英雄，先从右侧加入几个角色。');
 if(oldBans.length)warnings.push('阵容含禁入阵营英雄：'+oldBans.map(h=>h.name).join('、')+'；该局可能无法获取。');
 if(heroes.length>=5&&!heroes.some(h=>h.cost<=2))warnings.push('全部以中高阶为主，前期过渡可能有较大压力。');
 if(plan&&covered<coreTotal)warnings.push('预设核心缺件：'+plan.core.filter(x=>!S.team.includes(x)).join('、')+'。');
 if(S.phase==='early'&&heroes.filter(h=>h.cost>=4).length>=2)warnings.push('前期包含多位4/5阶卡，需准备可买到的低阶替代。');
 if(S.phase==='late'&&heroes.filter(h=>h.cost>=4).length===0)warnings.push('后期仍未引入高阶关键牌，应核对主C的等级与战斗兑现。');
 const masterAdvice=S.master?DB.masters[S.master]:'未指定棋手。建议先选择自己实际使用的棋手。';
 const planAdvice=plan?(S.phase==='early'?plan.early:S.phase==='mid'?plan.mid:plan.late):'尚未选择预设。请重点确认主C、成长发动机、前排/保护，以及当前版本的禁入限制。';
 $('#lab-analysis').innerHTML='<div class="panel-head"><h3>构筑诊断 · 理论完整度</h3><span class="mini-pill">启发式，非胜率</span></div><div class="metric-row">'+
 [[''+score+'/100','方案完整度'],[heroes.length+'/7','已上场英雄'],[focus,'最多同阵营数量'],[oldBans.length,'禁入冲突']].map(x=>'<div class="metric-box"><strong>'+esc(x[0])+'</strong><span>'+esc(x[1])+'</span></div>').join('')+'</div>'+
 '<div class="analysis-text"><strong>阵营分布</strong><p>'+CAMPS.filter(c=>counts[c]).map(c=>esc(c)+' '+counts[c]).join(' · ')+'</p>'+
 '<strong>阶段建议</strong><p>'+esc(planAdvice)+'</p><strong>棋手定位</strong><p>'+esc(masterAdvice)+'</p>'+
 '<strong>注意事项</strong>'+(warnings.length?warnings.map(w=>'<p class="alert">• '+esc(w)+'</p>').join(''):'<p class="positive">暂未发现明显的禁入冲突；仍需结合商店、血量、对手与当前英雄等级判断。</p>')+
 (plan?'<p><strong>方案适用边界：</strong>'+esc(plan.weakness||'请按实际来牌调整。')+'</p>':'')+'</div>';
}
function applyPlan(id){
 const p=DB.plans.find(x=>x.id===id);S.plan=id||'';
 if(p){
  const names=unique([...(p.core||[]),...(p.engine||[]),...(p.flex||[])]).filter(x=>heroByName(x)&&!S.bans.includes(heroByName(x).camp));
  S.team=names.slice(0,7);
  if(!S.master||!(p.masters||[]).includes(S.master))S.master=p.masters?.[0]||'';
  qs('#plan-note','已载入方案。核心：'+p.core.join('、')+'。'+(p.weakness||''));
 }else qs('#plan-note','自由构筑，不强制套用现有阵容。');
 save();renderLab();
}
function renderSaved(){
 const entries=S.saved||[];
 $('#saved-teams').innerHTML=entries.length?entries.slice().reverse().map(x=>'<div class="save-row"><div><strong>'+esc(x.title)+'</strong><small>'+esc(x.date)+' · '+esc(x.team.join('、'))+'</small></div><div><button data-load-team="'+esc(x.id)+'">载入</button><button data-remove-team="'+esc(x.id)+'">删除</button></div></div>').join(''):msg('还没有保存阵容','点击上方“保存当前构筑”后，可以随时读取。');
}
function renderGuide(){
 $('#camp-overview').innerHTML=CAMPS.map(c=>{
  const hs=DB.heroes.filter(h=>h.camp===c);
  return '<button class="camp-card" data-camp-jump="'+esc(c)+'"><b>'+esc(c)+'</b><span>'+hs.length+' 位英雄 · '+unique(hs.map(h=>h.cost)).length+' 种品阶</span></button>';
 }).join('');
 $('#mechanic-list').innerHTML=DB.mechanics.map((m,i)=>'<article class="mechanic"><span class="eyebrow">'+esc(m.tag)+'</span><h4>'+esc(m.title)+'</h4><p>'+esc(m.text)+'</p><small>依据：'+esc(m.source)+'</small><button type="button" data-mark="'+i+'" class="'+(S.known.includes(i)?'done':'')+'">'+(S.known.includes(i)?'✓ 已掌握':'标记已学')+'</button></article>').join('');
}
function makeQuestions(topic){
 const source=[];
 const used=new Set();
 const add=(key,question,answer,choices,explanation)=>{
  if(used.has(key))return;used.add(key);
  const opts=unique([answer,...choices]).slice(0,4);
  if(opts.length!==4)return;
  source.push({question,answer,choices:shuffled(opts),explanation});
 };
 const topics=topic==='mixed'?['camp','cost','master','patch']:[topic];
 if(topics.includes('camp')){
  for(const h of shuffled(DB.heroes)){
   add('c'+h.name,'「'+h.name+'」属于哪个阵营？',h.camp,shuffled(CAMPS.filter(x=>x!==h.camp)).slice(0,3),h.name+' · '+h.camp+' · '+h.cost+'阶');
  }
 }
 if(topics.includes('cost')){
  for(const h of shuffled(DB.heroes)){
   add('t'+h.name,'「'+h.name+'」在旧版 V2.0 资料中属于几阶？',h.cost+'阶',shuffled([1,2,3,4,5].filter(x=>x!==h.cost)).slice(0,3).map(x=>x+'阶'),h.name+' · '+h.camp+' · '+h.cost+'阶；以游戏最新卡池为准。');
  }
 }
 if(topics.includes('master')){
  for(const [name,desc] of shuffled(Object.entries(DB.masters))){
   add('m'+name,'根据此前资料，“'+textSnippet(desc,52)+'”对应哪位棋手？',name,shuffled(Object.keys(DB.masters).filter(x=>x!==name)).slice(0,3),name+'：'+desc);
  }
 }
 if(topics.includes('patch')){
  const all=['英雄','棋手','天赋','装备','效果牌'];
  for(const x of shuffled(DB.changes)){
   add('p'+x.name,'在10月8日 v1.5.1 更新中，「'+x.name+'」属于哪一类调整？',x.type,shuffled(all.filter(t=>t!==x.type)).slice(0,3),x.after);
  }
 }
 return shuffled(source).slice(0,10);
}
function startQuiz(){
 round=makeQuestions($('#quiz-topic').value);qIndex=0;qCorrect=0;qLocked=false;renderQuestion();
}
function renderQuestion(){
 const q=round[qIndex];if(!q){$('#quiz-area').innerHTML=msg('当前专题题量不足','请选择其他专题。');return;}
 qs('#quiz-counter','第 '+(qIndex+1)+' / '+round.length+' 题');
 $('#quiz-area').innerHTML='<div class="eyebrow">QUESTION '+String(qIndex+1).padStart(2,'0')+' / '+round.length+'</div><div class="quiz-question">'+esc(q.question)+'</div><div class="quiz-options">'+q.choices.map((v,i)=>'<button type="button" class="quiz-opt" data-quiz-choice="'+i+'">'+String.fromCharCode(65+i)+'　'+esc(v)+'</button>').join('')+'</div><div class="quiz-feedback" id="quiz-feedback">请选择一个答案。</div>';
 qLocked=false;
}
function answerQuiz(choice){
 if(qLocked)return;const q=round[qIndex];if(!q)return;qLocked=true;
 const correct=q.choices[choice]===q.answer;if(correct)qCorrect++;
 $$('[data-quiz-choice]').forEach((b,i)=>{b.disabled=true;if(q.choices[i]===q.answer)b.classList.add('correct');else if(i===choice)b.classList.add('wrong');});
 $('#quiz-feedback').innerHTML='<strong>'+(correct?'正确':'答错了，正确答案：'+esc(q.answer))+'</strong><p>'+esc(q.explanation)+'</p><button class="btn primary" id="quiz-next">'+(qIndex+1===round.length?'查看成绩':'下一题 →')+'</button>';
}
function nextQuiz(){
 qIndex++;
 if(qIndex<round.length){renderQuestion();return;}
 const date=new Date().toLocaleDateString('zh-CN');S.quiz.attempts+=round.length;S.quiz.correct+=qCorrect;
 S.quiz.history.unshift({date,score:qCorrect,total:round.length,topic:$('#quiz-topic').value});
 S.quiz.history=S.quiz.history.slice(0,60);save();
 $('#quiz-area').innerHTML='<div class="empty-state"><strong class="study-number">'+qCorrect+' / '+round.length+'</strong><p>本轮完成 · '+(qCorrect>=8?'已掌握多数内容':qCorrect>=6?'建议复习错题相关资料':'可以先阅读图鉴与机制，再次尝试')+'</p><button class="btn primary" id="quiz-again">再练一轮</button></div>';
 qs('#quiz-counter','本轮结束');renderQuizProgress();
}
function renderQuizProgress(){
 const q=S.quiz,rate=q.attempts?Math.round(q.correct/q.attempts*100):0;
 $('#quiz-progress').innerHTML='<strong class="study-number">'+rate+'%</strong><span class="study-label">累计正确率 · 已答 '+q.attempts+' 题</span><div class="progress"><span style="width:'+rate+'%"></span></div>'+
 '<p class="small">已掌握机制卡：'+S.known.length+'/'+DB.mechanics.length+'</p>'+
 (q.history.length?'<h4>最近练习</h4>'+q.history.slice(0,5).map(x=>'<div class="brief-line">'+esc(x.date)+'<span>'+x.score+'/'+x.total+'</span></div>').join(''):'<p class="small">尚无练习记录。</p>');
}
function renderReviews(){
 $('#record-list').innerHTML=(S.reviews||[]).length?S.reviews.map(x=>'<article class="panel record-item"><div><strong>'+esc(x.date)+' · 第'+esc(x.rank)+'名 · '+esc(x.master)+'</strong><small>核心：'+esc(x.core)+' · 禁入：'+esc(x.ban||'未填')+'</small><p>'+esc(x.notes)+'</p></div><button data-del-review="'+esc(x.id)+'">删除</button></article>').join(''):msg('还没有复盘记录','第一局打完后，在上面的表单记录你的关键选择。');
}
function renderPatches(){
 const keyword=$('#patch-query').value.trim().toLowerCase();
 const entries=DB.changes.filter(x=>(x.name+x.type+x.after).toLowerCase().includes(keyword));
 $('#patch-list').innerHTML=entries.map(x=>'<article class="patch-row"><span class="camp-badge">'+esc(x.type)+'</span><h4>'+esc(x.name)+'</h4>'+(x.before?'<p>此前：'+esc(x.before)+'</p>':'')+'<p>当前公告：'+esc(x.after)+'</p></article>').join('')||msg('暂无匹配变更','尝试英雄或天赋名称。');
}
function exportData(){
 const blob=new Blob([JSON.stringify({app:'wxq-academy',exportedAt:new Date().toISOString(),data:S},null,2)],{type:'application/json'});
 const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='王者万象棋-学习记录.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);
}
function copyText(str){if(navigator.clipboard?.writeText){navigator.clipboard.writeText(str).then(()=>qs('#team-save-feedback','已复制构筑摘要。')).catch(()=>qs('#team-save-feedback','浏览器禁止复制，可使用导出功能。'));}else qs('#team-save-feedback','请使用浏览器的复制功能。');}
document.addEventListener('click',event=>{
 const go=event.target.closest('[data-go]');if(go){goto(go.dataset.go);return;}
 if(event.target.matches('[data-dismiss]')){closeModal();return;}
 const d=event.target.closest('[data-detail]');if(d){showDetail(d.dataset.detail,d.dataset.id);return;}
 const m=event.target.closest('[data-mechanic]');if(m){const x=DB.mechanics[Number(m.dataset.mechanic)];modal('<div class="eyebrow">MECHANIC</div><h2 id="detail-title">'+esc(x.title)+'</h2><p>'+esc(x.text)+'</p><span class="stat-label">'+esc(x.source)+'</span>');return;}
 const picker=event.target.closest('[data-pick],[data-modal-pick]');if(picker){const name=picker.dataset.pick||picker.dataset.modalPick,h=heroByName(name);if(h&&S.team.length<7&&!S.team.includes(name)&&!S.bans.includes(h.camp)){S.team.push(name);save();renderLab();}if(picker.dataset.modalPick){closeModal();goto('lab');}return;}
 const sl=event.target.closest('[data-slot]');if(sl){const i=Number(sl.dataset.slot);if(S.team[i]){S.team.splice(i,1);save();renderLab();}return;}
 const ban=event.target.closest('[data-ban]');if(ban){const c=ban.dataset.ban;S.bans=S.bans.includes(c)?S.bans.filter(x=>x!==c):[...S.bans,c];save();renderLab();return;}
 const jump=event.target.closest('[data-camp-jump]');if(jump){goto('library');tab='heroes';$('#library-camp').value=jump.dataset.campJump;renderLibrary();return;}
 const mark=event.target.closest('[data-mark]');if(mark){const id=Number(mark.dataset.mark);S.known=S.known.includes(id)?S.known.filter(x=>x!==id):[...S.known,id];save();renderGuide();return;}
 const c=event.target.closest('[data-quiz-choice]');if(c){answerQuiz(Number(c.dataset.quizChoice));return;}
 const del=event.target.closest('[data-del-review]');if(del){S.reviews=S.reviews.filter(x=>x.id!==del.dataset.delReview);save();renderReviews();return;}
 const load=event.target.closest('[data-load-team]');if(load){const item=S.saved.find(x=>x.id===load.dataset.loadTeam);if(item){S.team=item.team.slice();S.bans=item.bans.slice();S.master=item.master;S.phase=item.phase;S.plan=item.plan;save();renderLab();}return;}
 const remove=event.target.closest('[data-remove-team]');if(remove){S.saved=S.saved.filter(x=>x.id!==remove.dataset.removeTeam);save();renderSaved();return;}
 if(event.target.id==='quiz-next'){nextQuiz();return;}
 if(event.target.id==='quiz-again'){startQuiz();return;}
 if(event.target.id==='quiz-start'){startQuiz();return;}
});
$$('#side-nav .nav-item,.sidebar .nav-item').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();goto(a.dataset.page);}));
window.addEventListener('hashchange',()=>goto(location.hash.slice(1)));
$('#library-query').addEventListener('input',renderLibrary);
$('#library-camp').addEventListener('change',renderLibrary);$('#library-cost').addEventListener('change',renderLibrary);
$('#library-tabs').addEventListener('click',e=>{const button=e.target.closest('[data-tab]');if(button){tab=button.dataset.tab;renderLibrary();}});
$('#pick-query').addEventListener('input',renderPick);
$('#lab-master').addEventListener('change',e=>{S.master=e.target.value;save();renderAnalysis();});
$('#lab-phase').addEventListener('change',e=>{S.phase=e.target.value;save();renderAnalysis();});
$('#lab-plan').addEventListener('change',e=>applyPlan(e.target.value));
$('#lab-reset').addEventListener('click',()=>{S.team=[];S.bans=[];S.plan='';save();renderLab();});
$('#save-team').addEventListener('click',()=>{
 if(!S.team.length){qs('#team-save-feedback','至少加入一位英雄才能保存。');return;}
 S.saved.push({id:String(Date.now()),date:new Date().toLocaleString('zh-CN'),title:(DB.plans.find(p=>p.id===S.plan)?.name||'自定义阵容'),team:S.team.slice(),bans:S.bans.slice(),master:S.master,phase:S.phase,plan:S.plan});
 S.saved=S.saved.slice(-30);save();renderSaved();qs('#team-save-feedback','已保存到本地浏览器。');
});
$('#copy-team').addEventListener('click',()=>copyText('王者万象棋构筑：'+S.team.join('、')+'\n棋手：'+(S.master||'未指定')+'\n禁入：'+S.bans.join('、')+'\n阶段：'+S.phase));
$('#export-all').addEventListener('click',exportData);
$('#analyze').addEventListener('click',()=>{renderAnalysis();$('#lab-analysis').scrollIntoView({behavior:'smooth',block:'start'});});
$('#quiz-start').addEventListener('click',startQuiz);
$('#reset-study').addEventListener('click',()=>{
 if(!confirm('只清空练习成绩？阵容、复盘和已掌握机制不会删除。'))return;S.quiz=blank().quiz;save();renderQuizProgress();
});
$('#review-form').addEventListener('submit',e=>{
 e.preventDefault();
 S.reviews.unshift({id:String(Date.now()),date:new Date().toLocaleString('zh-CN'),master:$('#review-master').value,rank:$('#review-rank').value,core:$('#review-core').value.trim(),ban:$('#review-ban').value.trim(),notes:$('#review-notes').value.trim()});
 S.reviews=S.reviews.slice(0,60);save();$('#review-form').reset();renderReviews();
});
$('#patch-query').addEventListener('input',renderPatches);
$('#global-search-btn').addEventListener('click',()=>{goto('library');$('#library-query').focus();});
window.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal();if(e.key==='/'&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)){e.preventDefault();goto('library');$('#library-query').focus();}});
fetch('/data.json',{cache:'no-cache'}).then(r=>{if(!r.ok)throw Error('HTTP '+r.status);return r.json();}).then(db=>{DB=db;setup();goto(titles[location.hash.slice(1)]?location.hash.slice(1):'home');}).catch(err=>{document.querySelector('main').innerHTML='<section class="panel"><h2>资料载入失败</h2><p>无法读取网站资料：'+esc(err.message)+'</p><button class="btn" onclick="location.reload()">刷新重试</button></section>';});
})();