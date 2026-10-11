(() => {
'use strict';
const $=s=>document.querySelector(s), core=globalThis.AtlasQuizCore;
const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const u=a=>[...new Set((a||[]).filter(Boolean))];
const btns=[...document.querySelectorAll('[data-atlas-game]')],board=$('#atlas-game-board'),status=$('#atlas-game-status'),heading=$('#atlas-game-title'),scope=$('#atlas-scope'),level=$('#atlas-difficulty'),settings=$('#atlas-game-settings'),info=$('#atlas-game-info');
const types={match:'地名翻牌配对',place:'地名归属挑战',special:'地方特产竞猜',line:'地名连线',hunt:'地图寻宝'};
let region={trail:['中国'],children:[],others:[],siblings:[]},index=[],products=[],game='match',token=0,deck=[],flipped=[],paired=new Set(),attempts=0,questions=[],q=0,correct=0,completed=false,locked=false,linePairs=[],lineLeft=null,lineMatched=new Set(),hunt=null,huntStep=1;
const displayPlace=()=>region.trail.at(-1)||'中国';
function say(t){status.textContent=t;}
const placeKey=path=>path.join('/');
function award(){
 if(completed)return;
 completed=true;
 window.dispatchEvent(new CustomEvent('atlas:reward',{detail:{game,trail:region.trail.slice()}}));
}
function configure(){
 settings.hidden=!['place','line','hunt'].includes(game);
 const levelLabel=level.closest('label');if(levelLabel)levelLabel.hidden=game!=='place';
 if(scope){scope.options[0].textContent=region.trail.length>1?'当前地区及下辖':'当前：全国';}
 heading.textContent=types[game]+' · '+displayPlace();
 if(game!=='special')info.textContent='每局随机出题，同一轮不重复正确答案；得分每日按地区及玩法记录。';
 btns.forEach(b=>{const active=b.dataset.atlasGame===game;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
}
function start(mode=game){
 if(!types[mode]||!core)return;
 game=mode;token++;flipped=[];paired=new Set();attempts=0;questions=[];q=0;correct=0;completed=false;locked=false;linePairs=[];lineLeft=null;lineMatched=new Set();hunt=null;huntStep=1;
 configure();
 if(game==='match')startMatch();
 else if(game==='place')startPlaces();
 else if(game==='special')startSpecial();
 else if(game==='line')startLine();
 else if(game==='hunt')startHunt();
}
function empty(message){
 board.innerHTML='<div class="atlas-game-empty">'+safe(message)+'</div>';
 say(message);
}
function startMatch(){
 let names=u(region.children);
 if(names.length<3)names=u(region.siblings);
 if(names.length<3)names=u(index.filter(e=>region.trail.length===1?e.depth===1:e.depth===region.trail.length-1&&e.path.slice(0,region.trail.length-1).join('/')===region.trail.slice(0,-1).join('/')).map(e=>e.name));
 if(names.length<2){empty('这里暂时没有足够的地名卡片，返回上一级试试。');return;}
 deck=core.matchDeck(names,6);
 say('将相同的地名配成对。已收录 '+names.length+' 个可用地名，本局 '+deck.length/2+' 对。');
 drawMatch();
}
function drawMatch(){
 board.innerHTML='<div class="atlas-match-grid">'+deck.map((x,i)=>{
 const reveal=paired.has(x.id)||flipped.includes(i);
 return '<button type="button" class="atlas-match-card'+(reveal?' is-open':'')+(paired.has(x.id)?' is-matched':'')+'" data-card="'+i+'" '+(paired.has(x.id)?'disabled':'')+' aria-label="'+safe(reveal?x.name:'未翻开的卡片')+'">'+(reveal?safe(x.name):'？')+'</button>';
 }).join('')+'</div><p class="atlas-game-foot">翻牌 '+attempts+' 次 · 配对 '+paired.size+'/'+deck.length/2+'</p>';
}
function gameEntries(){
 if(!index.length)return [];
 // In-country geographical data is lazy-loaded by province for fast mobile startup.
 const villageData=region.trail[1]===window.atlasVillageProvince?(window.atlasVillageEntries||[]):[];
 const extra=region.trail.length>=4&&region.trail[1]==='台湾省'?region.children.filter(Boolean).map(name=>({name,path:[...region.trail,name],depth:region.trail.length,parent:region.trail.at(-1),parentPath:region.trail.slice()})):[];
 return index.concat(villageData,extra);
}
function startPlaces(){
 const all=gameEntries();
 const desired=level.value;
 questions=core.placeQuestions(all,region.trail,scope.value,desired,5);
 if(!questions.length&&scope.value!=='all'&&desired!=='mixed'){
  questions=core.placeQuestions(all,region.trail,'local','mixed',5);
  if(questions.length)say('此层级可用题目较少，已自动切换当前地区综合挑战。');
 }
 if(!questions.length){empty(desired==='5'?'先进入省份下的街道，加载村社区目录，再选择村社区挑战。':'当前范围暂无足够的不重复题目，可改选「全国综合」或返回上一级。');return;}
 drawQuestion();
}
function currentSource(){
 const data=core.productsFor(products,region.trail);
 if(data.products.length)return data;
 // Hong Kong, Macau and Taiwan receive only manually sourced samples, not mainland GI products.
 const manual=region.manual||[];
 return {source:region.specialtySource||displayPlace(),level:'legacy',products:manual.map(x=>[x.name,region.trail[1]||'',region.trail[2]||'',[],x.description||''])};
}
function startSpecial(){
 if(!products.length&&!(region.manual||[]).length){empty('特产资料载入中，或当前地区暂无来源明确的特产数据。');return;}
 const data=currentSource();
 const pool=[...products,...(region.manual||[]).map(x=>[x.name,region.trail[1]||'',region.trail[2]||'',[],x.description||''])];
 questions=core.productQuestions(data.products,pool,data.source,5);
 if(!questions.length){empty('当前地区暂无足够的可用特产题目，不能通过重复同一个答案凑满五道题。');return;}
 const fallback=data.level.includes('fallback')?'本轮采用上级「'+data.source+'」的资料，不代表这些特产产于当前区县、街道或村庄。':
   data.level==='national'?'全国地理标志产品综合挑战。':'已从「'+data.source+'」现有资料中随机选题。';
 info.textContent='本轮 '+questions.length+' 题，正确答案不重复。'+fallback;
 drawQuestion();
}
function drawQuestion(){
 const question=questions[q];if(!question){empty('这一级暂无可用题目。');return;}
 locked=false;
 board.innerHTML='<div class="atlas-game-prompt">'+safe(question.text)+'</div>'+
 '<div class="atlas-quiz-options">'+question.options.map((v,i)=>'<button type="button" data-choice="'+i+'">'+safe(v)+'</button>').join('')+'</div>'+
 '<p class="atlas-game-foot">第 '+(q+1)+' / '+questions.length+' 题 · 答对 '+correct+' 题</p>';
 if(game==='place')say('当前范围：'+(scope.value==='all'?'全国（包含下级城市、区县和街道）':displayPlace()+'及下辖')+'。请选择正确的归属。');
 else say('根据已收录资料作答，同轮正确答案不会重复。');
}
function completedQuiz(){
 completed=true;
 const passed=correct>=Math.ceil(questions.length*.6);
 board.innerHTML='<div class="atlas-game-result"><strong>'+correct+'/'+questions.length+'</strong><p>'+(passed?'挑战通关':'本轮结束')+'</p><button type="button" data-retry>再玩一轮</button></div>';
 if(passed){completed=false;award();}
 say('正确 '+correct+' 题，本轮 '+questions.length+' 题。'+(passed?'已达到通关标准。':'答对六成即可通关。'));
}
function startLine(){
 const entries=gameEntries();
 const scoped=scope.value==='all'?entries:entries.filter(e=>region.trail.every((v,i)=>e.path[i]===v));
 // Prefer four distinct parents and four distinct child names.
 const candidates=core.shuffle(scoped.filter(e=>e.depth>=2&&e.depth<=4&&e.parentPath.length>1));
 const names=new Set(),parents=new Set();
 for(const entry of candidates){
  if(names.has(entry.name)||parents.has(entry.parent))continue;
  // With duplicate names in the same dataset, display with context rather than assume uniqueness.
  if(entries.some(other=>other.name===entry.name&&other.parent!==entry.parent))continue;
  linePairs.push(entry);names.add(entry.name);parents.add(entry.parent);
  if(linePairs.length===4)break;
 }
 if(linePairs.length<3&&scope.value==='local'){scope.value='all';startLine();return;}
 if(linePairs.length<3){empty('当前范围的不同归属配对数量不足，请切换全国模式。');return;}
 const right=core.shuffle(linePairs);
 board.innerHTML='<p class="atlas-game-prompt">依次点击左侧地名，再点击右侧对应的上级地区。</p><div class="atlas-line-grid">'+
 '<div class="atlas-line-col">'+linePairs.map((x,i)=>'<button type="button" data-left="'+i+'">'+safe(x.name)+'</button>').join('')+'</div>'+
 '<div class="atlas-line-col">'+right.map((x,i)=>'<button type="button" data-right="'+i+'" data-path="'+safe(placeKey(x.path))+'">'+safe(x.parent)+'</button>').join('')+'</div></div><p class="atlas-game-foot" id="atlas-line-counter">已连对 0 / '+linePairs.length+' 对</p>';
 say('每个地名都有一个正确的上级地区。');
}
function startHunt(){
 const entries=gameEntries(),path=region.trail;
 const available=entries.filter(x=>x.depth>=3&&x.depth<=4&&x.path.length>path.length&&
 (scope.value==='all'||path.every((v,i)=>x.path[i]===v)));
 const uniqueTargets=available.filter(x=>!available.some(y=>y!==x&&y.name===x.name));
 if(!uniqueTargets.length){empty('当前范围找不到有明确路径的寻宝目标，请换到全国或省市层级。');return;}
 hunt=core.shuffle(uniqueTargets)[0];huntStep=scope.value==='all'?1:path.length;
 showHunt();
}
function showHunt(){
 if(!hunt)return;
 const current=hunt.path.slice(0,huntStep),parent=current.at(-1),next=hunt.path[huntStep];
 const candidates=gameEntries().filter(x=>x.parentPath.join('/')===current.join('/')).map(x=>x.name);
 const opts=core.shuffle([next,...core.shuffle(u(candidates).filter(x=>x!==next)).slice(0,3)]);
 const valid=opts.length>=2?opts:core.shuffle([next,...core.shuffle(u(index.filter(x=>x.depth===huntStep&&x.name!==next).map(x=>x.name))).slice(0,3)]);
 board.innerHTML='<div class="atlas-game-prompt">目标地点：「'+safe(hunt.name)+'」<br><small>第 '+huntStep+' / '+(hunt.path.length-1)+' 层 · 当前位于 '+safe(parent)+'，请选择下一层正确地区</small></div>'+
 '<div class="atlas-quiz-options">'+valid.map((name,i)=>'<button type="button" data-hunt="'+i+'" data-name="'+safe(name)+'">'+safe(name)+'</button>').join('')+'</div>';
 say('沿省份→城市→区县→街道的层级逐步寻路。');
}
board.addEventListener('click',e=>{
 if(e.target.closest('[data-retry]')){start();return;}
 if(game==='match'){
  const btn=e.target.closest('[data-card]');if(!btn||completed||flipped.length===2)return;
  const i=Number(btn.dataset.card),item=deck[i];if(!item||paired.has(item.id)||flipped.includes(i))return;
  flipped.push(i);
  if(flipped.length===2){
   attempts++;drawMatch();
   const [a,b]=flipped;
   if(deck[a].id===deck[b].id){paired.add(deck[a].id);flipped=[];drawMatch();if(paired.size===deck.length/2){say('全部配对成功。');award();}}
   else{const turn=token;setTimeout(()=>{if(turn!==token)return;flipped=[];drawMatch();},700);}
  }else drawMatch();
  return;
 }
 if(game==='place'||game==='special'){
  const btn=e.target.closest('[data-choice]');if(!btn||locked||completed)return;
  locked=true;
  const chosen=questions[q].options[Number(btn.dataset.choice)],item=questions[q];
  btn.classList.add(chosen===item.answer?'correct':'wrong');
  if(chosen===item.answer)correct++;
  board.querySelectorAll('[data-choice]').forEach(b=>{b.disabled=true;if(b.textContent===item.answer)b.classList.add('correct');});
  say((chosen===item.answer?'答对！':'正确答案：'+item.answer+'。')+' '+item.explanation);
  const turn=token;setTimeout(()=>{if(turn!==token)return;q++;if(q>=questions.length)completedQuiz();else drawQuestion();},1250);
  return;
 }
 if(game==='line'){
  const left=e.target.closest('[data-left]'),right=e.target.closest('[data-right]');
  if(left&&!left.disabled){lineLeft=Number(left.dataset.left);board.querySelectorAll('[data-left]').forEach(b=>b.classList.toggle('selected',b===left));}
  if(right&&lineLeft!==null&&!right.disabled){
   const entry=linePairs[lineLeft];
   if(right.dataset.path===placeKey(entry.path)){
    right.disabled=true;right.classList.add('correct');
    const source=board.querySelector('[data-left="'+lineLeft+'"]');source.disabled=true;source.classList.remove('selected');source.classList.add('correct');
    lineMatched.add(lineLeft);lineLeft=null;
    $('#atlas-line-counter').textContent='已连对 '+lineMatched.size+' / '+linePairs.length+' 对';
    if(lineMatched.size===linePairs.length){say('全部连线正确。');award();}
    else say('配对正确！继续。');
   }else say('这两项不对应，重新选择右侧地区。');
  }
  return;
 }
 if(game==='hunt'){
  const btn=e.target.closest('[data-hunt]');if(!btn||completed)return;
  if(btn.dataset.name!==hunt.path[huntStep]){say('这里不是通往「'+hunt.name+'」的正确路线，再试一次。');return;}
  huntStep++;
  if(huntStep>=hunt.path.length){
   board.innerHTML='<div class="atlas-game-result"><strong>寻宝成功</strong><p>中国 / '+safe(hunt.path.slice(1).join(' / '))+'</p><button type="button" data-retry>新的目的地</button></div>';
   say('已找到目标。');award();
   window.dispatchEvent(new CustomEvent('atlas:navigate',{detail:{trail:hunt.path}}));
  }else showHunt();
 }
});
btns.forEach(b=>b.addEventListener('click',()=>start(b.dataset.atlasGame)));
for(const item of [scope,level])item.addEventListener('change',()=>{if(['place','line','hunt'].includes(game))start();});
let lastRegion='';
window.addEventListener('atlas:region',e=>{
 const data=e.detail||{};region={...region,...data};
 index=globalThis.atlasHierarchy||index;
 products=globalThis.atlasProducts||products;
 const next=JSON.stringify([region.trail,region.children]);
 if(next!==lastRegion){lastRegion=next;start();}
});
window.addEventListener('atlas:products',()=>{
 products=globalThis.atlasProducts||[];
 if(game==='special')start();
});
start('match');
})();
