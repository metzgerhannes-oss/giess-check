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

test('stale archive add cannot overwrite newer entries',()=>{
 const s=memoryStore(),p=blankProject(),empty=readArchive(s).raw;
 addSnapshot(s,p,1000,empty);
 const stale=readArchive(s).raw;
 addSnapshot(s,p,2000,stale);
 const before=s.getItem(ARCHIVE_KEY);
 assert.throws(()=>addSnapshot(s,p,3000,stale),e=>e.code==='ARCHIVE_CONFLICT');
 assert.throws(()=>addSnapshot(s,p,3000,empty),e=>e.code==='ARCHIVE_CONFLICT');
 assert.equal(s.getItem(ARCHIVE_KEY),before);
 assert.equal(readArchive(s).items.length,2);
});
test('stale archive remove cannot erase newer snapshots',()=>{
 const s=memoryStore(),p=blankProject(),a=addSnapshot(s,p,1000);
 const stale=readArchive(s).raw;
 addSnapshot(s,p,2000,stale);
 const before=s.getItem(ARCHIVE_KEY);
 assert.throws(()=>removeSnapshot(s,a.id,stale),e=>e.code==='ARCHIVE_CONFLICT');
 assert.equal(s.getItem(ARCHIVE_KEY),before);
});
test('corrupt archive bytes remain intact after rejected stale write',()=>{
 const s=memoryStore(),p=blankProject();
 addSnapshot(s,p,1000);
 const old=s.getItem(ARCHIVE_KEY);
 s.setItem(ARCHIVE_KEY,'{corrupt');
 assert.throws(()=>addSnapshot(s,p,2000,old),/beschädigt/);
 assert.equal(s.getItem(ARCHIVE_KEY),'{corrupt');
});
