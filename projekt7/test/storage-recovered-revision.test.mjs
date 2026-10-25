import test from 'node:test';
import assert from 'node:assert/strict';
import {blankProject} from '../core.mjs';
import {inspectStorage,saveProject,inspectBackupRevision,storageEventConflicts,PRIMARY_KEY,BACKUP_KEY} from '../storage.mjs';
const named=title=>({...blankProject(),title});
function store(){
 const data=new Map();let writes=0;
 return {getItem:key=>data.has(key)?data.get(key):null,
  setItem(key,value){writes++;data.set(key,String(value));},
  get writes(){return writes;},snapshot:()=>new Map(data)};
}
test('recovered load tracks source revision without modifying keys',()=>{
 const s=store(),raw=JSON.stringify(named('Saved'));
 s.setItem(PRIMARY_KEY,'{broken');s.setItem(BACKUP_KEY,raw);
 const before=s.snapshot(),found=inspectStorage(s);
 assert.equal(found.state,'recovered');assert.equal(found.backupRaw,raw);
 assert.equal(found.project.title,'Saved');assert.deepEqual(s.snapshot(),before);
});
test('healthy primary is independent of optional backup changes',()=>{
 const s=store();saveProject(s,named('Active'));
 s.setItem(BACKUP_KEY,JSON.stringify(named('Other')));
 const found=inspectStorage(s);
 assert.equal(found.state,'ok');assert.equal(found.backupRaw,undefined);
 assert.equal(found.project.title,'Active');
 assert.equal(storageEventConflicts(BACKUP_KEY,'other',found.primaryRaw),false);
});
for(const [label,primary] of [['missing',null],['damaged','{broken']]){
 test('stale '+label+' primary recovery refuses a changed backup',()=>{
  const s=store(),old=JSON.stringify(named('Old')),newer=JSON.stringify(named('Newer'));
  if(primary!==null)s.setItem(PRIMARY_KEY,primary);
  s.setItem(BACKUP_KEY,old);const found=inspectStorage(s);
  s.setItem(BACKUP_KEY,newer);const before=s.snapshot(),writes=s.writes;
  assert.throws(()=>saveProject(s,found.project,true,found.primaryRaw,null,found.backupRaw),{code:'STORAGE_CONFLICT'});
  assert.equal(s.writes,writes);assert.deepEqual(s.snapshot(),before);
 });
}
test('deleting recovered backup cannot silently create a primary',()=>{
 const s=store(),old=JSON.stringify(named('Only'));
 s.setItem(BACKUP_KEY,old);const found=inspectStorage(s);
 const removed={getItem:key=>key===BACKUP_KEY?null:s.getItem(key),
  setItem:()=>{throw Error('unexpected write');}};
 assert.throws(()=>saveProject(removed,found.project,true,found.primaryRaw,null,found.backupRaw),{code:'STORAGE_CONFLICT'});
 assert.equal(s.getItem(PRIMARY_KEY),null);assert.equal(s.getItem(BACKUP_KEY),old);
});
test('a backup changed during recovery validation blocks all primary writes',()=>{
 const s=store(),old=JSON.stringify(named('Old')),newer=JSON.stringify(named('Newer'));
 s.setItem(BACKUP_KEY,old);const found=inspectStorage(s);
 let reads=0,writes=0;
 const racing={getItem(key){if(key===BACKUP_KEY&&++reads===2)s.setItem(BACKUP_KEY,newer);return s.getItem(key);},
  setItem(){writes++;throw Error('unexpected write');}};
 assert.throws(()=>saveProject(racing,found.project,true,found.primaryRaw,null,found.backupRaw),{code:'STORAGE_CONFLICT'});
 assert.equal(writes,0);assert.equal(s.getItem(PRIMARY_KEY),null);
});
test('backup events and resumed reads identify stale recovered tabs',()=>{
 const s=store(),old=JSON.stringify(named('Old')),newer=JSON.stringify(named('Newer'));
 s.setItem(BACKUP_KEY,old);
 assert.equal(inspectBackupRevision(s,old),'unchanged');
 assert.equal(storageEventConflicts(BACKUP_KEY,newer,null,old),true);
 assert.equal(storageEventConflicts(BACKUP_KEY,old,null,old),false);
 s.setItem(BACKUP_KEY,newer);
 assert.equal(inspectBackupRevision(s,old),'changed');
 assert.equal(storageEventConflicts(null,null,null,old),true);
});
test('unreadable recovered backup cannot be trusted or saved',()=>{
 const s=store(),old=JSON.stringify(named('Old'));
 s.setItem(BACKUP_KEY,old);const found=inspectStorage(s);
 const blocked={getItem:key=>{if(key===BACKUP_KEY)throw Error('SecurityError');return s.getItem(key);},
  setItem:()=>{throw Error('unexpected write');}};
 assert.equal(inspectBackupRevision(blocked,old),'unavailable');
 assert.equal(inspectBackupRevision(null,old),'unavailable');
 assert.throws(()=>saveProject(blocked,found.project,true,found.primaryRaw,null,found.backupRaw),/SecurityError/);
 assert.equal(s.getItem(PRIMARY_KEY),null);
});
test('unchanged recovered backup repairs primary while preserving backup',()=>{
 const s=store(),old=JSON.stringify(named('Safe'));
 s.setItem(PRIMARY_KEY,'{broken');s.setItem(BACKUP_KEY,old);
 const found=inspectStorage(s);
 assert.equal(saveProject(s,found.project,true,found.primaryRaw,null,found.backupRaw).title,'Safe');
 assert.equal(s.getItem(BACKUP_KEY),old);assert.equal(inspectStorage(s).state,'ok');
});
