(() => {
'use strict';
const $ = q => document.querySelector(q);
const gamePanels = {sudoku:$('#panel-sudoku'),twenty:$('#panel-twenty'),slide:$('#panel-slide')};
let active = 'sudoku';
document.querySelectorAll('.game-tab').forEach(button => button.addEventListener('click', () => {
  active = button.dataset.game;
  document.querySelectorAll('.game-tab').forEach(tab => {
    const on = tab === button;
    tab.classList.toggle('active',on);
    tab.setAttribute('aria-pressed', String(on));
  });
  Object.keys(gamePanels).forEach(key => {gamePanels[key].hidden = key !== active;});
}));

// Sudoku: construct complete valid grids, then only remove clues when the answer remains unique.
const random = n => Math.floor(Math.random()*n);
function shuffle(input) {
  const arr = input.slice();
  for(let i=arr.length-1;i>0;i--){const j=random(i+1);[arr[i],arr[j]]=[arr[j],arr[i]];}
  return arr;
}
function fullGrid() {
  const rows = shuffle([0,1,2]).flatMap(b => shuffle([0,1,2]).map(r => b*3+r));
  const cols = shuffle([0,1,2]).flatMap(b => shuffle([0,1,2]).map(c => b*3+c));
  const digits=shuffle([1,2,3,4,5,6,7,8,9]);
  return rows.flatMap(r => cols.map(c => digits[(r*3+Math.floor(r/3)+c)%9]));
}
function solutions(p, limit) {
  const rows=new Uint16Array(9),cols=new Uint16Array(9),boxes=new Uint16Array(9);
  for(let i=0;i<81;i++){
    const n=p[i];if(!n)continue;
    const r=Math.floor(i/9),c=i%9,b=Math.floor(r/3)*3+Math.floor(c/3), bit=1<<n;
    if((rows[r]|cols[c]|boxes[b])&bit)return 0;
    rows[r]|=bit;cols[c]|=bit;boxes[b]|=bit;
  }
  function search(){
    let choice=-1, choices=0, least=10;
    for(let i=0;i<81;i++){
      if(p[i])continue;
      const r=Math.floor(i/9),c=i%9,b=Math.floor(r/3)*3+Math.floor(c/3);
      const bits=(~(rows[r]|cols[c]|boxes[b]))&1022;
      if(!bits)return 0;
      let n=0;
      for(let x=bits;x;x&=x-1)n++;
      if(n<least){least=n;choice=i;choices=bits;if(n===1)break;}
    }
    if(choice===-1)return 1;
    const r=Math.floor(choice/9),c=choice%9,b=Math.floor(r/3)*3+Math.floor(c/3);
    let found=0;
    for(let bits=choices;bits;bits&=bits-1){
      const bit=bits&-bits,n=31-Math.clz32(bit);
      p[choice]=n;rows[r]|=bit;cols[c]|=bit;boxes[b]|=bit;
      found+=search();
      p[choice]=0;rows[r]^=bit;cols[c]^=bit;boxes[b]^=bit;
      if(found>=limit)break;
    }
    return found;
  }
  return search();
}
function puzzle(level){
  const target={easy:38,medium:46,hard:52}[level]||38;
  let best=null, bestCount=-1;
  const rounds=level==='hard'?4:2;
  for(let attempt=0;attempt<rounds;attempt++){
    const solved=fullGrid(),grid=solved.slice();
    let erased=0;
    for(const index of shuffle(Array.from({length:81},(_,i)=>i))){
      if(erased>=target)break;
      const v=grid[index];grid[index]=0;
      if(solutions(grid,2)===1)erased++;else grid[index]=v;
    }
    if(erased>bestCount){best={solved,grid};bestCount=erased;}
    if(erased===target)break;
  }
  return best;
}
const S={answer:[],fixed:[],values:[],notes:[],selected:-1,history:[],hints:3,seconds:0,won:false,noteMode:false,bad:new Set()};
function timeText(n){const m=Math.floor(n/60),sec=n%60;return String(m).padStart(2,'0')+':'+String(sec).padStart(2,'0');}
function sudokuStatus(t){$('#s-status').textContent=t;}
function saveSudoku(){S.history.push({values:S.values.slice(),notes:S.notes.map(x=>x.slice())});if(S.history.length>100)S.history.shift();}
function drawSudoku(){
  const selectedNumber=S.selected>=0?S.values[S.selected]:0;
  const sr=Math.floor(S.selected/9),sc=S.selected%9,sb=Math.floor(sr/3)*3+Math.floor(sc/3);
  $('#s-board').innerHTML=S.values.map((v,i)=>{
    const r=Math.floor(i/9),c=i%9,b=Math.floor(r/3)*3+Math.floor(c/3),classes=['sudoku-cell'];
    if(S.fixed[i])classes.push('given');
    if(c===2||c===5)classes.push('box-r');
    if(r===2||r===5)classes.push('box-b');
    if(i===S.selected)classes.push('selected');
    else if(S.selected>=0&&(r===sr||c===sc||b===sb))classes.push('peer');
    if(selectedNumber&&v===selectedNumber&&i!==S.selected)classes.push('same');
    if(S.bad.has(i))classes.push('wrong');
    let text=v?String(v):'';
    if(!v&&S.notes[i].length){
      text='<span class="pencil">'+Array.from({length:9},(_,j)=>'<span>'+(S.notes[i].includes(j+1)?j+1:'')+'</span>').join('')+'</span>';
    }
    return '<button type="button" class="'+classes.join(' ')+'" data-cell="'+i+'" aria-label="第'+(r+1)+'行第'+(c+1)+'列，'+(v?(S.fixed[i]?'已给定':'已填入')+v:'空格')+'" aria-pressed="'+(i===S.selected)+'">'+text+'</button>';
  }).join('');
  $('#s-count').textContent=S.values.filter(Boolean).length+'/81';
  $('#s-time').textContent=timeText(S.seconds);
  $('#s-hints').textContent=S.hints;
  $('#s-note').textContent='✎ 笔记：'+(S.noteMode?'开':'关');
  $('#s-note').setAttribute('aria-pressed',String(S.noteMode));
  $('#s-hint').disabled=S.hints<=0||S.won;
}
function newSudoku(){
  const out=puzzle($('#s-level').value);
  S.answer=out.solved;S.fixed=out.grid.slice();S.values=out.grid.slice();
  S.notes=Array.from({length:81},()=>[]);S.selected=S.values.indexOf(0);
  S.history=[];S.hints=3;S.seconds=0;S.won=false;S.noteMode=false;S.bad.clear();
  drawSudoku();sudokuStatus('新题已生成。点击空格，再选数字填写。');
}
function checkWin(){
  if(S.values.every((n,i)=>n===S.answer[i])){
    S.won=true;sudokuStatus('🎉 全部正确！用时 '+timeText(S.seconds)+'，恭喜完成数独！');
    return true;
  }
  return false;
}
function inputSudoku(n){
  const i=S.selected;
  if(S.won||i<0){sudokuStatus('先选择一个空格。');return;}
  if(S.fixed[i]){sudokuStatus('这个数字是题目给定的，不能修改。');return;}
  saveSudoku();
  if(S.noteMode&&n){
    const list=S.notes[i];
    S.notes[i]=list.includes(n)?list.filter(x=>x!==n):list.concat(n).sort((a,b)=>a-b);
  } else {
    S.values[i]=n;S.notes[i]=[];S.bad.delete(i);
    if(checkWin()){drawSudoku();return;}
  }
  drawSudoku();
  sudokuStatus(n?'已记录 '+n+'。继续思考下一格。':'已清除这个格子。');
}
$('#s-board').addEventListener('click',e=>{
  const b=e.target.closest('button[data-cell]');if(!b)return;
  S.selected=Number(b.dataset.cell);
  drawSudoku();
  if(S.fixed[S.selected])sudokuStatus('此格是题目给定数字。');
});
$('#s-pad').innerHTML=Array.from({length:9},(_,i)=>'<button type="button" data-number="'+(i+1)+'">'+(i+1)+'</button>').join('');
$('#s-pad').addEventListener('click',e=>{const b=e.target.closest('button[data-number]');if(b)inputSudoku(Number(b.dataset.number));});
$('#s-erase').addEventListener('click',()=>inputSudoku(0));
$('#s-note').addEventListener('click',()=>{S.noteMode=!S.noteMode;drawSudoku();sudokuStatus(S.noteMode?'笔记模式：数字只记录为候选，不正式填入。':'已退出笔记模式。');});
$('#s-undo').addEventListener('click',()=>{
  if(S.won){sudokuStatus('已完成的数独不可撤销，可重新出题。');return;}
  const prev=S.history.pop();if(!prev){sudokuStatus('当前没有可撤销的步骤。');return;}
  S.values=prev.values;S.notes=prev.notes;S.bad.clear();drawSudoku();sudokuStatus('已撤销上一步。');
});
$('#s-check').addEventListener('click',()=>{
  S.bad=new Set(S.values.map((n,i)=>n&&n!==S.answer[i]?i:-1).filter(i=>i>=0));
  drawSudoku();sudokuStatus(S.bad.size?'发现 '+S.bad.size+' 处填写不正确，已用红色标记。':'目前填入的数字全部正确，继续加油。');
});
$('#s-hint').addEventListener('click',()=>{
  if(S.won||S.hints<=0)return;
  let i=S.selected;
  if(i<0||S.fixed[i]||S.values[i]===S.answer[i])i=S.values.findIndex((n,j)=>n!==S.answer[j]);
  if(i<0){checkWin();return;}
  S.selected=i;saveSudoku();S.hints--;S.values[i]=S.answer[i];S.notes[i]=[];S.bad.delete(i);
  if(!checkWin())sudokuStatus('已为你填入一个正确数字，剩余提示 '+S.hints+' 次。');
  drawSudoku();
});
$('#s-new').addEventListener('click',newSudoku);
$('#s-level').addEventListener('change',newSudoku);
setInterval(()=>{if(active==='sudoku'&&!S.won&&S.values.length){S.seconds++;$('#s-time').textContent=timeText(S.seconds);}},1000);

// 2048: both touch swipes and the four direction buttons are supported.
const T={board:Array(16).fill(0),score:0,best:0,undo:null,won:false};
function spawn(){
  const open=T.board.map((n,i)=>n?-1:i).filter(i=>i>=0);
  if(open.length)T.board[open[random(open.length)]]=Math.random()<.9?2:4;
}
function draw2048(){
  $('#t-board').innerHTML=T.board.map(n=>'<div class="twenty-tile" data-value="'+n+'">'+(n||'')+'</div>').join('');
  $('#t-board').setAttribute('aria-label','2048棋盘：'+T.board.map(n=>n||'空').join('，'));
  $('#t-score').textContent=T.score;$('#t-best').textContent=T.best;
  $('#t-undo').disabled=!T.undo;
}
function start2048(){
  T.board=Array(16).fill(0);T.score=0;T.undo=null;T.won=false;spawn();spawn();draw2048();
  $('#t-status').textContent='移动相同数字，向2048前进。';
}
function canMove2048(){
  if(T.board.includes(0))return true;
  for(let r=0;r<4;r++)for(let c=0;c<4;c++){
    const i=r*4+c;
    if(c<3&&T.board[i]===T.board[i+1])return true;
    if(r<3&&T.board[i]===T.board[i+4])return true;
  }
  return false;
}
function move2048(dir){
  if(!['left','right','up','down'].includes(dir))return;
  const prev=T.board.slice(),priorScore=T.score;
  for(let k=0;k<4;k++){
    const indexes=Array.from({length:4},(_,j)=>{
      if(dir==='left')return k*4+j;
      if(dir==='right')return k*4+3-j;
      if(dir==='up')return j*4+k;
      return (3-j)*4+k;
    });
    const nonzero=indexes.map(i=>T.board[i]).filter(Boolean),out=[];
    for(let i=0;i<nonzero.length;i++){
      if(i+1<nonzero.length&&nonzero[i]===nonzero[i+1]){
        const v=nonzero[i]*2;out.push(v);T.score+=v;i++;
      } else out.push(nonzero[i]);
    }
    while(out.length<4)out.push(0);
    indexes.forEach((index,j)=>T.board[index]=out[j]);
  }
  if(prev.every((v,i)=>v===T.board[i]))return;
  T.undo={board:prev,score:priorScore};
  T.best=Math.max(T.best,T.score);
  spawn();draw2048();
  if(!T.won&&T.board.some(v=>v>=2048)){T.won=true;$('#t-status').textContent='🎉 你合出了2048！还可以继续挑战更高分。';}
  else if(!canMove2048())$('#t-status').textContent='棋盘已满且无法移动，本局结束。点击新开一局再试一次。';
  else $('#t-status').textContent='本局继续，当前得分 '+T.score+'。';
}
$('#t-new').addEventListener('click',start2048);
$('#t-undo').addEventListener('click',()=>{
  if(!T.undo)return;
  T.board=T.undo.board.slice();T.score=T.undo.score;T.undo=null;draw2048();
  $('#t-status').textContent='已撤销上一步。';
});
document.querySelectorAll('[data-dir]').forEach(b=>b.addEventListener('click',()=>move2048(b.dataset.dir)));
let startTouch=null;
$('#t-board').addEventListener('touchstart',e=>{if(e.touches.length===1)startTouch={x:e.touches[0].clientX,y:e.touches[0].clientY};},{passive:true});
$('#t-board').addEventListener('touchend',e=>{
  if(!startTouch||!e.changedTouches.length)return;
  const dx=e.changedTouches[0].clientX-startTouch.x,dy=e.changedTouches[0].clientY-startTouch.y;startTouch=null;
  if(Math.max(Math.abs(dx),Math.abs(dy))<25)return;
  move2048(Math.abs(dx)>Math.abs(dy)?(dx>0?'right':'left'):(dy>0?'down':'up'));
},{passive:true});

// Sliding puzzle: shuffle by legal moves so every board is solvable.
const L={tiles:[],moves:0,done:false};
function neighbors(z){
  const r=Math.floor(z/4),c=z%4,a=[];
  if(r>0)a.push(z-4);if(r<3)a.push(z+4);
  if(c>0)a.push(z-1);if(c<3)a.push(z+1);
  return a;
}
function solvedSlide(){return L.tiles.every((v,i)=>v===(i===15?0:i+1));}
function drawSlide(){
  const blank=L.tiles.indexOf(0),movable=neighbors(blank);
  $('#l-board').innerHTML=L.tiles.map((v,i)=>{
    const can=movable.includes(i);
    return '<button type="button" data-tile="'+i+'" class="slide-tile'+(!v?' empty':can?' movable':'')+'" '+(!v||L.done?'disabled':'')+' aria-label="'+(v?'移动数字 '+v:'空白格')+'">'+(v||'')+'</button>';
  }).join('');
  $('#l-count').textContent=L.moves;
}
function newSlide(){
  L.tiles=Array.from({length:16},(_,i)=>i===15?0:i+1);L.moves=0;L.done=false;
  let old=-1;
  for(let step=0;step<160;step++){
    const blank=L.tiles.indexOf(0),options=neighbors(blank).filter(i=>i!==old);
    const pos=options[random(options.length)];
    [L.tiles[blank],L.tiles[pos]]=[L.tiles[pos],L.tiles[blank]];old=blank;
  }
  if(solvedSlide()){const z=L.tiles.indexOf(0),n=neighbors(z)[0];[L.tiles[z],L.tiles[n]]=[L.tiles[n],L.tiles[z]];}
  drawSlide();$('#l-status').textContent='每次只能移动空格旁边的一块数字。试着复原顺序！';
}
$('#l-board').addEventListener('click',e=>{
  const b=e.target.closest('button[data-tile]');if(!b||L.done)return;
  const i=Number(b.dataset.tile),blank=L.tiles.indexOf(0);
  if(!neighbors(blank).includes(i)){$('#l-status').textContent='只能移动与空白格相邻的数字。';return;}
  [L.tiles[blank],L.tiles[i]]=[L.tiles[i],L.tiles[blank]];L.moves++;
  if(solvedSlide()){L.done=true;$('#l-status').textContent='🎉 拼图完成！你一共用了 '+L.moves+' 步。';}
  drawSlide();
});
$('#l-new').addEventListener('click',newSlide);

document.addEventListener('keydown',e=>{
  const tag=e.target.tagName;
  if(tag==='INPUT'||tag==='SELECT'||tag==='TEXTAREA'||e.altKey||e.ctrlKey||e.metaKey)return;
  if(active==='twenty'){
    const direction={ArrowLeft:'left',ArrowRight:'right',ArrowUp:'up',ArrowDown:'down'}[e.key];
    if(direction){e.preventDefault();move2048(direction);}
  }else if(active==='sudoku'&&S.selected>=0){
    if(/^[1-9]$/.test(e.key)){e.preventDefault();inputSudoku(Number(e.key));}
    else if(e.key==='Backspace'||e.key==='Delete'){e.preventDefault();inputSudoku(0);}
    else {
      const delta={ArrowLeft:-1,ArrowRight:1,ArrowUp:-9,ArrowDown:9}[e.key];
      if(delta){e.preventDefault();S.selected=Math.max(0,Math.min(80,S.selected+delta));drawSudoku();}
    }
  }
});

newSudoku();start2048();newSlide();
})();