import test from 'node:test';
import assert from 'node:assert/strict';
import {starterProject,blankProject,validateProject,scoreProject,evaluate} from '../core.mjs';

test('starter project validates and has a ranked result',()=>{
 const p=validateProject(starterProject());assert.equal(p.options.length,3);
 const result=evaluate(p);assert.equal(result.ranked.length,3);
 assert.ok(result.ranked[0].score>=result.ranked[1].score);
 assert.equal(result.ranked.reduce((n,r)=>n+r.stability,0)>=99,true);
});
test('weights affect which option wins',()=>{
 const p=blankProject();
 p.criteria[0].weight=5;p.criteria[1].weight=1;
 p.criteria[0].ratings={o1:10,o2:0};p.criteria[1].ratings={o1:0,o2:10};
 assert.equal(scoreProject(p)[0].id,'o1');
 p.criteria[0].weight=1;p.criteria[1].weight=5;
 assert.equal(scoreProject(p)[0].id,'o2');
});
test('stress test is deterministic for same input',()=>{
 const p=starterProject();assert.deepEqual(evaluate(p),evaluate(p));
});
test('equal scores split stress-test share fairly',()=>{
 const p=blankProject();p.criteria.forEach(c=>{c.uncertainty=0;c.ratings.o1=5;c.ratings.o2=5;});
 const r=evaluate(p,100);
 assert.equal(r.ranked[0].stability,50);assert.equal(r.ranked[1].stability,50);
});
test('reject malformed or dangerously large imports',()=>{
 for(const value of [null,{},[],{version:2,options:[],criteria:[]}]) assert.throws(()=>validateProject(value));
 const p=blankProject();p.options.push({...p.options[0]});assert.throws(()=>validateProject(p));
 const q=blankProject();q.criteria.push({...q.criteria[0]});assert.throws(()=>validateProject(q));
});
test('sanitize text and clamp ratings, weights, uncertainty',()=>{
 const p=blankProject();p.title='x'.repeat(150)+'\u0000';
 p.options[0].name='<img src=x onerror=alert(1)>';
 p.criteria[0].ratings.o1=999;p.criteria[0].ratings.o2=-12;
 p.criteria[0].weight=99;p.criteria[0].uncertainty=-8;
 const clean=validateProject(p);
 assert.equal(clean.title.length,120);
 assert.equal(clean.criteria[0].ratings.o1,10);
 assert.equal(clean.criteria[0].ratings.o2,0);
 assert.equal(clean.criteria[0].weight,5);
 assert.equal(clean.criteria[0].uncertainty,0);
 assert.ok(clean.options[0].name.includes('<img'));
});
test('no undefined/NaN scores on malformed numeric fields',()=>{
 const p=blankProject();p.criteria[0].ratings.o1='bad';p.criteria[0].weight=NaN;
 assert.ok(evaluate(p).ranked.every(r=>Number.isFinite(r.score) && Number.isFinite(r.stability)));
});
