import assert from 'node:assert/strict';
import fs from 'node:fs';
const root=new URL('./',import.meta.url);
const load=name=>fs.readFileSync(new URL(name,root),'utf8');
const db=JSON.parse(load('data.json'));
assert.equal(db.heroes.length,85);
assert.equal(Object.keys(db.masters).length,20);
assert.equal(db.plans.length,14);
assert.equal(db.talentCards.length,255);
assert.equal(db.equipmentCards.length,73);
assert.equal(db.effectCards.length,99);
assert.equal(db.buffGroups.length,43);
assert.equal(db.heroDetails.length,85);
for(const field of ['heroes','talentCards','equipmentCards','effectCards']){
 const entries=db[field].map(x=>x.name);
 assert.equal(new Set(entries).size,entries.length,field+' contains duplicate name');
}
const heroNames=new Set(db.heroes.map(x=>x.name));
for(const h of db.heroDetails)assert.ok(heroNames.has(h.name));
const camps=new Set(db.heroes.map(x=>x.camp));
assert.equal(camps.size,6);
for(const p of db.plans){
 assert.ok(p.core.length>0,p.name);
 for(const name of [...(p.core||[]),...(p.engine||[]),...(p.flex||[])])
  assert.ok(heroNames.has(name),p.name+' contains unknown hero '+name);
}
const html=load('index.html'),js=load('app.js');
for(const page of ['home','library','lab','guide','quiz','records','patch','sources'])assert.ok(html.includes('id="page-'+page+'"'),page);
for(const s of ['buff-overview','hero-pick-list','board-grid','quiz-area','review-form','patch-list'])assert.ok(html.includes('id="'+s+'"'),s);
for(const keyword of ['renderLibrary','renderLab','makeQuestions','startQuiz','renderReviews','renderPatches','heroDetails','talentCards','effectCards','equipmentCards','buffGroups'])assert.ok(js.includes(keyword),'implementation missing '+keyword);
assert.ok(db.changes.some(x=>x.date==='2026-10-08'&&x.name==='春风化雨'));
console.log('Wanxiang learning app OK:',db.heroes.length,'heroes',db.talentCards.length,'talents',db.equipmentCards.length,'equipment',db.effectCards.length,'effects',db.buffGroups.length,'keyword groups');

const decisionFields=['turn-round','turn-hp','turn-energy','turn-shop','turn-analyze','turn-result'];
for(const id of decisionFields)assert.ok(html.includes('id="'+id+'"'),'decision field missing: '+id);
assert.ok(js.includes('function renderTurnAdvice()'),'missing in-round learning assistant');
assert.ok(js.includes("$('#turn-analyze').addEventListener('click',renderTurnAdvice)"),'decision helper click not wired');
assert.ok(js.includes("event.target.closest('[data-modal-master]')"),'master modal transfer must work');
console.log('Round decision assistant and modal navigation present');
