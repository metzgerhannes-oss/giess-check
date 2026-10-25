import test from 'node:test';
import assert from 'node:assert/strict';
import {blankProject} from '../core.mjs';
import {saveProject,PRIMARY_KEY,BACKUP_KEY} from '../storage.mjs';
import {ARCHIVE_KEY,addSnapshot,removeSnapshot,readArchive} from '../archive.mjs';
import {importArchiveBackup} from '../archive-transfer.mjs';

const named=title=>({...blankProject(),title});
function store(){
 const data=new Map();
 return {
  getItem:key=>data.has(key)?data.get(key):null,
  setItem:(key,value)=>data.set(key,String(value)),
  dump:()=>new Map(data)
 };
}
function onNthRead(base,key,n,mutate){
 let count=0,writes=0;
 return {
  getItem(k){
   if(k===key&&++count===n)mutate();
   return base.getItem(k);
  },
  setItem(k,v){writes++;base.setItem(k,v);},
  get writes(){return writes;}
 };
}

test('primary changed during backup preparation is not overwritten',()=>{
 const base=store();saveProject(base,named('Original'));
 const expected=base.getItem(PRIMARY_KEY),backup=base.getItem(BACKUP_KEY);
 const remote=JSON.stringify(named('Other tab'));
 const racing=onNthRead(base,PRIMARY_KEY,2,()=>base.setItem(PRIMARY_KEY,remote));
 assert.throws(()=>saveProject(racing,named('Stale tab'),false,expected),{code:'STORAGE_CONFLICT'});
 assert.equal(base.getItem(PRIMARY_KEY),remote);
 assert.equal(base.getItem(BACKUP_KEY),backup);
 assert.equal(racing.writes,0);
});

test('unavailable second primary read aborts before touching either key',()=>{
 const base=store();saveProject(base,named('Safe'));
 const before=base.dump();let reads=0,writes=0;
 const racing={
  getItem(key){
   if(key===PRIMARY_KEY&&++reads===2)throw Error('SecurityError');
   return base.getItem(key);
  },
  setItem(){writes++;}
 };
 assert.throws(()=>saveProject(racing,named('Unsafe'),false,base.getItem(PRIMARY_KEY)),/SecurityError/);
 assert.deepEqual(base.dump(),before);assert.equal(writes,0);
});

test('initial backup seeding rejects a recovery copy arriving from another tab',()=>{
 const base=store(),remote=JSON.stringify(named('Remote recovery')),warnings=[];
 const racing=onNthRead(base,BACKUP_KEY,2,()=>base.setItem(BACKUP_KEY,remote));
 assert.throws(()=>saveProject(racing,named('Fresh'),false,null,error=>warnings.push(error.message)),{code:'STORAGE_CONFLICT'});
 assert.equal(base.getItem(PRIMARY_KEY),null,'No primary may shadow a newly arrived recovery copy');
 assert.equal(base.getItem(BACKUP_KEY),remote);
 assert.equal(warnings.length,0);
 assert.equal(racing.writes,0,'This tab must not commit after a competing recovery');
});

test('archive append detects a concurrent deletion without explicit revision',()=>{
 const base=store();addSnapshot(base,named('Older'),1000);
 const other=JSON.stringify({version:1,items:[]});
 const racing=onNthRead(base,ARCHIVE_KEY,2,()=>base.setItem(ARCHIVE_KEY,other));
 assert.throws(()=>addSnapshot(racing,named('Stale'),2000),{code:'ARCHIVE_CONFLICT'});
 assert.equal(base.getItem(ARCHIVE_KEY),other);
 assert.equal(racing.writes,0);
});

test('archive removal detects concurrent append without explicit revision',()=>{
 const base=store(),item=addSnapshot(base,named('Older'),1000);
 const other=JSON.stringify({version:1,items:[]});
 const racing=onNthRead(base,ARCHIVE_KEY,2,()=>base.setItem(ARCHIVE_KEY,other));
 assert.throws(()=>removeSnapshot(racing,item.id),{code:'ARCHIVE_CONFLICT'});
 assert.equal(base.getItem(ARCHIVE_KEY),other);
 assert.equal(racing.writes,0);
});

test('archive import rechecks revision after validating a mutable payload',()=>{
 const base=store();addSnapshot(base,named('Existing'),1000);
 const newer=JSON.stringify({version:1,items:[]});
 const incoming={version:1,get items(){base.setItem(ARCHIVE_KEY,newer);return [];}};
 assert.throws(()=>importArchiveBackup(base,incoming),{code:'ARCHIVE_CONFLICT'});
 assert.equal(base.getItem(ARCHIVE_KEY),newer);
 assert.equal(readArchive(base).state,'ok');
});

test('archive import fails safely if final revision read loses permission',()=>{
 const base=store();addSnapshot(base,named('Existing'),1000);
 const before=base.dump();let reads=0,writes=0;
 const racing={
  getItem(key){
   if(key===ARCHIVE_KEY&&++reads===2)throw Error('SecurityError');
   return base.getItem(key);
  },
  setItem(){writes++;}
 };
 assert.throws(()=>importArchiveBackup(racing,{version:1,items:[]}),/SecurityError/);
 assert.deepEqual(base.dump(),before);assert.equal(writes,0);
});
