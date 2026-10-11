import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve('public');
const json=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const map=json('geo/china-provinces.geojson');
const pcas=json('geo/pcas.json');
const codes=json('geo/pca-code.json');
const extras=json('geo/hk-mo-tw.json');
const provinces=map.features.map(f=>f.properties?.name).filter(Boolean);
assert.equal(new Set(provinces).size,34,'地图必须包含34个不同的省级地区');
assert.ok(provinces.includes('台湾省'));
for(const name of provinces)assert.ok(pcas[name]||extras[name],name+' 下辖数据缺失');
const wuhou=pcas['四川省']?.['成都市']?.['武侯区'];
assert.ok(Array.isArray(wuhou)&&wuhou.includes('玉林街道'),'成都武侯区街道目录缺失');
const sc=codes.find(p=>p.name==='四川省');
const cd=sc?.children.find(c=>c.name==='成都市');
assert.equal(cd?.children.find(a=>a.name==='武侯区')?.code,'510107');
const tw=fs.readFileSync(path.join(root,'geo/taiwan-villages.csv'),'utf8');
assert.ok(tw.startsWith('id,name,town,county,'));
assert.ok(tw.includes(',臺北市,'),'台湾村里目录缺少台北市');
const html=fs.readFileSync(path.join(root,'geo.html'),'utf8');
const home=fs.readFileSync(path.join(root,'index.html'),'utf8');
for(const file of ['geo.js','geo-games.js','geo.css','geo-games.css','geo-quiz-core.js','geo-products.js','home.css']){
 assert.ok(fs.existsSync(path.join(root,file)),file+' 不存在');
}
for(const mode of ['match','place','special','line','hunt'])assert.ok(html.includes('data-atlas-game="'+mode+'"'),mode+' 按钮缺失');
assert.ok(html.includes('/geo-games.js')&&html.includes('/geo-games.css'));
assert.ok(home.includes('/geo.html'));
console.log('Atlas smoke check OK:',provinces.length,'省级地区,',wuhou.length,'武侯区街道,',tw.split(/\r?\n/).length-2,'台湾村里记录');

const GI=json('geo/gi-products.json');
assert.equal(GI.entries.length,4400,'地理标志记录应为4400条');
assert.equal(new Set(GI.entries.map(x=>x[1])).size,31,'产品需覆盖大陆31个省级地区');
await import('../public/geo-quiz-core.js');
const engine=globalThis.AtlasQuizCore;
const idx=engine.buildIndex(pcas,extras,provinces);
assert.ok(idx.length>30000,'各级地名应当包含省市区县乡镇');
for(const level of ['mixed','2','3','4']){
 const questions=engine.placeQuestions(idx,['中国'],'all',level,5);
 assert.ok(questions.length>=3,'全国多级挑战题目不足: '+level);
 assert.equal(new Set(questions.map(x=>x.answer)).size,questions.length,'不得重复正确地名');
 for(const question of questions)assert.equal(new Set(question.options).size,4,'归属题必须提供四个不同选项');
}
const sichuan=engine.productsFor(GI.entries,['中国','四川省']);
assert.ok(sichuan.products.length>300,'四川省产品资料不完整');
const series=engine.productQuestions(sichuan.products,GI.entries,'四川省',5);
assert.equal(series.length,5,'特产题应当能生成五题');
assert.equal(new Set(series.map(x=>x.answer)).size,5,'特产答案必须互不相同');
const chengdu=engine.productsFor(GI.entries,['中国','四川省','成都市']);
assert.ok(chengdu.products.every(x=>x[2]==='成都市'),'成都市题库不得混入其他城市产品');
const wuhouCatalog=engine.productsFor(GI.entries,['中国','四川省','成都市','武侯区']);
assert.ok(wuhouCatalog.products.every(x=>x[1]==='四川省'),'区县回退题库省份必须准确');
console.log('V2 checked:',idx.length,'geographical names;',GI.entries.length,'GI products; 5 distinct quiz answers');

const nationwide=engine.productQuestions(GI.entries,GI.entries,'中国',5);
assert.equal(nationwide.length,5,'全国特产应能测试五个不同省份的产品来源');
assert.equal(new Set(nationwide.map(q=>q.answer)).size,5,'全国特产题的正确省份不可重复');
for(const q of nationwide)assert.equal(new Set(q.options).size,4,'全国特产题必须有四个省级选项');
const unknownTown=engine.productsFor(GI.entries,['中国','四川省','成都市','不存在的区县']);
assert.equal(unknownTown.source,'成都市','缺少区县核实信息时只应退回城市级');
