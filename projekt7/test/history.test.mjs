import test from 'node:test';
import assert from 'node:assert/strict';
import {blankProject} from '../core.mjs';
import {createHistory} from '../history.mjs';
test('undo/redo snapshot order',()=>{
 const p=blankProject(),h=createHistory(p);
 p.title='A';h.push(p);p.title='B';h.push(p);
 assert.equal(h.undo().title,'A');
 assert.equal(h.undo().title,'Meine Entscheidung');
 assert.equal(h.undo(),null);
 assert.equal(h.redo().title,'A');
 assert.equal(h.redo().title,'B');
});
test('new edit invalidates redo and duplicates have no effect',()=>{
 const p=blankProject(),h=createHistory(p);
 p.title='A';assert.equal(h.push(p),true);
 assert.equal(h.push(p),false);
 h.undo();assert.equal(h.canRedo(),true);
 p.title='C';h.push(p);
 assert.equal(h.canRedo(),false);
});
test('bounded history and invalid objects',()=>{
 const p=blankProject(),h=createHistory(p,3);
 for(let i=0;i<12;i++){p.title='Revision '+i;h.push(p);}
 let n=0;while(h.undo())n++;
 assert.equal(n,3);
 assert.throws(()=>h.push({version:2}));
});
