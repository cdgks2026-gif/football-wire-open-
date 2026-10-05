(() => {
'use strict';
const D=window.RULEBOOK;
const $=s=>document.querySelector(s);
const content=$('#content'),filters=$('#filters'),search=$('#search'),reader=$('#reader');
const views={
 overview:['规则总览','狼人杀规则库','比赛版型、角色技能与裁判规则，一处查询。'],
 rules:['赛事规则','赛事规则','第一季手册的流程、计分、纪律与申诉条款。'],
 boards:['比赛版型','第一季比赛版型','9个正式比赛版型，采用成都执行手册的角色与结算口径。'],
 roles:['角色技能','角色技能速查','18个正式赛事角色，查询技能、限制与适用版型。'],
 faq:['判例与问答','判例与常见问题','根据手册条款整理的结算问答，附原文页码。']
};
const typeLabels={rules:'赛事规则',boards:'比赛版型',roles:'角色技能',faq:'判例与问答'};
const all=Object.entries(typeLabels).flatMap(([type])=>(Array.isArray(D[type])?D[type]:[]).map((record,index)=>({...record,type,index})));
const byId=new Map(all.map(x=>[x.id,x]));
let current='overview',filter='全部',lastFocus=null;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const normalized=s=>String(s).toLowerCase().replace(/攝/g,'摄').replace(/夢/g,'梦').replace(/魘/g,'魇').replace(/獵/g,'猎').replace(/衛/g,'卫').replace(/術/g,'术').replace(/靈/g,'灵').replace(/屍/g,'尸').replace(/預/g,'预').replace(/巫/g,'巫').replace(/[\s，。？！、,.?!]/g,'');
const high=s=>{
 const raw=String(s),q=search.value.trim();
 if(!q)return esc(raw);
 const at=raw.toLowerCase().indexOf(q.toLowerCase());
 return at<0?esc(raw):esc(raw.slice(0,at))+'<mark>'+esc(raw.slice(at,at+q.length))+'</mark>'+esc(raw.slice(at+q.length));
};
function searchableParts(r){
 const tags=(r.tags||[]).join(' ');
 const body=[r.title,r.summary,r.category,tags,JSON.stringify(r.sections||[]),...(r.items||[]),...(r.key||[]),...(r.gods||[]),JSON.stringify(r.wolves||[]),...(r.actions||[])].join(' ');
 return {title:normalized(r.title),summary:normalized(r.summary),tags:normalized(tags),body:normalized(body)};
}
const SEARCH_STOP=new Set(['什么','怎么','如何','可以','是否','是不是','能否','如果','这个','那个','一个','时候','规则','比赛','请问','一下','相关']);
const SEARCH_ALIASES={
 '开枪':['开枪','猎人','狼王','枪'],
 '枪':['开枪','猎人','狼王'],
 '自救':['自救','女巫','解药'],
 '毒':['毒药','女巫'],
 '守救':['守卫','女巫','同守同救'],
 '申诉':['申诉','复核','回执'],
 '积分':['积分','得分','计分'],
 '处罚':['处罚','判罚','违规','警告'],
 '自爆':['自爆','狼人'],
 '最后一神':['最后一神','神职','胜负'],
 '平票':['平票','投票','放逐']
};
function queryTerms(q){
 const raw=String(q||'').toLowerCase();
 const compact=normalized(raw);
 const terms=new Set(raw.split(/[\s，。？！、,.?!;；:：()（）]+/).map(normalized).filter(x=>x.length>1&&!SEARCH_STOP.has(x)));
 if(compact.length<=6&&!SEARCH_STOP.has(compact))terms.add(compact);
 if(compact.length>=4){
  for(let i=0;i<compact.length-1;i++){
   const g=compact.slice(i,i+2);
   if(!SEARCH_STOP.has(g))terms.add(g);
  }
 }
 for(const [key,values] of Object.entries(SEARCH_ALIASES)){
  if(compact.includes(normalized(key)))values.forEach(v=>terms.add(normalized(v)));
 }
 return [...terms].filter(Boolean);
}
function scoreRecord(r,q){
 const p=searchableParts(r),nq=normalized(q),terms=queryTerms(q);
 let score=0,hits=0;
 if(!nq)return 0;
 if(p.title===nq)score+=1000;
 else if(p.title.includes(nq)||nq.includes(p.title))score+=420;
 if(p.summary.includes(nq))score+=180;
 if(p.tags.includes(nq))score+=220;
 if(p.body.includes(nq))score+=120;
 for(const t of terms){
  let matched=false;
  if(p.title.includes(t)){score+=90;matched=true;}
  if(p.tags.includes(t)){score+=65;matched=true;}
  if(p.summary.includes(t)){score+=45;matched=true;}
  if(p.body.includes(t)){score+=18;matched=true;}
  if(matched)hits++;
 }
 score+=Math.min(hits,8)*12;
 // Type priority is only a tie-break bonus after a real keyword match.
 // Never return unrelated FAQ/rules merely because of their record type.
 if(score<=0)return 0;
 if(r.type==='faq')score+=15;
 else if(r.type==='rules')score+=10;
 return score;
}
function searchResults(q){
 const unique=new Map();
 for(const r of all){
  const score=scoreRecord(r,q);
  if(score<=0)continue;
  const fp=normalized(r.title)+'|'+normalized(r.summary||'');
  const prev=unique.get(fp);
  if(!prev||score>prev.score)unique.set(fp,{r,score});
 }
 const order={faq:0,rules:1,roles:2,boards:3};
 return [...unique.values()].sort((a,b)=>b.score-a.score||(order[a.r.type]??9)-(order[b.r.type]??9)||a.r.index-b.r.index).map(x=>x.r);
}
function route(r){return '#'+r.type+'/'+r.id;}
function badge(r){return '<span class="badge">成都赛事手册</span>';}
function boardCard(r){
 return `<a class="card" href="${route(r)}"><div class="card-top"><span class="card-index">${String(r.index+1).padStart(2,'0')}</span>${badge(r)}</div><h3>${high(r.title)}</h3><p>${high(r.summary)}</p><div class="card-config"><div><b>神职</b>${esc(r.gods.join(' / '))}</div><div><b>狼人</b>${esc(r.wolves.map(w=>w[0]+(w[1]>1?'×'+w[1]:'')).join(' / '))}</div>${r.civilians?'<div><b>平民</b>平民×'+r.civilians+'</div>':''}${r.special?'<div><b>特殊</b>'+esc(r.special.join(' / '))+'</div>':''}</div><div class="card-bottom"><span>${esc(r.category)} · 12人</span><span>查看规则</span></div></a>`;
}
function roleCard(r){const cl=r.camp==='狼人阵营'?'wolf':r.camp==='特殊身份'?'mixed':'';return `<a class="card ${cl}" href="${route(r)}"><div class="card-top"><span class="role-glyph" aria-hidden="true">${esc(r.title.charAt(0))}</span>${badge(r)}</div><h3>${high(r.title)}</h3><p>${high(r.summary)}</p><div class="card-bottom"><span>${esc(r.camp)}</span><span>技能与限制</span></div></a>`;}
function row(r){return `<a class="rule-row" href="${route(r)}"><span class="rule-num">${String(r.index+1).padStart(2,'0')}</span><div><h3>${high(r.title)}</h3><p>${high(r.summary)}</p></div>${badge(r)}</a>`;}
function term(r){return `<a class="term" href="${route(r)}"><h3>${high(r.title)}</h3><p>${high(r.summary)}</p><small>${esc(r.category)}</small></a>`;}
function renderGroup(records,type){if(!records.length)return '';const cls=['boards','roles'].includes(type)?'grid':'rule-list';const fn=type==='boards'?boardCard:type==='roles'?roleCard:row;return `<div class="${cls}">${records.map(fn).join('')}</div>`;}
function source(r){
 if(r.pages?.length){return `<div class="source-ref"><strong>依据：第一季执行手册</strong><br>${r.pages.map(p=>`<a class="manual-page-link" href="/season-one-manual.pdf#page=${p}">正文第${p-6}页（PDF第${p}页）</a>`).join(' · ')}<br><span>条目为查阅整理，完整条文以所链接手册原文为准。</span></div>`;}
 return '';
}
function linkTo(id){const r=byId.get(id);return r?`<a href="${route(r)}">${esc(r.title)}</a>`:'';}
function links(ids){return ids?.length?'<div class="toc-links">'+ids.map(linkTo).join('')+'</div>':'';}
function list(items){return '<ul>'+items.map(s=>'<li>'+esc(s)+'</li>').join('')+'</ul>';}
function table(headers,rows){return '<div class="table-wrap"><table><thead><tr>'+headers.map(s=>'<th scope="col">'+esc(s)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map((s,i)=>'<td'+(i===row.length-1&&/^[+−]|扣\d/.test(s)?' class="score"':'')+'>'+esc(s)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';}
function section(s){return '<section>'+ (s.title?'<h3>'+esc(s.title)+'</h3>':'')+(s.paragraphs||[]).map(p=>'<p>'+esc(p)+'</p>').join('')+(s.items?list(s.items):'')+(s.headers?table(s.headers,s.rows):'')+'</section>';}
function config(r){const rows=[['神职',r.gods.join('、')],['狼人',r.wolves.map(w=>w[0]+'×'+w[1]).join('、')]];if(r.civilians)rows.push(['平民','平民×'+r.civilians]);if(r.special)rows.push(['特殊身份',r.special.join('、')]);return table(['阵营 / 类型','配置'],rows);}
function detail(r){
 let body=badge(r)+`<h2 id="reader-title">${esc(r.title)}</h2><p class="lede">${esc(r.summary)}</p>`;
 if(r.type==='boards'){
  body+='<h3>12人阵容</h3>'+config(r);
  const known=r.gods.concat(r.wolves.map(w=>w[0])).map(n=>(D.roles||[]).find(x=>x.title===n&&x.official)).filter(Boolean);
  body+=links(known.map(x=>x.id));
  body+='<h3>关键规则与结算</h3>'+list(r.key);
  body+='<h3>法官行动要点</h3>'+list(r.actions)+'<p class="reader-note">本清单依据手册整理，用于核对行动记录。手册未提供逐句完整口播；它不是新增的官方唤醒顺序。完整顺序与复杂技能优先级须由赛前法官统一确认。</p>';
  body+='<h3>通用流程与计分</h3>'+links(['rule-night','rule-witch','rule-win','rule-lastwords','rule-score-good','rule-score-wolf']);
 }else if(r.type==='roles'){
  body+='<p><span class="badge">'+esc(r.camp)+'</span></p><h3>技能与限制</h3>'+list(r.items);
  const related=(D.boards||[]).filter(b=>b.gods.includes(r.title)||b.wolves.some(w=>w[0]===r.title)||(r.title==='平民'&&b.civilians)).map(x=>x.id);
  body+='<h3>适用版型</h3>'+links(related);
 }else if(r.type==='rules')body+=r.sections.map(section).join('');
 else{body+='<h3>按手册核对</h3>'+list(r.items)+links(r.related);}
 return body+source(r);
}
function overview(){
 const stats=[['比赛版型',(D.boards||[]).length,'个','第一季正式版型'],['赛事角色',(D.roles||[]).length,'个','成都手册技能口径'],['赛事规则',(D.rules||[]).length,'条','流程、计分与纪律'],['判例问答',(D.faq||[]).length,'条','附依据与原文页码']];
 content.innerHTML='<div class="stats">'+stats.map(s=>'<div class="stat"><div class="stat-label">'+s[0]+'</div><div class="stat-value">'+s[1]+'<small>'+s[2]+'</small></div><div class="stat-note">'+s[3]+'</div></div>').join('')+'</div><div class="notice"><strong>成都执行口径：</strong>规则库仅保留第一季执行手册对应的正式版型、正式角色、赛事条款与判例问答。</div><div class="section-head"><h2>第一季比赛版型</h2><a href="#boards">完整阵容与技能</a></div>'+renderGroup(all.filter(x=>x.type==='boards'),'boards')+'<div class="section-head"><h2>赛前常查</h2><a href="#rules">全部赛事条款</a></div><div class="quick-grid">'+['rule-basic','rule-witch','rule-vote','rule-score-vote','rule-penalty','rule-appeal'].map(id=>{const r=byId.get(id);return r?'<a class="quick" href="'+route(r)+'"><div><strong>'+esc(r.title)+'</strong><small>'+esc(r.summary)+'</small></div><span class="quick-code" aria-hidden="true">§</span></a>':'';}).join('')+'</div><div class="section-head"><h2>容易混淆的结算</h2><a href="#faq">全部判例问答</a></div>'+renderGroup(all.filter(r=>r.type==='faq'&&['faq-white-state','faq-king-night','faq-last-god','faq-dq-alive'].includes(r.id)),'faq');
}
function makeFilters(options){filters.innerHTML=options.map(o=>`<button type="button" class="filter ${filter===o?'selected':''}" data-filter="${esc(o)}" aria-pressed="${filter===o}">${esc(o)}</button>`).join('');}
function render(){
 const info=views[current];$('#crumb').textContent=info[0];$('#view-title').textContent=info[1];$('#view-description').textContent=info[2];
 document.querySelectorAll('#nav a').forEach(a=>{a.classList.toggle('active',a.dataset.view===current);if(a.dataset.view===current)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
 $('#clear-search').hidden=!search.value;const searching=!!search.value.trim();
 if(searching){
  $('#view-title').textContent='搜索规则库';$('#view-description').textContent='输入角色名、关键词或整句问题，相关结果按匹配程度排序。';
  filters.innerHTML='';
  const records=searchResults(search.value.trim());
  content.innerHTML='<p class="count-note">找到 '+records.length+' 个相关条目 · 搜索「'+esc(search.value.trim())+'」</p>';
  if(!records.length){content.innerHTML+='<div class="empty"><h2>没有找到相关内容</h2><p>可以换成更短的关键词，如「女巫」「开枪」「平票」「申诉」。</p></div>';return;}
  content.innerHTML+='<div class="rule-list">'+records.map(r=>'<a class="rule-row" href="'+route(r)+'"><span class="rule-num">'+esc(typeLabels[r.type])+'</span><div><h3>'+high(r.title)+'</h3><p>'+high(r.summary)+'</p></div>'+badge(r)+'</a>').join('')+'</div>';
  return;
 }
 if(current==='overview'){filters.innerHTML='';overview();return;}
 let records=all.filter(r=>r.type===current);
 const options=current==='roles'?['全部','神职','狼人阵营','平民','特殊身份']:['全部',...new Set(records.map(r=>r.category))];
 makeFilters(options);
 if(current==='roles')records=records.filter(r=>filter==='全部'||r.camp===filter);
 else records=records.filter(r=>filter==='全部'||r.category===filter);
 let prefix=`<p class="count-note">${records.length} 个条目</p>`;
 if(current==='faq')prefix='<div class="notice">问答依据手册整理。未明确的边界保留「待明确」状态，具体条款可打开原文核对。</div>'+prefix;
 content.innerHTML=prefix+renderGroup(records,current);
}
function closeReader(){reader.hidden=true;document.body.style.overflow='';$('.shell').inert=false;$('.sidebar').inert=false;if(lastFocus?.isConnected)lastFocus.focus();else if(lastFocus)document.querySelector('#nav a.active')?.focus();}
function openReader(r){lastFocus=document.activeElement;$('#reader-content').innerHTML=detail(r);reader.hidden=false;document.body.style.overflow='hidden';$('.shell').inert=true;$('.sidebar').inert=true;$('.reader-panel').scrollTop=0;$('#close-reader').focus();}
function sync(){
 const parts=location.hash.slice(1).split('/');current=views[parts[0]]?parts[0]:'overview';filter='全部';search.value='';render();
 const r=byId.get(parts[1]);if(r)openReader(r);else closeReader();
 document.title=(r?r.title+' · ':current==='overview'?'':views[current][0]+' · ')+'京城大师成都公开赛规则库';
}
function dismiss(){location.hash=current;}
search.addEventListener('input',()=>{filter='全部';render();});
$('#search-form').addEventListener('submit',e=>{e.preventDefault();render();});
$('#clear-search').addEventListener('click',()=>{search.value='';filter='全部';render();search.focus();});
filters.addEventListener('click',e=>{const b=e.target.closest('[data-filter]');if(b){filter=b.dataset.filter;render();}});
$('#nav').addEventListener('click',e=>{const a=e.target.closest('a[data-view]');if(a&&location.hash==='#'+a.dataset.view){search.value='';filter='全部';render();}});
$('#close-reader').addEventListener('click',dismiss);$('.reader-shade').addEventListener('click',dismiss);
document.addEventListener('keydown',e=>{
 if(!reader.hidden){
  if(e.key==='Escape'){e.preventDefault();dismiss();}
  if(e.key==='Tab'){
   const nodes=[...$('.reader-panel').querySelectorAll('a[href],button:not([disabled]),input,[tabindex="0"]')];
   const first=nodes[0],last=nodes.at(-1);
   if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
   else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
  }
 }else if(e.key==='/'&&!['INPUT','TEXTAREA'].includes(document.activeElement.tagName)){e.preventDefault();search.focus();}
});
window.addEventListener('hashchange',sync);sync();
})();
