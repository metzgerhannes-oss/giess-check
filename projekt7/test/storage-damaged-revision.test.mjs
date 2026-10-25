import test from 'node:test';
import assert from 'node:assert/strict';
import {blankProject} from '../core.mjs';
import {inspectStorage,saveProject,inspectBackupRevision,storageEventConflicts,PRIMARY_KEY,BACKUP_KEY} from '../storage.mjs';

const named=title=>({...blankProject(),title});
function memory(){
 const values=new Map();let writes=0;
 return {
  getItem:key=>values.has(key)?values.get(key):null,
  setItem(key,value){writes++;values.set(key,String(value));},
  get writes(){return writes;},
  snapshot:()=>new Map(values)
 };
}
function prepare(primary='{invalid',backup='{invalid backup'){
 const s=memory();
 if(primary!==null)s.setItem(PRIMARY_KEY,primary);
 if(backup!==null)s.setItem(BACKUP_KEY,backup);
 return s;
}
function attempt(s,found){
 return saveProject(s,named('Confirmed replacement'),true,found.primaryRaw,null,found.backupRaw);
}
test('damaged load retains corrupt backup bytes without modifying either key',()=>{
 const s=prepare(),before=s.snapshot(),found=inspectStorage(s);
 assert.equal(found.state,'damaged');
 assert.equal(found.primaryRaw,'{invalid');
 assert.equal(found.backupRaw,'{invalid backup');
 assert.deepEqual(s.snapshot(),before);
});
test('damaged load tracks an absent backup as a known null revision',()=>{
 const s=prepare('{invalid',null),found=inspectStorage(s);
 assert.equal(found.state,'damaged');
 assert.equal(found.backupRaw,null);
 assert.equal(inspectBackupRevision(s,found.backupRaw),'unchanged');
});
test('new recovery copy arriving during damaged-state confirmation blocks replacement',()=>{
 const s=prepare('{invalid',null),found=inspectStorage(s);
 s.setItem(BACKUP_KEY,JSON.stringify(named('New recovery')));
 const before=s.snapshot(),writes=s.writes;
 assert.throws(()=>attempt(s,found),{code:'STORAGE_CONFLICT'});
 assert.deepEqual(s.snapshot(),before);
 assert.equal(s.writes,writes);
 assert.equal(s.getItem(PRIMARY_KEY),'{invalid');
});
test('repaired backup arriving during damaged-state confirmation blocks replacement',()=>{
 const s=prepare(),found=inspectStorage(s);
 const rescue=JSON.stringify(named('Rescued'));
 s.setItem(BACKUP_KEY,rescue);
 const before=s.snapshot(),writes=s.writes;
 assert.throws(()=>attempt(s,found),{code:'STORAGE_CONFLICT'});
 assert.deepEqual(s.snapshot(),before);
 assert.equal(s.writes,writes);
 assert.equal(inspectStorage(s).state,'recovered');
 assert.equal(inspectStorage(s).project.title,'Rescued');
});
test('backup deletion during damaged-state confirmation also blocks replacement',()=>{
 const s=prepare(),found=inspectStorage(s);
 const deleted={
  getItem:key=>key===BACKUP_KEY?null:s.getItem(key),
  setItem(){throw Error('unexpected write');}
 };
 assert.throws(()=>attempt(deleted,found),{code:'STORAGE_CONFLICT'});
 assert.equal(s.getItem(PRIMARY_KEY),'{invalid');
});
test('unchanged damaged baseline permits explicit repair without deleting corrupt backup',()=>{
 const s=prepare(),found=inspectStorage(s);
 const oldBackup=s.getItem(BACKUP_KEY);
 assert.equal(attempt(s,found).title,'Confirmed replacement');
 assert.equal(inspectStorage(s).state,'ok');
 assert.equal(s.getItem(BACKUP_KEY),oldBackup);
});
test('unchanged missing backup permits confirmed repair but does not fabricate a recovery copy',()=>{
 const s=prepare('{invalid',null),found=inspectStorage(s);
 assert.equal(attempt(s,found).title,'Confirmed replacement');
 assert.equal(s.getItem(BACKUP_KEY),null);
 assert.equal(inspectStorage(s).state,'ok');
});
test('damaged backup revision changes are visible to tab events and resume checks',()=>{
 const s=prepare(),found=inspectStorage(s);
 assert.equal(inspectBackupRevision(s,found.backupRaw),'unchanged');
 assert.equal(storageEventConflicts(BACKUP_KEY,'{new',found.primaryRaw,found.backupRaw),true);
 assert.equal(storageEventConflicts(BACKUP_KEY,found.backupRaw,found.primaryRaw,found.backupRaw),false);
 assert.equal(storageEventConflicts(null,null,found.primaryRaw,found.backupRaw),true);
 s.setItem(BACKUP_KEY,'{new');
 assert.equal(inspectBackupRevision(s,found.backupRaw),'changed');
});
test('backup changing during the final pre-write check prevents any primary write',()=>{
 const base=prepare(),found=inspectStorage(base),rescue=JSON.stringify(named('New recovery'));
 let reads=0,writes=0;
 const racing={
  getItem(key){
   if(key===BACKUP_KEY&&++reads===2)base.setItem(BACKUP_KEY,rescue);
   return base.getItem(key);
  },
  setItem(){writes++;throw Error('unexpected write');}
 };
 assert.throws(()=>attempt(racing,found),{code:'STORAGE_CONFLICT'});
 assert.equal(writes,0);
 assert.equal(base.getItem(PRIMARY_KEY),'{invalid');
 assert.equal(base.getItem(BACKUP_KEY),rescue);
});
test('unreadable damaged-state backup refuses replacement before writing',()=>{
 const base=prepare(),found=inspectStorage(base);
 const denied={
  getItem:key=>{if(key===BACKUP_KEY)throw Error('SecurityError');return base.getItem(key);},
  setItem(){throw Error('unexpected write');}
 };
 assert.throws(()=>attempt(denied,found),/SecurityError/);
 assert.equal(base.getItem(PRIMARY_KEY),'{invalid');
});
