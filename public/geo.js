(() => {
'use strict';
const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const normal=s=>String(s||'').trim().replace(/\s/g,'').replace(/[臺區鄉縣鎮東灣龍馬門廣國華義鳳雲蘭長島廈陽陰廟廠頭廟蘆豐鐵莊壽麗鶴烏龜莊們裏紅濱靈寶雜雙維寧歲務濟斷鷹廟]/g,ch=>({'臺':'台','區':'区','鄉':'乡','縣':'县','鎮':'镇','東':'东','灣':'湾','龍':'龙','馬':'马','門':'门','廣':'广','國':'国','華':'华','義':'义','鳳':'凤','雲':'云','蘭':'兰','長':'长','島':'岛','廈':'厦','陽':'阳','陰':'阴','廟':'庙','廠':'厂','頭':'头','蘆':'芦','豐':'丰','鐵':'铁','莊':'庄','壽':'寿','麗':'丽','鶴':'鹤','烏':'乌','龜':'龟','們':'们','裏':'里','紅':'红','濱':'滨','靈':'灵','寶':'宝','雜':'杂','雙':'双','維':'维','寧':'宁','歲':'岁','務':'务','濟':'济','斷':'断','鷹':'鹰'}[ch]||ch)).replace(/街道办事处$/,'街道').replace(/居民委员会$|社区居委会$/,'社区').replace(/村民委员会$|村委会$/,'村');
function comparable(v){return normal(v).replace(/(特别行政区|维吾尔自治区|壮族自治区|回族自治区|自治区|自治州|地区|省|市|县|区|乡|镇|街道)$/,'');}
const sources={moh:'https://xccys.moa.gov.cn/xxzlcx/202002/t20200227_6337876.htm',gi:'https://www.cnipa.gov.cn/attach/0/baf15fc1f5b74750bf14e64ec11ca970.pdf'};
const product=(name,description,file='',src='moh')=>({name,description,file,ref:sources[src]||sources.moh});
const special={
'北京市':[product('北京烤鸭','经典北京风味，烤制后配薄饼、葱丝食用。','Beijing Roast Duck slice and side dishes.jpg')],
'天津市':[product('沙窝萝卜','天津地区具有代表性的地方农产品。')],
'河北省':[product('深州蜜桃','河北深州的特色鲜桃，列入地理标志目录。','','gi')],
'山西省':[product('太谷饼','山西晋中传统糕点。')],
'内蒙古自治区':[product('锡林郭勒羊肉','草原地区知名地理标志畜产品。','','gi')],
'辽宁省':[product('旅顺海带','大连旅顺地区特色海产品。','','gi')],
'吉林省':[product('长白山人参','吉林传统药材和地方特色产品。','','gi')],
'黑龙江省':[product('五常大米','东北寒地优质稻米代表。')],
'上海市':[product('松江大米','上海松江地区特色大米。','','gi')],
'江苏省':[product('洞庭碧螺春茶','江苏苏州太湖周边出产的名茶。','','gi')],
'浙江省':[product('西湖龙井','杭州西湖地区的代表性绿茶。','Longjing tea 7.jpg')],
'安徽省':[product('黄山毛峰','安徽黄山一带出产的名茶。')],
'福建省':[product('武夷岩茶','武夷山地区特色乌龙茶。')],
'江西省':[product('赣南脐橙','江西赣南地区具有代表性的柑橘。')],
'山东省':[product('烟台苹果','山东烟台传统特色水果。')],
'河南省':[product('信阳毛尖','河南信阳名优绿茶。')],
'湖北省':[product('洪湖莲藕','湖北洪湖特色水生农产品。')],
'湖南省':[product('安化黑茶','湖南益阳安化的特色黑茶。')],
'广东省':[product('新会陈皮','江门新会产柑皮制作的传统特产。')],
'广西壮族自治区':[product('柳州螺蛳粉','柳州特色米粉美食。')],
'海南省':[product('文昌鸡','海南文昌地区传统特色鸡种与菜肴。')],
'重庆市':[product('涪陵榨菜','重庆涪陵代表性腌制蔬菜。')],
'四川省':[product('郫县豆瓣','成都郫都区传统发酵调味品，有“川菜之魂”之称。','Pixian Doubanjiang.png'),product('四川花椒','川味烹调常用的香辛料。')],
'贵州省':[product('都匀毛尖','贵州都匀代表性名茶。')],
'云南省':[product('普洱茶','云南传统发酵茶，茶叶制作技艺传承悠久。','Puer tea from Yunnan, Rostov-on-Don, Russia.jpg')],
'西藏自治区':[product('青稞','高原地区重要粮食作物，可制作糌粑。')],
'陕西省':[product('洛川苹果','陕西延安洛川县代表性苹果。')],
'甘肃省':[product('兰州百合','甘肃兰州传统食用百合。')],
'青海省':[product('青海牦牛肉','青藏高原地区传统肉类产品。')],
'宁夏回族自治区':[product('宁夏枸杞','宁夏代表性特色农产品。','Ningxia dried wolfberry.jpg')],
'新疆维吾尔自治区':[product('哈密瓜','新疆哈密一带闻名的甜瓜。','Heavenly Hami Melons.jpg')],
'台湾省':[product('台湾芒果','台湾地区栽种的热带水果。','Mangoes-left.jpg')],
'香港特别行政区':[product('港式鸡蛋仔','香港街头传统小食。')],
'澳门特别行政区':[product('澳门杏仁饼','澳门传统糕饼类伴手礼。')],
'成都市':[product('郫县豆瓣','原郫县（现郫都区）的传统发酵调味品。','Pixian Doubanjiang.png')],
'郫都区':[product('郫县豆瓣','产地与成都郫都区密切相关的地方特产。','Pixian Doubanjiang.png')],
'杭州市':[product('西湖龙井','杭州西湖茶区的特色茶叶。','Longjing tea 7.jpg')],
'新北市':[product('台湾芒果','台湾地区特色水果（地区级代表，非本区专属）。','Mangoes-left.jpg')],
'臺北市':[product('台湾芒果','台湾地区特色水果（地区级代表，非本市专属）。','Mangoes-left.jpg')],
'哈密市':[product('哈密瓜','新疆哈密闻名的地方甜瓜。','Heavenly Hami Melons.jpg')],
'银川市':[product('宁夏枸杞','宁夏地区代表性农产品。','Ningxia dried wolfberry.jpg')]
};
let provinces=[],pcas={},codeTree=[],twTree={},trail=['中国'],answerList=[],revealed=false,hintCount=0,twLoading=false;
const villageCache={},loadingVillage=new Set(),initialMsg='填写下辖地名可以获得积分，答案正确后可进入下一级。';
let record={found:{},score:0,gameWins:{}};
try{const obj=JSON.parse(localStorage.getItem('casual-atlas-progress-v1')||'{}');if(obj&&typeof obj==='object')record={found:obj.found&&typeof obj.found==='object'?obj.found:{},score:Number.isFinite(obj.score)?Math.max(0,obj.score):0,gameWins:obj.gameWins&&typeof obj.gameWins==='object'?obj.gameWins:{}};}catch{}
const persist=()=>{try{localStorage.setItem('casual-atlas-progress-v1',JSON.stringify(record));}catch{}};
function foundKey(name){return [...trail,name].join('/');}
function provinceName(){return trail[1]||'';}
function fetchJson(url){return fetch(url,{cache:'force-cache'}).then(r=>{if(!r.ok)throw Error('数据暂不可用 '+r.status);return r.json();});}
function getMapName(name){return name==='臺灣省'?'台湾省':name;}
function provinceCode(){const p=provinces.find(p=>p.properties.name===provinceName());return p?String(Math.floor(p.properties.adcode/10000)).padStart(2,'0'):'';}
function codeForDistrict(){
 const root=codeTree.find(p=>normal(p.name)===normal(trail[1]));if(!root)return '';
 const city=(root.children||[]).find(c=>normal(c.name)===normal(trail[2]));if(!city)return '';
 return (city.children||[]).find(a=>normal(a.name)===normal(trail[3]))?.code||'';
}
async function loadTaiwan(){
 if(Object.keys(twTree).length||twLoading)return;
 twLoading=true;
 try{
  const response=await fetch('/geo/taiwan-villages.csv');
  if(!response.ok)throw Error('台湾村里目录暂不可用');
  const csv=await response.text();
  for(const line of csv.split(/\r?\n/).slice(1)){
   if(!line.trim())continue;
   const values=line.match(/(?:"(?:[^"]|"")*"|[^,])+/g);
   if(!values||values.length<4)continue;
   const clean=x=>String(x||'').replace(/^"|"$/g,'').replace(/""/g,'"').trim();
   const county=clean(values[3]),town=clean(values[2]),village=clean(values[1]);
   if(!county||!town||!village)continue;
   if(!twTree[county])twTree[county]={};
   if(!twTree[county][town])twTree[county][town]=[];
   if(!twTree[county][town].includes(village))twTree[county][town].push(village);
  }
 }catch(error){$('#atlas-response').textContent=error.message;}
 finally{twLoading=false;if(provinceName()==='台湾省')render();}
}
async function loadVillages(province){
 const code=provinceCode();if(!code||villageCache[code]||loadingVillage.has(code))return;
 loadingVillage.add(code);
 try{villageCache[code]=await fetchJson('/geo/villages/'+code+'.json');}
 catch{villageCache[code]={index:{},villages:{},missing:true};}
 finally{loadingVillage.delete(code);if(provinceName()===province)render();}
}
function children(){
 if(trail.length===1)return provinces.filter(p=>p.properties.name).map(p=>p.properties.name);
 const province=trail[1];
 if(province==='台湾省'){
  if(trail.length===2)return Object.keys(twTree).length?Object.keys(twTree):Object.keys(window.atlasExtra?.['台湾省']||{});
  if(trail.length===3){const county=Object.keys(twTree).find(k=>normal(k)===normal(trail[2]));return Object.keys(twTree[county]||{});}
  if(trail.length===4){const county=Object.keys(twTree).find(k=>normal(k)===normal(trail[2]));const towns=twTree[county]||{};const town=Object.keys(towns).find(k=>normal(k)===normal(trail[3]));return towns[town]||[];}
  return [];
 }
 const extra=window.atlasExtra?.[province];
 if(extra){
  if(trail.length===2)return Object.keys(extra);
  if(trail.length===3)return extra[trail[2]]||[];
  return [];
 }
 const one=pcas[province]||{};
 if(trail.length===2)return Object.keys(one);
 const two=one[trail[2]]||{};
 if(trail.length===3)return Object.keys(two);
 if(trail.length===4)return two[trail[3]]||[];
 if(trail.length!==5)return [];
 const code=provinceCode(),data=villageCache[code],districtCode=codeForDistrict();
 const area=data?.index?.[districtCode]||{};
 const streetCode=area[trail[4]]||Object.entries(area).find(([name])=>normal(name)===normal(trail[4]))?.[1];
 return data?.villages?.[streetCode]||[];
}
function setResponse(message){$('#atlas-response').textContent=message;}
window.addEventListener('atlas:reward',event=>{
 const mode=event.detail?.game;
 if(!['match','place','special'].includes(mode))return;
 const now=new Date(),day=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
 const key=[...trail,mode,day].join('/');
 if(record.gameWins[key])return;
 record.gameWins[key]=true;record.score+=20;persist();statRender();
});
function statRender(){
 const num=Object.keys(record.found).length;
 $('#atlas-found').textContent=num;$('#atlas-score').textContent=record.score;
 $('#atlas-level').textContent=num>=500?'地名大师':num>=100?'城市达人':num>=25?'全国旅人':num>=5?'探索学徒':'地理新手';
}
function alternativePlaces(){
 const len=trail.length,province=provinceName();
 if(len===1)return uniqueNames(Object.values(pcas).flatMap(tree=>Object.keys(tree||{})).slice(0,220));
 if(province==='台湾省'){
  if(len===2)return uniqueNames(Object.keys(pcas).flatMap(p=>Object.keys(pcas[p]||{})).slice(0,170));
  const county=Object.keys(twTree).find(k=>normal(k)===normal(trail[2]));
  if(len===3)return uniqueNames(Object.entries(twTree).filter(([k])=>k!==county).flatMap(([,towns])=>Object.keys(towns)).slice(0,250));
  if(len===4)return uniqueNames(Object.entries(twTree[county]||{}).filter(([k])=>normal(k)!==normal(trail[3])).flatMap(([,villages])=>villages).slice(0,250));
  return [];
 }
 if(len===2)return uniqueNames(Object.entries(pcas).filter(([p])=>p!==province).flatMap(([,cities])=>Object.keys(cities)).slice(0,240));
 const cities=pcas[province]||{};
 if(len===3)return uniqueNames(Object.entries(cities).filter(([c])=>c!==trail[2]).flatMap(([,areas])=>Object.keys(areas)).slice(0,250));
 const areas=cities[trail[2]]||{};
 if(len===4)return uniqueNames(Object.entries(areas).filter(([a])=>a!==trail[3]).flatMap(([,streets])=>streets).slice(0,300));
 if(len===5){const data=villageCache[provinceCode()];return uniqueNames(Object.entries(data?.villages||{}).flatMap(([,vs])=>vs.slice(0,3)).slice(0,300));}
 return [];
}
function uniqueNames(names){return [...new Set(names.filter(Boolean))];}
function render(){
 statRender();const ch=children();answerList=ch;
 const title=trail.at(-1),len=trail.length;
 const kind=len===1?'省级地区':len===2?(provinceName()==='台湾省'?'县市':'地级地区'):(len===3?(provinceName()==='台湾省'?'乡镇市区':'区县'):(len===4?(provinceName()==='台湾省'?'村里':'乡镇街道'):'村和社区'));
 $('#atlas-question').textContent=ch.length?'填写「'+title+'」下辖的'+kind:('已到达「'+title+'」');
 let loading=false;
 if(provinceName()==='台湾省'&&!Object.keys(twTree).length&&twLoading)loading=true;
 if(len===5&&loadingVillage.has(provinceCode()))loading=true;
 if(loading)$('#atlas-question').textContent='正在读取下一级地名…';
 const matched=ch.filter(n=>record.found[foundKey(n)]);
 $('#atlas-ratio').textContent=matched.length+' / '+ch.length;
 $('#atlas-local-count').textContent=matched.length+' 个';
 $('#atlas-progress').style.width=(ch.length?matched.length/ch.length*100:0)+'%';
 $('#atlas-answer').disabled=!ch.length;
 $('#atlas-form button').disabled=!ch.length;
 $('#atlas-answer').placeholder=ch.length?'填写'+kind+'名称，如：'+(len===1?'四川省':len===3?'武侯区':ch[0]||'地名'):'此处暂无下级目录';
 $('#atlas-collected').innerHTML=matched.length?matched.map(n=>'<button type="button" class="saved" data-enter="'+esc(n)+'">'+esc(n)+' ↗</button>').join(''):'<span class="empty-note">还没有答对任何地名，可先从上方输入。</span>';
 $('#atlas-answers').hidden=!revealed;
 $('#atlas-hide').hidden=!revealed;$('#atlas-show').hidden=revealed;
 $('#atlas-options').innerHTML=ch.length?ch.map(n=>'<button type="button" class="'+(record.found[foundKey(n)]?'saved':'')+'" data-enter="'+esc(n)+'">'+esc(n)+' ↗</button>').join(''):'<span class="empty-note">'+(loading?'正在载入数据':len===5?'村级数据暂无可查结果（可能缺失或已变动）':'这里是当前收录的最末一级')+'</span>';
 $('#atlas-hint').disabled=!ch.length;
 $('#atlas-breadcrumb').innerHTML=trail.map((n,i)=>'<button type="button" data-step="'+i+'">'+esc(n)+'</button>').join('<span class="sep">›</span>');
 $('#atlas-subtext').textContent=len<=2?'点选地图，也可以输入下一级地名':len<5?'可继续填空并进入街道或社区':'已深入到街道层级，可继续探索村和社区';
 if(!ch.length&&!loading)setResponse('当前层级没有更多下辖地名，或数据源暂未覆盖。返回上一级可继续探索。');
 showSpecialties();
 refreshMapSelection();
 const exact=special[trail.at(-1)],upper=special[provinceName()];
 const selected=exact||upper||[];
 const source=exact?trail.at(-1):upper?provinceName():'';
 const siblings=trail.length>1?(trail.length===2?provinces.map(p=>p.properties.name):[]):[];
 window.dispatchEvent(new CustomEvent('atlas:region',{detail:{
  trail:[...trail],children:[...ch],others:alternativePlaces(),siblings,
  specialties:selected.map(x=>({name:x.name,file:x.file})),specialtySource:source,
  specialtyOptions:uniqueNames(Object.values(special).flatMap(items=>items.map(x=>x.name)))
 }}));
}
function jumpTo(index){
 if(!Number.isInteger(index)||index<0||index>=trail.length)return;
 trail=trail.slice(0,index+1);revealed=false;hintCount=0;
 $('#atlas-answer').value='';setResponse(initialMsg);render();focusMap();
}
function enter(name){
 if(!children().includes(name))return;
 trail.push(name);revealed=false;hintCount=0;$('#atlas-answer').value='';setResponse('已进入「'+name+'」。继续填写下一级地名。');
 render();focusMap();
 if(provinceName()==='台湾省'&&trail.length===2)loadTaiwan();
 if(trail.length>=4&&provinceName()!=='台湾省'&&!window.atlasExtra?.[provinceName()])loadVillages(provinceName());
}
$('#atlas-form').addEventListener('submit',event=>{
 event.preventDefault();
 const value=$('#atlas-answer').value.trim();
 if(!value){setResponse('请先填写地名。');return;}
 const ch=children();
 const exact=ch.find(n=>normal(n)===normal(value));
 const relaxed=ch.filter(n=>comparable(n)===comparable(value));
 const hit=exact||(relaxed.length===1?relaxed[0]:null);
 if(!hit){setResponse('暂未匹配「'+value+'」，请检查名称或点“给我提示”。');return;}
 const key=foundKey(hit);
 if(!record.found[key]){
  const pts=hintCount?5:10;record.found[key]=Date.now();record.score+=pts;persist();
  setResponse('✓ 正确！「'+hit+'」已收集，+'+pts+'分。点击已答对的地名可继续深入。');
 }else setResponse('「'+hit+'」已收集过，点击下方地名可继续进入。');
 $('#atlas-answer').value='';render();
});
$('#atlas-hint').addEventListener('click',()=>{
 const candidates=children().filter(n=>!record.found[foundKey(n)]);
 if(!candidates.length){setResponse('这一层的地名已经全部答对了。');return;}
 const name=candidates[0];hintCount++;
 setResponse('提示：共有 '+candidates.length+' 个尚未答对的地名。可以试试「'+name[0]+' '+('·').repeat(Math.min(name.length-1,10))+'」（共'+name.length+'字）。使用提示后本级新答案每个可得5分。');
});
$('#atlas-show').addEventListener('click',()=>{revealed=true;render();setResponse('已列出全部已收录下辖地名；直接点击可以进入，但不会获得答题积分。');});
$('#atlas-hide').addEventListener('click',()=>{revealed=false;render();});
function nameButton(event){
 const b=event.target.closest('button[data-enter]');if(b)enter(b.dataset.enter);
}
$('#atlas-collected').addEventListener('click',nameButton);
$('#atlas-options').addEventListener('click',nameButton);
$('#atlas-breadcrumb').addEventListener('click',e=>{const b=e.target.closest('button[data-step]');if(b)jumpTo(Number(b.dataset.step));});
$('#atlas-home').addEventListener('click',()=>jumpTo(0));
$('#atlas-daily').addEventListener('click',()=>{
 const seeds=[['四川省','成都市'],['广东省','广州市'],['浙江省','杭州市'],['湖北省','武汉市'],['陕西省','西安市'],['福建省','厦门市'],['江苏省','南京市'],['山东省','济南市']];
 const day=Math.floor(Date.now()/86400000),target=seeds[day%seeds.length];
 trail=['中国',...target];revealed=false;hintCount=0;$('#atlas-answer').value='';render();focusMap();
 setResponse('今日挑战：尽量不看提示，填出「'+target.at(-1)+'」下辖的区县。');
});
function sourcePhoto(file){return 'https://commons.wikimedia.org/wiki/Special:FilePath/'+encodeURIComponent(file)+'?width=680';}
function photoPage(file){return 'https://commons.wikimedia.org/wiki/File:'+encodeURIComponent(file);}
let photoRenderToken=0;
function showSpecialties(){
 const here=trail.at(-1),p=provinceName(), exact=special[here],prov=special[p];
 const region=exact?here:(prov?p:'');const data=exact||prov||[];
 $('#special-desc').textContent=trail.length===1?'点击地区查看特色产品和实拍图片。':(exact?'正在展示「'+region+'」代表性特产。':prov?'当地专属特产待核实；先展示上级「'+p+'」的代表性特产。':'当前地点的特产图片尚未核实收录。');
 const grid=$('#special-grid');
 if(!data.length){grid.innerHTML='<div class="special-empty">当前地区暂无经过核实的专属特产图片。你可以返回省级查看已收录产品。</div>';return;}
 const token=++photoRenderToken;
 grid.innerHTML=data.map((x,i)=>{
  const fileLink=x.file?photoPage(x.file):'https://commons.wikimedia.org/w/index.php?search='+encodeURIComponent(x.name)+'&title=Special:MediaSearch&type=image';
  return '<article class="special-card"><div class="special-image" data-image-slot="'+i+'">'+(x.file?'<img loading="lazy" src="'+esc(sourcePhoto(x.file))+'" alt="'+esc(x.name)+'的真实资料照片">':'<div class="photo-unavailable">正在检索公开实拍照片…</div>')+'</div><div class="special-body"><h3>'+esc(x.name)+'</h3><p>'+esc(x.description)+'</p><div class="special-links"><a href="'+esc(fileLink)+'" target="_blank" rel="noopener">图片来源 ↗</a><a href="'+esc(x.ref)+'" target="_blank" rel="noopener">特产资料 ↗</a></div></div></article>';
 }).join('');
 grid.querySelectorAll('img').forEach(img=>img.addEventListener('error',()=>{
  const slot=img.closest('.special-image');if(slot)slot.innerHTML='<div class="photo-unavailable">图片暂无法加载，请点击下方图片来源查看</div>';
 }));
 data.forEach((item,i)=>{
  if(item.file)return;
  const url='https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch='+encodeURIComponent(item.name)+'&gsrnamespace=6&gsrlimit=5&prop=imageinfo&iiprop=url&iiurlwidth=600&format=json&origin=*';
  fetch(url).then(r=>r.ok?r.json():null).then(j=>{
   if(photoRenderToken!==token)return;
   const pages=Object.values(j?.query?.pages||{}).filter(p=>p?.imageinfo?.[0]?.thumburl&&/\.(png|jpg|jpeg|webp)$/i.test(p.title));
   // Do not show an unrelated image: the file name should contain the product's Chinese name.
   const matched=pages.find(p=>normal(p.title).includes(normal(item.name)));
   const slot=grid.querySelector('[data-image-slot="'+i+'"]');
   if(!slot)return;
   if(!matched){slot.innerHTML='<div class="photo-unavailable">暂未找到可核实的公开照片<br>点击图片来源查找</div>';return;}
   const info=matched.imageinfo[0];const img=document.createElement('img');img.loading='lazy';img.alt=item.name+'公开资料照片';img.src=info.thumburl;slot.replaceChildren(img);
   const link=slot.closest('.special-card')?.querySelector('.special-links a');if(link)link.href='https://commons.wikimedia.org/wiki/'+encodeURIComponent(matched.title.replace(/^File:/,'File:'));
  }).catch(()=>{const slot=grid.querySelector('[data-image-slot="'+i+'"]');if(slot&&photoRenderToken===token)slot.innerHTML='<div class="photo-unavailable">目前无法读取公开图库<br>点击图片来源查询</div>';});
 });
}
// Map geometry is based on the committed, published China province GeoJSON (not a sketch).
const W=920,H=630,layer=$('#map-layer'),svg=$('#atlas-map'),stage=$('#map-stage');
const merc=lat=>Math.log(Math.tan(Math.PI/4+Math.max(-80,Math.min(80,lat))*Math.PI/360));
const top=merc(54),bottom=merc(3);
const xy=pt=>[(pt[0]-73)/63*870+25,(top-merc(pt[1]))/(top-bottom)*585+17];
let camera={x:W/2,y:H/2,zoom:1},moving=false,pointer=null,mapBounds=new Map();
function coords(geometry){
 if(geometry.type==='Polygon')return [geometry.coordinates];
 if(geometry.type==='MultiPolygon')return geometry.coordinates;
 return [];
}
function generatePath(geometry){
 let value='',minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
 for(const polygon of coords(geometry)){
  for(const ring of polygon){
   ring.forEach((point,i)=>{
    if(point.length!==2||!point.every(Number.isFinite))return;
    const [x,y]=xy(point);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
    value+=(i?'L':'M')+x.toFixed(1)+' '+y.toFixed(1);
   });
   value+='Z';
  }
 }
 return {path:value,bounds:[minX,minY,maxX,maxY]};
}
function cameraApply(){
 const w=W/camera.zoom,h=H/camera.zoom;
 camera.x=Math.max(w/2-40,Math.min(W+40-w/2,camera.x));
 camera.y=Math.max(h/2-40,Math.min(H+40-h/2,camera.y));
 svg.setAttribute('viewBox',[camera.x-w/2,camera.y-h/2,w,h].join(' '));
}
function zoomBy(factor,point){
 const z=Math.max(1,Math.min(9,camera.zoom*factor));
 const k=camera.zoom/z;
 if(point){camera.x=point[0]+(camera.x-point[0])*k;camera.y=point[1]+(camera.y-point[1])*k;}
 camera.zoom=z;cameraApply();
}
function focusMap(){
 const region=provinceName();
 if(!region||!mapBounds.has(region)){camera={x:W/2,y:H/2,zoom:1};cameraApply();return;}
 const [x0,y0,x1,y1]=mapBounds.get(region),width=Math.max(55,x1-x0),height=Math.max(45,y1-y0);
 camera={x:(x0+x1)/2,y:(y0+y1)/2,zoom:Math.max(1,Math.min(5.7,W/(width+110),H/(height+95)))};
 cameraApply();
}
function refreshMapSelection(){
 layer.querySelectorAll('path[data-name]').forEach(el=>{
  const name=el.getAttribute('data-name');el.classList.toggle('picked',name===provinceName());el.classList.toggle('found',Boolean(record.found['中国/'+name]));
 });
 $('#map-message').textContent=provinceName()?'地图定位：'+provinceName()+'。可继续在地名列表深入下一级。':'全国省级地图：点击任意省级区域进入地名探索。';
}
function drawMap(){
 layer.replaceChildren();mapBounds.clear();
 for(const feature of provinces){
  const name=feature.properties.name;if(!name)continue;
  const data=generatePath(feature.geometry);if(!data.path)continue;
  mapBounds.set(name,data.bounds);
  const path=document.createElementNS('http://www.w3.org/2000/svg','path');
  path.setAttribute('d',data.path);path.setAttribute('class','geo-region');path.setAttribute('data-name',name);path.setAttribute('role','button');path.setAttribute('tabindex','0');path.setAttribute('aria-label','进入'+name+'探索');
  const title=document.createElementNS('http://www.w3.org/2000/svg','title');title.textContent=name;path.appendChild(title);
  const go=()=>{trail=['中国',name];revealed=false;hintCount=0;$('#atlas-answer').value='';render();focusMap();if(name==='台湾省')loadTaiwan();};
  path.addEventListener('click',e=>{if(moving){e.preventDefault();return;}go();});
  path.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go();}});
  layer.appendChild(path);
 }
 const labels=document.createElementNS('http://www.w3.org/2000/svg','g');labels.setAttribute('aria-hidden','true');
 const tiny=new Set(['香港特别行政区','澳门特别行政区','天津市','北京市','上海市']);
 for(const f of provinces){
  const p=f.properties;if(!p.name||tiny.has(p.name))continue;
  const center=p.centroid||p.center;if(!Array.isArray(center))continue;
  const [x,y]=xy(center);
  const label=document.createElementNS('http://www.w3.org/2000/svg','text');label.setAttribute('x',x);label.setAttribute('y',y);label.setAttribute('class','map-label');label.setAttribute('text-anchor','middle');
  label.textContent=p.name.replace(/维吾尔自治区|壮族自治区|回族自治区|特别行政区|自治区|省$/,'').replace(/市$/,'');
  labels.appendChild(label);
 }
 layer.appendChild(labels);refreshMapSelection();cameraApply();
}
$('#map-plus').addEventListener('click',()=>zoomBy(1.5));
$('#map-minus').addEventListener('click',()=>zoomBy(1/1.5));
$('#map-reset').addEventListener('click',()=>{camera={x:W/2,y:H/2,zoom:1};cameraApply();});
svg.addEventListener('wheel',e=>{
 e.preventDefault();
 const rect=svg.getBoundingClientRect(),w=W/camera.zoom,h=H/camera.zoom;
 const pt=[camera.x-w/2+(e.clientX-rect.left)/rect.width*w,camera.y-h/2+(e.clientY-rect.top)/rect.height*h];
 zoomBy(e.deltaY<0?1.17:1/1.17,pt);
},{passive:false});
svg.addEventListener('pointerdown',e=>{
 if(!e.isPrimary)return;
 pointer={x:e.clientX,y:e.clientY,cx:camera.x,cy:camera.y};moving=false;
 svg.setPointerCapture?.(e.pointerId);
});
svg.addEventListener('pointermove',e=>{
 if(!pointer)return;
 const dx=e.clientX-pointer.x,dy=e.clientY-pointer.y;
 if(Math.abs(dx)+Math.abs(dy)>6)moving=true;
 if(!moving)return;
 const rect=svg.getBoundingClientRect();
 camera.x=pointer.cx-dx/rect.width*(W/camera.zoom);camera.y=pointer.cy-dy/rect.height*(H/camera.zoom);cameraApply();
});
svg.addEventListener('pointerup',()=>{pointer=null;if(moving)setTimeout(()=>{moving=false;},30);});
svg.addEventListener('pointercancel',()=>{pointer=null;moving=false;});
svg.addEventListener('dblclick',e=>{e.preventDefault();zoomBy(1.5);});
Promise.all([
 fetchJson('/geo/china-provinces.geojson'),
 fetchJson('/geo/pcas.json'),
 fetchJson('/geo/pca-code.json'),
 fetchJson('/geo/hk-mo-tw.json')
]).then(([map,coded,codes,extra])=>{
 provinces=map.features.filter(x=>x?.properties?.name);
 pcas=coded;codeTree=codes;window.atlasExtra=extra;
 drawMap();render();
 $('#map-message').textContent='地图加载完成，可点击省份开始探索。';
}).catch(err=>{
 $('#map-message').textContent='地图数据暂无法读取，请刷新页面重试：'+err.message;
 $('#atlas-question').textContent='地名资料未加载';
 $('#atlas-answer').disabled=true;$('#atlas-form button').disabled=true;
});
})();