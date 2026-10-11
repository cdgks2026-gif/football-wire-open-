/* Independent question engine for atlas V2. No browser dependencies; deliberately bounded to five questions. */
(function(root){
'use strict';
const u=a=>[...new Set((a||[]).filter(Boolean))];
const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const prefix=(full,head)=>head.every((v,i)=>v===full[i]);
function shuffle(input,rng=Math.random){const a=input.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function buildIndex(pcas,extras,provinces){
 const out=[];
 function add(name,path){out.push({name,path,depth:path.length-1,parent:path.at(-2)||'',parentPath:path.slice(0,-1)});}
 function walk(node,path){
  if(path.length>=5)return;
  if(Array.isArray(node)){for(const name of node)if(typeof name==='string')add(name,[...path,name]);return;}
  if(node&&typeof node==='object'){
   for(const [name,next] of Object.entries(node)){
    const to=[...path,name];add(name,to);walk(next,to);
   }
  }
 }
 for(const name of provinces){
  const path=['中国',name];add(name,path);
  walk(pcas[name]||extras[name]||{},path);
 }
 return out;
}
function choices(answer,options,rng){
 const valid=u(options).filter(x=>x!==answer);
 if(valid.length<3)return [];
 return shuffle([answer,...shuffle(valid,rng).slice(0,3)],rng);
}
function placeQuestions(index,trail,scope='local',level='mixed',limit=5,rng=Math.random){
 const all=index.filter(e=>e.depth>=2&&e.depth<=5);
 const scoped=scope==='all'?all:all.filter(e=>prefix(e.path,trail)&&e.path.length>trail.length);
 let candidates=scoped.filter(e=>level==='mixed'||String(e.depth)===String(level));
 if(!candidates.length&&scope==='local'&&level==='mixed'){
  // Bottom of tree: let the user practice the nearest known parent level.
  candidates=all.filter(e=>prefix(e.parentPath,trail.slice(0,-1))&&e.depth===trail.length-1);
 }
 const byDepth=new Map();for(const item of all){if(!byDepth.has(item.depth))byDepth.set(item.depth,[]);byDepth.get(item.depth).push(item);}
 const byParent=new Map();for(const item of all){const key=item.parentPath.join('/');if(!byParent.has(key))byParent.set(key,new Set());byParent.get(key).add(item.name);}
 const pool=shuffle(candidates,rng);
 // Mix depths and upper/lower direction to avoid five nearly identical questions.
 const balanced=[];
 const depths=u(pool.map(x=>x.depth));
 for(const depth of shuffle(depths,rng)){
  const sample=pool.find(x=>x.depth===depth);if(sample)balanced.push(sample);
 }
 const ordered=[...balanced,...pool.filter(x=>!balanced.includes(x))];
 const out=[],seenAnswer=new Set(),seenPlace=new Set();
 for(const item of ordered){
  if(out.length>=limit)break;
  const location=item.path.join('/');
  if(seenPlace.has(location))continue;
  const siblings=byDepth.get(item.depth)||[];
  const sameParent=byParent.get(item.parentPath.join('/'))||new Set();
  let question=null;
  const makeForward=()=>{
   const distractors=shuffle(siblings,rng).filter(x=>x.parentPath.join('/')!==item.parentPath.join('/')&&!sameParent.has(x.name)).map(x=>x.name);
   const opts=choices(item.name,distractors,rng);
   if(opts.length===4)return {text:'以下哪个地名属于「'+item.parentPath.slice(1).join(' · ')+'」下辖？',answer:item.name,options:opts,explanation:'完整路径：中国 / '+item.path.slice(1).join(' / '),place:location};
   return null;
  };
  const makeReverse=()=>{
   const parents=u(shuffle(siblings,rng).filter(x=>x.parent!==item.parent).map(x=>x.parent));
   const opts=choices(item.parent,parents,rng);
   // Duplicate child names in the same grandparent make reverse questions ambiguous.
   const ambiguous=siblings.some(x=>x.name===item.name&&x.parent!==item.parent&&eq(x.path.slice(0,-2),item.path.slice(0,-2)));
   if(opts.length!==4||ambiguous)return null;
   const context=item.path.slice(1,-2).join(' · ')||'中国';
   return {text:'在「'+context+'」范围内，「'+item.name+'」属于哪个上一级地区？',answer:item.parent,options:opts,explanation:'完整路径：中国 / '+item.path.slice(1).join(' / '),place:location};
  };
  question=(out.length%2?makeReverse():makeForward())||(out.length%2?makeForward():makeReverse());
  if(!question||seenAnswer.has(question.answer))continue;
  out.push(question);seenAnswer.add(question.answer);seenPlace.add(location);
 }
 return out;
}
function productsFor(entries,trail){
 const province=trail[1]||'';
 if(!province)return {source:'中国',level:'national',products:entries};
 const inProvince=entries.filter(x=>x[1]===province);
 if(trail.length<=2)return {source:province,level:'province',products:inProvince};
 const city=trail[2],cityProducts=inProvince.filter(x=>x[2]===city);
 if(trail.length===3)return cityProducts.length?{source:city,level:'city',products:cityProducts}:{source:province,level:'province-fallback',products:inProvince};
 const area=trail[3],districtProducts=cityProducts.filter(x=>Array.isArray(x[3])&&x[3].includes(area));
 if(districtProducts.length)return {source:area,level:trail.length===4?'county':'county-fallback',products:districtProducts};
 if(cityProducts.length)return {source:city,level:'city-fallback',products:cityProducts};
 return {source:province,level:'province-fallback',products:inProvince};
}
function productQuestions(products,pool,source,limit=5,rng=Math.random){
 // Nationwide questions must ask province of origin, otherwise no false product choices exist.
 if(source==='中国'){
  const allProvinces=u(pool.map(x=>x[1]));
  const picked=[],used=new Set();
  for(const item of shuffle(products,rng)){
   if(picked.length>=limit)break;
   if(used.has(item[1])||!item[0]||!item[1])continue;
   const names=u(products.filter(x=>x[0]===item[0]).map(x=>x[1]));
   // Discard products with several candidate provinces.
   if(names.length!==1)continue;
   const options=choices(item[1],allProvinces,rng);
   if(options.length!==4)continue;
   picked.push({text:'地理标志产品「'+item[0]+'」的资料所列省级产地是哪里？',
    answer:item[1],options,
    explanation:'收录产地：'+item[1]+' / '+item[2],
    place:item[1]+'/'+item[2]+'/'+item[0]});
   used.add(item[1]);
  }
  return picked;
 }
 const correct=u(products.map(x=>x[0]));
 const uniqueProducts=shuffle(correct,rng);
 const all=u(pool.map(x=>x[0]));
 const other=all.filter(n=>!correct.includes(n));
 const out=[];
 for(const name of uniqueProducts){
  if(out.length>=limit)break;
  const item=products.find(x=>x[0]===name);
  const opts=choices(name,other,rng);
  if(opts.length<4)break;
  const desc=String(item[4]||'').trim();
  const withDesc=desc.length>=24&&out.length%3===1&&!desc.includes(name);
  out.push({
   text:withDesc?'根据产品资料描述，猜出对应的特产：'+desc.slice(0,65)+(desc.length>65?'…':''):
    '以下哪项是「'+source+'」收录的地理标志产品？',
   answer:name,options:opts,
   explanation:'收录产地：'+item[1]+(item[2]?' / '+item[2]:'')+(desc&&!withDesc?'；特征：'+desc.slice(0,45):''),
   place:item[1]+'/'+item[2]+'/'+name
  });
 }
 return out;
}
function matchDeck(names,limit=6,rng=Math.random){
 const selected=shuffle(u(names),rng).slice(0,limit);
 return shuffle(selected.flatMap((name,id)=>[{name,id},{name,id}]),rng);
}
root.AtlasQuizCore={buildIndex,placeQuestions,productsFor,productQuestions,matchDeck,shuffle};
})(globalThis);
