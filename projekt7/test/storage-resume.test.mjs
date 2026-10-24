import test from 'node:test';
import assert from 'node:assert/strict';
import {blankProject} from '../core.mjs';
import {PRIMARY_KEY,BACKUP_KEY,saveProject,inspectPrimaryRevision} from '../storage.mjs';

function memory(){
 const values=new Map();let reads=0,writes=0;
 return {values,getItem:key=>{reads++;return values.get(key)??null;},
  setItem:(key,value)=>{writes++;values.set(key,String(value));},
  get reads(){return reads;},get writes(){return writes;}};
}
test('resume check recognizes unchanged primary without touching backup or writing',()=>{
 const store=memory(),project=blankProject();saveProject(store,project);
 const expected=store.getItem(PRIMARY_KEY),before=store.writes;
 assert.equal(inspectPrimaryRevision(store,expected),'unchanged');
 assert.equal(store.writes,before);
 assert.ok(store.values.has(BACKUP_KEY));
});
test('resumed tab detects a remote write and deletion without modifying data',()=>{
 const store=memory(),first=blankProject(),second=blankProject();
 first.title='First';second.title='Second';
 saveProject(store,first);const stale=store.getItem(PRIMARY_KEY);
 saveProject(store,second);const before=store.writes;
 assert.equal(inspectPrimaryRevision(store,stale),'changed');
 assert.equal(store.writes,before);
 assert.throws(()=>saveProject(store,first,false,stale),error=>error.code==='STORAGE_CONFLICT');
 assert.equal(store.getItem(PRIMARY_KEY),JSON.stringify(second));
 store.values.delete(PRIMARY_KEY);
 assert.equal(inspectPrimaryRevision(store,stale),'changed');
 assert.equal(inspectPrimaryRevision(store,null),'unchanged');
});
test('unknown startup revision stays unverified after permissions recover',()=>{
 const store=memory();
 assert.equal(inspectPrimaryRevision(store,undefined),'unverified');
 store.values.set(PRIMARY_KEY,'{possibly recoverable}');
 assert.equal(inspectPrimaryRevision(store,undefined),'unverified');
 assert.equal(store.writes,0,'Never silently initialize an unknown primary');
});
test('storage read failures are not mistaken for an empty project',()=>{
 const denied={getItem(){throw new Error('Denied');},setItem(){throw new Error('Unexpected write');}};
 assert.equal(inspectPrimaryRevision(null,null),'unavailable');
 assert.equal(inspectPrimaryRevision(denied,null),'unavailable');
 assert.equal(inspectPrimaryRevision(denied,undefined),'unavailable');
});
test('exact raw revision includes whitespace and rejects a different serialization',()=>{
 const store=memory(),project=blankProject();
 const raw=JSON.stringify(project);store.values.set(PRIMARY_KEY,raw+' ');
 assert.equal(inspectPrimaryRevision(store,raw),'changed');
 assert.equal(inspectPrimaryRevision(store,raw+' '),'unchanged');
});
