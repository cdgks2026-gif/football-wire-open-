(() => {
'use strict';
const D=window.RULEBOOK;
const $=s=>document.querySelector(s);
const content=$('#content'),filters=$('#filters'),search=$('#search'),reader=$('#reader');
const views={
 overview:['规则总览','狼人杀规则库','比赛版型、角色技能与裁判规则，一处查询。'],
 rules:['赛事规则','赛事规则','第一季手册的流程、计分、纪律与申诉条款。'],
 boards:['比赛版型','第一季比赛版型','9个正式比赛版型，采用成都执行手册的角色与结算口径。'],
 roles:['角色技能','角色技能速查','先选阵营，再查技能、限制与适用版型。'],
 faq:['判例与问答','判例与常见问题','根据手册条款整理的结算问答，附原文页码。'],
 glossary:['狼人杀术语','狼人杀术语','理解比赛发言与推理；具体裁定查赛事规则。'],
 reference:['拓展版型','26个拓展参考版型','参考 werewolves.games 整理，全部标注原始来源。'],
 sources:['版本与来源','版本与来源','赛事手册与LAL参考内容的适用范围。']
};
const typeLabels={rules:'赛事规则',boards:'比赛版型',roles:'角色技能',faq:'判例与问答',glossary:'狼人杀术语',reference:'拓展版型'};
const all=Object.entries(typeLabels).flatMap(([type])=>D[type].map((record,index)=>({...record,type,index})));
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
function searchable(r){return normalized([r.title,r.summary,r.category,...(r.tags||[]),JSON.stringify(r.sections||[]),...(r.items||[]),...(r.key||[]),...(r.gods||[]),JSON.stringify(r.wolves||[])].join(' '));}
function matches(r){const q=search.value.trim();return !q||q.split(/\s+/).every(w=>searchable(r).includes(normalized(w)));}
function route(r){return '#'+r.type+'/'+r.id;}
function badge(r){return r.official||r.pages?.length?'<span class="badge">成都赛事手册</span>':r.type==='glossary'?'<span class="badge">术语释义</span>':'<span class="badge ref">'+(r.conflict?'来源待核':'LAL参考')+'</span>';}
function boardCard(r){
 return `<a class="card" href="${route(r)}"><div class="card-top"><span class="card-index">${String(r.index+1).padStart(2,'0')}</span>${badge(r)}</div><h3>${high(r.title)}</h3><p>${high(r.summary)}</p><div class="card-config"><div><b>神职</b>${esc(r.gods.join(' / '))}</div><div><b>狼人</b>${esc(r.wolves.map(w=>w[0]+(w[1]>1?'×'+w[1]:'')).join(' / '))}</div>${r.civilians?'<div><b>平民</b>平民×'+r.civilians+'</div>':''}${r.special?'<div><b>特殊</b>'+esc(r.special.join(' / '))+'</div>':''}</div><div class="card-bottom"><span>${esc(r.category)} · 12人</span><span>查看规则</span></div></a>`;
}
function roleCard(r){const cl=r.camp==='狼人阵营'?'wolf':r.camp==='特殊身份'?'mixed':'';return `<a class="card ${cl}" href="${route(r)}"><div class="card-top"><span class="role-glyph" aria-hidden="true">${esc(r.title.charAt(0))}</span>${badge(r)}</div><h3>${high(r.title)}</h3><p>${high(r.summary)}</p><div class="card-bottom"><span>${esc(r.camp)}</span><span>技能与限制</span></div></a>`;}
function row(r){return `<a class="rule-row" href="${route(r)}"><span class="rule-num">${String(r.index+1).padStart(2,'0')}</span><div><h3>${high(r.title)}</h3><p>${high(r.summary)}</p></div>${badge(r)}</a>`;}
function term(r){return `<a class="term" href="${route(r)}"><h3>${high(r.title)}</h3><p>${high(r.summary)}</p><small>${esc(r.category)}</small></a>`;}
function renderGroup(records,type){if(!records.length)return '';const cls=['boards','reference','roles'].includes(type)?'grid':type==='glossary'?'glossary':'rule-list';const fn=['boards','reference'].includes(type)?boardCard:type==='roles'?roleCard:type==='glossary'?term:row;return `<div class="${cls}">${records.map(fn).join('')}</div>`;}
function source(r){
 if(r.pages?.length){return `<div class="source-ref"><strong>依据：第一季执行手册</strong><br>${r.pages.map(p=>`<a href="season-one-manual.pdf#page=${p}" target="_blank" rel="noopener">正文第${p-6}页（PDF第${p}页）</a>`).join(' · ')}<br><span>条目为查阅整理，完整条文以所链接手册原文为准。</span></div>`;}
 if(r.url){return `<div class="source-ref"><strong>${r.type==='glossary'?'释义参考':'LAL参考来源'}</strong><br><a href="${esc(r.url)}" target="_blank" rel="noopener">werewolves.games · ${esc(r.type==='glossary'?'术语库':r.title)}</a><br>查阅日期：2026.10.03${r.type!=='glossary'?'<br>此参考内容不自动成为成都公开赛比赛规则。':''}</div>`;}
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
 if(['boards','reference'].includes(r.type)){
  if(r.conflict)body+=`<div class="notice reference-warning"><strong>来源存在冲突：</strong>${esc(r.conflict)}</div>`;
  if(!r.official)body+='<p class="reader-note">以下是LAL参考版型。成都第一季正式比赛请使用「比赛版型」中的9个条目。</p>';
  body+='<h3>12人阵容</h3>'+config(r);
  const known=r.gods.concat(r.wolves.map(w=>w[0])).map(n=>D.roles.find(x=>x.title===n&&x.official===r.official)).filter(Boolean);
  body+=links(known.map(x=>x.id));
  body+='<h3>关键规则与结算</h3>'+list(r.key);
  if(r.official){
   body+='<h3>法官行动要点</h3>'+list(r.actions)+'<p class="reader-note">本清单依据手册整理，用于核对行动记录。手册未提供逐句完整口播；它不是新增的官方唤醒顺序。完整顺序与复杂技能优先级须由赛前法官统一确认。</p>';
   body+='<h3>通用流程与计分</h3>'+links(['rule-night','rule-witch','rule-win','rule-lastwords','rule-score-good','rule-score-wolf']);
  }else{
   body+='<h3>参考夜间顺序</h3><p class="muted">天黑闭眼后依下列身份行动，最终由法官结算并天亮。首夜确认与后续行动须分别处理。</p>'+r.night.map((s,i)=>'<div class="night-step"><span class="step-num">'+(i+1)+'</span><p>'+esc(s)+'</p></div>').join('')+'<p class="reader-note">按对应参考页的流程摘要整理，完整口播及赛事视频入口见原始规则页。</p>';
  }
 }else if(r.type==='roles'){
  body+='<p><span class="badge">'+esc(r.camp)+'</span></p><h3>技能与限制</h3>'+list(r.items);
  const related=r.official?D.boards.filter(b=>b.gods.includes(r.title)||b.wolves.some(w=>w[0]===r.title)||(r.title==='平民'&&b.civilians)).map(x=>x.id):r.related;
  body+='<h3>适用版型</h3>'+links(related);
 }else if(r.type==='rules')body+=r.sections.map(section).join('');
 else{body+='<h3>'+(r.type==='faq'?'按手册核对':'术语解释')+'</h3>'+list(r.items)+links(r.related);}
 return body+source(r);
}
function overview(){
 const stats=[['比赛版型',D.boards.length,'个','第一季正式版型'],['赛事角色',D.roles.filter(x=>x.official).length,'个','成都手册技能口径'],['拓展版型',D.reference.length,'个','LAL来源单独标注'],['判例问答',D.faq.length,'条','附依据与原文页码']];
 content.innerHTML='<div class="stats">'+stats.map(s=>'<div class="stat"><div class="stat-label">'+s[0]+'</div><div class="stat-value">'+s[1]+'<small>'+s[2]+'</small></div><div class="stat-note">'+s[3]+'</div></div>').join('')+'</div><div class="notice"><strong>成都执行口径：</strong>赛事条款与9个比赛版型以第一季手册为依据。拓展版型保留LAL来源；白痴、狼王等差异已单列。</div><div class="section-head"><h2>第一季比赛版型</h2><a href="#boards">完整阵容与技能</a></div>'+renderGroup(all.filter(x=>x.type==='boards'),'boards')+'<div class="section-head"><h2>赛前常查</h2><a href="#rules">全部赛事条款</a></div><div class="quick-grid">'+['rule-basic','rule-witch','rule-vote','rule-score-vote','rule-penalty','rule-appeal'].map(id=>{const r=byId.get(id);return `<a class="quick" href="${route(r)}"><div><strong>${esc(r.title)}</strong><small>${esc(r.summary)}</small></div><span class="quick-code" aria-hidden="true">§</span></a>`;}).join('')+'</div><div class="section-head"><h2>容易混淆的结算</h2><a href="#faq">全部判例问答</a></div>'+renderGroup(all.filter(r=>r.type==='faq'&&['faq-white-state','faq-king-night','faq-last-god','faq-dq-alive'].includes(r.id)),'faq');
}
function sourceView(){content.innerHTML=`<div class="sources"><img class="brand-excerpt" src="manual-brand.png" alt="第一季执行手册中的京城大师成都公开赛赛事标识"><h2>第一季执行手册版</h2><p>本库由您上传的《京城大师成都公开赛第一季执行手册 (2).pdf》与所指定的狼人杀规则站整理而成。整理日期为2026年10月3日，保留第一季原有赛制与判罚口径。</p><div class="source-item"><h3>赛事依据</h3><p>共37页PDF，包括封面、目录、29页手册正文与署名页。比赛版型、角色技能、计分、裁判纪律、申诉与赛制条目均标注对应PDF页码，并可直接打开原文。</p><p><a href="season-one-manual.pdf" target="_blank" rel="noopener">查看第一季执行手册</a></p></div><div class="source-item"><h3>拓展来源</h3><p>参考 <a href="https://werewolves.games/" target="_blank" rel="noopener">werewolves.games</a> 的26个版型索引、角色与术语内容。参考条目以重新整理的阵容、机制和流程摘要呈现，每条保留原始规则页入口，可继续查完整口播与其赛事视频。</p><p>LAL内容只用于拓展查阅，不代表成都第一季已经采用该版型。参考站的赛事视频属于其原赛事。</p></div><div class="source-item"><h3>已标注的口径差异</h3>${table(['问题','成都第一季手册','LAL参考页'],[['白痴放逐翻牌','已出局，可留至下一个放逐环节前','翻牌免死，保留发言、失去投票'],['普通夜死狼王','未将普通夜死列为禁枪条件','夜间死亡禁枪'],['梦魔恐惧队友','未规定首夜后禁选队友','梦魇页首夜后不可恐惧队友'],['连续摄梦','连续两夜同目标导致梦亡','摄梦页同时存在可梦亡与禁止连选的冲突'],['混血儿 / 忍法帖配置','不是第一季正式版型','速查与详细配置的狼民数量不一致']])}</div><div class="source-item"><h3>手册未完整规定的边界</h3><p>9个版型的逐句夜间口播、最后一神开枪以及纯白与狼巫等复杂技能优先级，手册未单独完整列明。规则库没有替赛事组新增裁定；这些边界由赛前主裁统一明确。</p><p>赛程、奖金与保证金表述均保持第一季文件内容。赛程不是实时赛果；未来赛季修改须另立版本。</p></div></div>`;}
function makeFilters(options){filters.innerHTML=options.map(o=>`<button type="button" class="filter ${filter===o?'selected':''}" data-filter="${esc(o)}" aria-pressed="${filter===o}">${esc(o)}</button>`).join('');}
function render(){
 const info=views[current];$('#crumb').textContent=info[0];$('#view-title').textContent=info[1];$('#view-description').textContent=info[2];
 document.querySelectorAll('#nav a').forEach(a=>{a.classList.toggle('active',a.dataset.view===current);if(a.dataset.view===current)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
 $('#clear-search').hidden=!search.value;const searching=!!search.value.trim();
 if(searching){
  $('#view-title').textContent='搜索规则库';$('#view-description').textContent='搜索范围包括赛事规则、比赛版型、角色、判例、术语与拓展参考。';
  makeFilters(['全部',...Object.values(typeLabels)]);
  const records=all.filter(matches).filter(r=>filter==='全部'||typeLabels[r.type]===filter);
  content.innerHTML=`<p class="count-note">找到 ${records.length} 个条目 · 搜索「${esc(search.value.trim())}」</p>`;
  if(!records.length)content.innerHTML+='<div class="empty"><h2>没有匹配的条目</h2><p>试试较短的关键词，如「女巫」「开枪」「申诉」。</p></div>';
  for(const [type,label] of Object.entries(typeLabels)){const group=records.filter(r=>r.type===type);if(group.length)content.innerHTML+=`<div class="section-head"><h2>${label}</h2><span>${group.length} 个条目</span></div>`+renderGroup(group,type);}
  return;
 }
 if(current==='overview'){filters.innerHTML='';overview();return;}
 if(current==='sources'){filters.innerHTML='';sourceView();return;}
 let records=all.filter(r=>r.type===current);
 const options=current==='roles'?['全部','赛事角色','拓展角色','神职','狼人阵营','平民','特殊身份']:['全部',...new Set(records.map(r=>r.category))];
 makeFilters(options);
 if(current==='roles')records=records.filter(r=>filter==='全部'||(filter==='赛事角色'?r.official:filter==='拓展角色'?!r.official:r.camp===filter));
 else records=records.filter(r=>filter==='全部'||r.category===filter);
 let prefix=`<p class="count-note">${records.length} 个条目</p>`;
 if(current==='reference')prefix='<div class="notice reference-warning"><strong>LAL参考：</strong>本栏目包含原网站26个版型，未自动列入成都第一季比赛。源页有配置或技能表述冲突的条目已标注「来源待核」。</div>'+prefix;
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
