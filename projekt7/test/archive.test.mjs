import test from 'node:test';
import assert from 'node:assert/strict';
import {blankProject} from '../core.mjs';
import {ARCHIVE_KEY,ARCHIVE_CAP,readArchive,addSnapshot,removeSnapshot} from '../archive.mjs';
function memoryStore(){
 const m=new Map();
 return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),raw:m};
}
test('new archive is empty and does not write on read',()=>{
 const store=memoryStore();
 assert.equal(readArchive(store).state,'new');
 assert.equal(store.raw.size,0);
});
test('snapshots are independent validated copies in newest-first order',()=>{
 const store=memoryStore(),p=blankProject();
 p.title='A';const a=addSnapshot(store,p,1000);
 p.title='B';const b=addSnapshot(store,p,2000);
 p.title='C';
 const state=readArchive(store);
 assert.deepEqual(state.items.map(v=>v.project.title),['B','A']);
 assert.notEqual(a.id,b.id);
 assert.equal(state.items[1].createdAt,1000);
 removeSnapshot(store,a.id);
 assert.deepEqual(readArchive(store).items.map(v=>v.project.title),['B']);
});
test('repeated timestamps still generate distinct identifiers',()=>{
 const store=memoryStore();
 const a=addSnapshot(store,blankProject(),7000);
 const b=addSnapshot(store,blankProject(),7000);
 assert.notEqual(a.id,b.id);
});
test('archive limit never evicts older snapshots silently',()=>{
 const store=memoryStore();
 for(let i=0;i<ARCHIVE_CAP;i++)addSnapshot(store,blankProject(),i+1);
 const before=store.getItem(ARCHIVE_KEY);
 assert.throws(()=>addSnapshot(store,blankProject(),99),/voll/);
 assert.equal(store.getItem(ARCHIVE_KEY),before);
});
test('damaged archives are detected and never overwritten',()=>{
 const store=memoryStore();
 store.setItem(ARCHIVE_KEY,'{broken');
 assert.equal(readArchive(store).state,'damaged');
 assert.throws(()=>addSnapshot(store,blankProject()),/beschädigt/);
 assert.throws(()=>removeSnapshot(store,'sabc_1'),/beschädigt/);
 assert.equal(store.getItem(ARCHIVE_KEY),'{broken');
});
test('invalid snapshots and unavailable storage fail safely',()=>{
 const store=memoryStore();
 store.setItem(ARCHIVE_KEY,JSON.stringify({version:1,items:[{id:'evil!',createdAt:1,project:blankProject()}]}));
 assert.equal(readArchive(store).state,'damaged');
 assert.equal(readArchive(null).state,'unavailable');
 assert.throws(()=>addSnapshot(null,blankProject()),/nicht verfügbar/);
});
test('quota failures do not lose previously saved snapshots',()=>{
 const store=memoryStore();addSnapshot(store,blankProject(),1);
 const before=store.getItem(ARCHIVE_KEY);
 const fail={getItem:k=>store.getItem(k),setItem:()=>{throw new Error('QuotaExceededError')}};
 assert.throws(()=>addSnapshot(fail,blankProject(),2),/QuotaExceededError/);
 assert.equal(store.getItem(ARCHIVE_KEY),before);
});
