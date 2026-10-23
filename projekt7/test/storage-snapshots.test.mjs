import test from 'node:test';
import assert from 'node:assert/strict';
import {blankProject,validateProject} from '../core.mjs';
import {inspectStorage,saveProject,PRIMARY_KEY,BACKUP_KEY} from '../storage.mjs';

function memoryStore(){
 const data=new Map();
 return {
  getItem:key=>data.has(key)?data.get(key):null,
  setItem:(key,value)=>data.set(key,String(value)),
  dump:()=>new Map(data)
 };
}

test('empty store starts with a valid local project',()=>{
 const store=memoryStore();
 const found=inspectStorage(store);
 assert.equal(found.state,'new');
 assert.deepEqual(found.project,validateProject(blankProject()).version===1?found.project:null);
 assert.equal(store.dump().size,0);
});

test('write keeps an independent valid previous snapshot',()=>{
 const store=memoryStore(),a=blankProject();
 a.title='First';
 saveProject(store,a);
 assert.equal(inspectStorage(store).state,'ok');
 assert.equal(JSON.parse(store.getItem(BACKUP_KEY)).title,'First');
 const b=blankProject();b.title='Second';
 saveProject(store,b);
 assert.equal(JSON.parse(store.getItem(PRIMARY_KEY)).title,'Second');
 assert.equal(JSON.parse(store.getItem(BACKUP_KEY)).title,'First');
});

test('recover from backup if primary JSON is invalid',()=>{
 const store=memoryStore();
 saveProject(store,blankProject());
 store.setItem(PRIMARY_KEY,'{broken');
 const state=inspectStorage(store);
 assert.equal(state.state,'recovered');
 assert.equal(state.project.version,1);
 assert.equal(store.getItem(PRIMARY_KEY),'{broken');
 assert.throws(()=>saveProject(store,blankProject()),/beschädigt/);
 assert.equal(store.getItem(PRIMARY_KEY),'{broken');
 saveProject(store,blankProject(),true);
 assert.equal(inspectStorage(store).state,'ok');
});

test('invalid primary and invalid backup remain untouched',()=>{
 const store=memoryStore();
 store.setItem(PRIMARY_KEY,'bad');
 store.setItem(BACKUP_KEY,'also bad');
 assert.equal(inspectStorage(store).state,'damaged');
 assert.equal(store.getItem(PRIMARY_KEY),'bad');
 assert.equal(store.getItem(BACKUP_KEY),'also bad');
});

test('unavailable browser storage does not crash startup',()=>{
 const broken={getItem(){throw new Error('denied')}};
 assert.equal(inspectStorage(broken).state,'unavailable');
});
