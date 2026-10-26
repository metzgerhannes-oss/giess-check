import test from 'node:test';
import assert from 'node:assert/strict';
import {blankProject} from '../core.mjs';
import {saveProject,inspectStorage,PRIMARY_KEY,BACKUP_KEY} from '../storage.mjs';
import {ARCHIVE_KEY,addSnapshot,readArchive} from '../archive.mjs';
import {serializeArchiveBackup,parseArchiveBackup,importArchiveBackup,importArchiveBackupAsync} from '../archive-transfer.mjs';
const named=title=>({...blankProject(),title});
function store(){
 const data=new Map();let writes=0;
 return {getItem:key=>data.has(key)?data.get(key):null,
  setItem:(key,value)=>{writes++;data.set(key,String(value));},
  snapshot:()=>new Map(data),get writes(){return writes;}};
}
test('unchanged save preserves the preceding recovery revision without writes',()=>{
 const s=store();saveProject(s,named('Before'));
 saveProject(s,named('Current'),false,s.getItem(PRIMARY_KEY));
 const backup=s.getItem(BACKUP_KEY),before=s.snapshot(),writes=s.writes;
 assert.equal(JSON.parse(backup).title,'Before');
 assert.equal(saveProject(s,named('Current'),false,s.getItem(PRIMARY_KEY)).title,'Current');
 assert.equal(s.writes,writes);assert.deepEqual(s.snapshot(),before);
 s.setItem(PRIMARY_KEY,'{damaged');
 assert.equal(inspectStorage(s).state,'recovered');
 assert.equal(inspectStorage(s).project.title,'Before');
});
test('unchanged save succeeds without write permission but still checks stale revision',()=>{
 const s=store();saveProject(s,named('Before'));
 saveProject(s,named('Current'),false,s.getItem(PRIMARY_KEY));
 const before=s.snapshot();
 const readonly={getItem:key=>s.getItem(key),setItem:()=>{throw Error('Unexpected write');}};
 assert.equal(saveProject(readonly,named('Current'),false,s.getItem(PRIMARY_KEY)).title,'Current');
 assert.throws(()=>saveProject(readonly,named('Current'),false,'stale'),{code:'STORAGE_CONFLICT'});
 assert.deepEqual(s.snapshot(),before);
});
for(const damaged of [false,true]){
 test('unchanged save repairs '+(damaged?'damaged':'missing')+' recovery copy',()=>{
  const s=store();saveProject(s,named('Current'));
  const raw=s.snapshot();
  if(damaged)raw.set(BACKUP_KEY,'{damaged');else raw.delete(BACKUP_KEY);
  const adapter={getItem:key=>raw.has(key)?raw.get(key):null,setItem:(key,value)=>raw.set(key,String(value))};
  const primary=adapter.getItem(PRIMARY_KEY);
  saveProject(adapter,named('Current'),false,primary);
  assert.equal(adapter.getItem(BACKUP_KEY),primary);
 });
}
test('identical archive replacement preserves bytes, active keys and write count',()=>{
 const s=store();s.setItem(PRIMARY_KEY,'active');s.setItem(BACKUP_KEY,'backup');
 addSnapshot(s,named('Archive'),1000);
 const parsed=parseArchiveBackup(serializeArchiveBackup(readArchive(s)));
 const raw=s.getItem(ARCHIVE_KEY),before=s.snapshot(),writes=s.writes;
 assert.equal(importArchiveBackup(s,parsed,raw),1);
 assert.equal(s.writes,writes);assert.deepEqual(s.snapshot(),before);
 assert.throws(()=>importArchiveBackup(s,parsed,'stale'),{code:'ARCHIVE_CONFLICT'});
 assert.deepEqual(s.snapshot(),before);
});
test('identical archive async import avoids approval and writes',async()=>{
 const s=store();addSnapshot(s,named('Archive'),1000);
 const file=serializeArchiveBackup(readArchive(s)),baseline=readArchive(s).raw;
 const readonly={getItem:key=>s.getItem(key),setItem:()=>{throw Error('Unexpected write');}};
 let approvals=0;
 assert.equal(await importArchiveBackupAsync(readonly,()=>file,baseline,()=>{approvals++;return true;}),1);
 assert.equal(approvals,0);
});
test('empty archive replay does not create a storage key',async()=>{
 const s=store(),file=serializeArchiveBackup(readArchive(s));let approvals=0;
 assert.equal(await importArchiveBackupAsync(s,()=>file,null,()=>{approvals++;return true;}),0);
 assert.equal(approvals,0);assert.equal(s.getItem(ARCHIVE_KEY),null);assert.equal(s.writes,0);
});
test('equivalent import preserves valid noncanonical archive raw',()=>{
 const s=store();addSnapshot(s,named('Archive'),1000);
 const parsed=parseArchiveBackup(serializeArchiveBackup(readArchive(s)));
 const raw=JSON.stringify({version:1,items:parsed.items,legacyField:'retained'});
 s.setItem(ARCHIVE_KEY,raw);
 const before=s.snapshot(),writes=s.writes;
 assert.equal(importArchiveBackup(s,parsed,raw),1);
 assert.equal(s.writes,writes);assert.deepEqual(s.snapshot(),before);
});
test('stale revision is rejected before identical-import shortcut',async()=>{
 const s=store();addSnapshot(s,named('Archive'),1000);
 const baseline=readArchive(s).raw,file=serializeArchiveBackup(readArchive(s));
 addSnapshot(s,named('Newer'),2000);
 const before=s.snapshot();let approvals=0;
 await assert.rejects(importArchiveBackupAsync(s,()=>file,baseline,()=>{approvals++;return true;}),{code:'ARCHIVE_CONFLICT'});
 assert.equal(approvals,0);assert.deepEqual(s.snapshot(),before);
});
