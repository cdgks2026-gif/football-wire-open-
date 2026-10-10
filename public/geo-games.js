(() => {
'use strict';
const $=selector=>document.querySelector(selector);
const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const pick=n=>Math.floor(Math.random()*n);
const shuffle=list=>{const a=[...list];for(let i=a.length-1;i>0;i--){const j=pick(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;};
const unique=list=>[...new Set(list.filter(Boolean))];
const buttons=[...document.querySelectorAll('[data-atlas-game]')], board=$('#atlas-game-board'),status=$('#atlas-game-status'),heading=$('#atlas-game-title');
let region={trail:['中国'],children:[],others:[],specialties:[],specialtySource:'',specialtyOptions:[]};
let game='match',session=0,moves=0,matched=new Set(),opened=[],deck=[],round=0,correct=0,quiz=null,finished=false;
const place=()=>region.trail.at(-1);
const say=message=>{status.textContent=message;};
function reward(){
 if(finished)return;
 finished=true;
 const result={game,trail:region.trail};
 window.dispatchEvent(new CustomEvent('atlas:reward',{detail:result}));
}
function setMode(mode){
 if(!['match','place','special'].includes(mode))return;
 game=mode;session++;moves=0;matched=new Set();opened=[];deck=[];round=0;correct=0;quiz=null;finished=false;
 buttons.forEach(btn=>{const on=btn.dataset.atlasGame===game;btn.classList.toggle('active',on);btn.setAttribute('aria-pressed',String(on));});
 heading.textContent=({match:'地名翻牌配对',place:'地名归属挑战',special:'猜猜当地特产'})[mode]+' · '+place();
 if(game==='match')beginMatch();else nextQuiz();
}
function beginMatch(){
 let names=unique(region.children);
 // 在村或社区等目录末级，仍可使用其上级已知地名继续玩。
 if(names.length<2)names=unique(region.siblings||[]);
 if(names.length<2)names=unique(region.trail.slice(1).concat(region.children));
 if(names.length<2){board.innerHTML='<p class="atlas-game-empty">选择一个有下辖地名的省、市或区县，就能开始配对。</p>';say('请先在地图上进入一个地区。');return;}
 names=shuffle(names).slice(0,Math.min(6,names.length));
 deck=shuffle(names.flatMap((name,id)=>[{name,id},{name,id}]));
 say('记住翻开的地名，找出 '+names.length+' 组相同的卡片。');
 drawMatch();
}
function drawMatch(){
 board.innerHTML='<div class="atlas-match-grid">'+deck.map((card,index)=>{
  const visible=matched.has(card.id)||opened.includes(index);
  return '<button type="button" class="atlas-match-card'+(visible?' is-open':'')+(matched.has(card.id)?' is-matched':'')+'" data-card="'+index+'" aria-label="'+(visible?escapeHTML(card.name):'未翻开的地名卡片')+'"'+(matched.has(card.id)?' disabled':'')+'>'+(visible?escapeHTML(card.name):'？')+'</button>';
 }).join('')+'</div><p class="atlas-game-foot">翻牌次数 '+moves+' · 已配对 '+matched.size+'/'+(deck.length/2)+'</p>';
}
board.addEventListener('click',event=>{
 if(game!=='match'||finished)return;
 const btn=event.target.closest('[data-card]');if(!btn||opened.length>=2)return;
 const index=Number(btn.dataset.card),card=deck[index];if(!card||matched.has(card.id)||opened.includes(index))return;
 opened.push(index);
 if(opened.length===2){
  moves++;drawMatch();
  const turn=session,[a,b]=opened;
  if(deck[a].id===deck[b].id){
   matched.add(deck[a].id);opened=[];
   drawMatch();
   if(matched.size===deck.length/2){say('全部配对完成！');reward();}
  }else{
   say('这两张不是同一地名，再试一次。');
   setTimeout(()=>{if(turn!==session)return;opened=[];drawMatch();},700);
  }
 }else drawMatch();
});
function nextQuiz(){
 if(finished)return;
 const isSpecial=game==='special';
 if(isSpecial&&(!region.specialties.length||unique(region.specialtyOptions).length<3)){
  board.innerHTML='<p class="atlas-game-empty">该地区尚未收录足够的经过核实的特产题目，可先玩地名配对和归属挑战。</p>';
  say('先选择有特产资料的地区，例如四川省、成都市或浙江省。');return;
 }
 const valid=unique(region.children),other=unique(region.others).filter(x=>!valid.includes(x));
 if(!isSpecial&&(!valid.length||other.length<3)){
  board.innerHTML='<p class="atlas-game-empty">该级地名或干扰项暂不足。可返回上一级地区挑战。</p>';
  say('请选择有下辖地名的省、市或区县。');return;
 }
 const answer=isSpecial?region.specialties[pick(region.specialties.length)].name:valid[pick(valid.length)];
 const options=isSpecial?unique(region.specialtyOptions).filter(x=>x!==answer):other.filter(x=>x!==answer);
 quiz={answer,choices:shuffle([answer,...shuffle(options).slice(0,3)])};
 if(quiz.choices.length<4){say('该层可用题目不足，请更换地区。');return;}
 const prompt=isSpecial?'哪一个是「'+region.specialtySource+'」已收录的代表性特产？':'以下哪一个地名属于「'+place()+'」下辖？';
 board.innerHTML='<div class="atlas-game-prompt">'+escapeHTML(prompt)+'</div><div class="atlas-quiz-options">'+quiz.choices.map((name,index)=>'<button type="button" data-choice="'+index+'">'+escapeHTML(name)+'</button>').join('')+'</div><p class="atlas-game-foot">第 '+(round+1)+' / 5 题 · 答对 '+correct+' 题</p>';
 say(isSpecial&&region.specialtySource!==place()?'这里使用上级「'+region.specialtySource+'」的代表性特产出题，不表示特产产于当前街道或村庄。':'请选择正确答案。');
}
board.addEventListener('click',event=>{
 if(game==='match'||!quiz||finished)return;
 const btn=event.target.closest('button[data-choice]');if(!btn||btn.disabled)return;
 const chosen=quiz.choices[Number(btn.dataset.choice)];
 if(chosen===quiz.answer){
  correct++;btn.classList.add('correct');say('回答正确！'); 
 }else{btn.classList.add('wrong');say('正确答案是「'+quiz.answer+'」。');}
 board.querySelectorAll('[data-choice]').forEach(x=>x.disabled=true);
 const turn=session;
 setTimeout(()=>{
  if(turn!==session)return;
  round++;
  if(round>=5){
   board.innerHTML='<div class="atlas-game-result"><strong>'+correct+'/5</strong><p>本轮挑战已完成</p><button type="button" id="atlas-retry">再玩一轮</button></div>';
   if(correct>=3){say('挑战完成：答对 '+correct+' 题，达到通关条件。');reward();}
   else{finished=true;say('本轮答对 '+correct+' 题，达到 3 题即可通关，再试一次。');}
  }else nextQuiz();
 },650);
});
board.addEventListener('click',event=>{if(event.target.closest('#atlas-retry'))setMode(game);});
buttons.forEach(btn=>btn.addEventListener('click',()=>setMode(btn.dataset.atlasGame)));
let lastRegionKey='';
window.addEventListener('atlas:region',event=>{
 const d=event.detail||{};
 const next={trail:d.trail||['中国'],children:d.children||[],others:d.others||[],siblings:d.siblings||[],specialties:d.specialties||[],specialtySource:d.specialtySource||'',specialtyOptions:d.specialtyOptions||[]};
 const key=JSON.stringify([next.trail,next.children,next.specialties,next.specialtySource]);
 region=next;
 // Answers and hint/list actions re-render the atlas, but should not erase an ongoing game.
 if(key===lastRegionKey)return;
 lastRegionKey=key;
 setMode(game);
});
setMode('match');
})();
