(() => {
'use strict';
const $=q=>document.querySelector(q),core=window.AtlasQuizCore;
const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let current={trail:['中国'],manual:[],specialtySource:''},displayCount=8,version=0;
const fileUrl=name=>'https://commons.wikimedia.org/wiki/Special:FilePath/'+encodeURIComponent(name)+'?width=640';
const filePage=name=>'https://commons.wikimedia.org/wiki/File:'+encodeURIComponent(name);
const searchPage=name=>'https://commons.wikimedia.org/w/index.php?search='+encodeURIComponent(name)+'&title=Special:MediaSearch&type=image';
function data(){
 const trail=current.trail||['中国'],raw=window.atlasProducts||[];
 const area=core.productsFor(raw,trail),legacy=current.manual||[];
 const imageByName=new Map(legacy.filter(x=>x.file).map(x=>[x.name,x.file]));
 const seen=new Set();
 let goods=area.products.map(row=>({
  name:row[0],province:row[1],city:row[2],
  description:row[4]||'该地理标志产品的文字描述尚未收录。',
  photo:imageByName.get(row[0])||'',kind:'地理标志资料'
 }));
 // In areas outside the 31 provinces covered by the GI dataset, continue displaying the curated local samples.
 if(!goods.length){
  goods=legacy.map(x=>({
   name:x.name,province:trail[1]||'',city:'',description:x.description||'地方特色资料',photo:x.file||'',kind:'风物资料'
  }));
 }
 goods=goods.filter(x=>{
  if(!x.name||seen.has(x.name))return false;
  seen.add(x.name);return true;
 });
 return {...area,goods,source:area.products.length?area.source:(current.specialtySource||area.source)};
}
function draw(){
 const grid=$('#special-grid'),desc=$('#special-desc'),more=$('#special-more');
 if(!grid||!desc)return;
 const trail=current.trail||['中国'];
 if(trail.length===1){
  desc.textContent='选择省份、城市或区县后，浏览该地区收录的特色产品。';
  grid.innerHTML='<div class="special-empty">选择地图上的地区，开启地方风物图鉴。</div>';
  if(more)more.hidden=true;return;
 }
 const selection=data(),goods=selection.goods;
 const inherited=selection.level.includes('fallback')||(selection.level==='manual'&&trail.length>2);
 desc.textContent=(inherited?'当地专属特产不足，正在展示上级「'+selection.source+'」的资料。':'「'+selection.source+'」已收录 '+goods.length+' 项相关产品。')+
  ' 地理标志数据来自公开公告的第三方整理版本，可能有历史调整或提取误差，并非实时官方名录。';
 if(!goods.length){grid.innerHTML='<div class="special-empty">未收录足够可信的当地特产信息，不使用其他地区图片冒充。</div>';if(more)more.hidden=true;return;}
 const slice=goods.slice(0,displayCount);
 grid.innerHTML=slice.map(x=>{
  const source=x.kind==='地理标志资料'?'https://www.cnipa.gov.cn/col/col256/index.html':'https://xccys.moa.gov.cn/xxzlcx/202002/t20200227_6337876.htm';
  return '<article class="special-card"><div class="special-image">'+(x.photo?
   '<img loading="lazy" src="'+escapeHTML(fileUrl(x.photo))+'" alt="'+escapeHTML(x.name)+'的公开照片">':
   '<div class="photo-unavailable">实拍图片待核实<br><small>点击下方查询公开图库</small></div>')+
   '</div><div class="special-body"><span class="special-kind">'+escapeHTML(x.kind)+'</span><h3>'+escapeHTML(x.name)+'</h3>'+
   '<p>'+escapeHTML(x.city?'资料所列城市：'+x.city+'。':'')+escapeHTML(x.description.slice(0,88))+'</p>'+
   '<div class="special-links"><a target="_blank" rel="noopener" href="'+escapeHTML(x.photo?filePage(x.photo):searchPage(x.name))+'">'+(x.photo?'图片来源':'检索真实照片')+' ↗</a>'+
   '<a target="_blank" rel="noopener" href="'+escapeHTML(source)+'">资料来源 ↗</a></div></div></article>';
 }).join('');
 grid.querySelectorAll('img').forEach(img=>img.addEventListener('error',()=>{
  const box=img.closest('.special-image');
  if(box)box.innerHTML='<div class="photo-unavailable">图片暂无法加载<br>请使用图片来源查询</div>';
 }));
 if(more){more.hidden=goods.length<=displayCount;more.textContent='查看更多特产（'+Math.min(displayCount,goods.length)+' / '+goods.length+'）';}
}
window.addEventListener('atlas:region',e=>{
 const next=e.detail||{},key=JSON.stringify(next.trail||[]);
 if(key!==JSON.stringify(current.trail)){displayCount=8;}
 current={...current,...next};version++;draw();
});
window.addEventListener('atlas:products',()=>{displayCount=8;version++;draw();});
$('#special-more')?.addEventListener('click',()=>{displayCount+=12;draw();});
})();
