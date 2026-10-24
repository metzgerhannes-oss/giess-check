import test from 'node:test';
import assert from 'node:assert/strict';
import {blankProject,validateProject} from '../core.mjs';
import {serializeBackup,parseBackupText} from '../backup.mjs';
import {serializeArchiveBackup,parseArchiveBackup,importArchiveBackup} from '../archive-transfer.mjs';
import {readArchive,addSnapshot,ARCHIVE_KEY} from '../archive.mjs';
import {saveProject,inspectStorage,PRIMARY_KEY,BACKUP_KEY} from '../storage.mjs';

function store(){
 const map=new Map();
 return {
  getItem:key=>map.has(key)?map.get(key):null,
  setItem:(key,value)=>map.set(key,String(value)),
  dump:()=>new Map(map)
 };
}
const named=name=>({...blankProject(),title:name});

test('maximum legal project survives portable export/import without score data loss',()=>{
 const p=blankProject();
 p.title='Übertragung 🚀 – '.repeat(8);
 p.options=Array.from({length:6},(_,i)=>({id:'o'+i,name:'Ä'.repeat(80)}));
 p.criteria=Array.from({length:9},(_,i)=>({
  id:'c'+i,name:'Kriterium '+i,weight:i%5+1,uncertainty:i%4,
  ratings:Object.fromEntries(p.options.map((o,j)=>[o.id,(i+j)%11]))
 }));
 const restored=parseBackupText(serializeBackup(p));
 assert.deepEqual(restored,validateProject(p));
});

test('invalid and truncated portable backups never touch existing browser keys',()=>{
 const s=store();saveProject(s,named('Original'));addSnapshot(s,named('Archive'),1234);
 const before=s.dump();
 for(const text of ['{broken','null','{"version":1,"options":[]}',serializeBackup(named('X')).slice(0,-3)]){
  assert.throws(()=>parseBackupText(text));
  assert.deepEqual(s.dump(),before);
 }
});

test('corrupted primary recovers from intact backup without silently rewriting either',()=>{
 const s=store();saveProject(s,named('First'));saveProject(s,named('Second'));
 s.setItem(PRIMARY_KEY,'{damaged');
 const before=s.dump(),found=inspectStorage(s);
 assert.equal(found.state,'recovered');assert.equal(found.project.title,'First');
 assert.deepEqual(s.dump(),before);
 assert.throws(()=>saveProject(s,named('Unapproved'),false,found.primaryRaw));
 assert.deepEqual(s.dump(),before);
 saveProject(s,named('Approved'),true,found.primaryRaw);
 assert.equal(inspectStorage(s).project.title,'Approved');
 assert.equal(JSON.parse(s.getItem(BACKUP_KEY)).title,'First');
});

test('stale recovery is rejected even with explicit overwrite permission',()=>{
 const s=store();saveProject(s,named('A'));
 s.setItem(PRIMARY_KEY,'{damaged');
 const stale=inspectStorage(s);
 saveProject(s,named('Other tab'),true,stale.primaryRaw);
 const before=s.dump();
 assert.throws(()=>saveProject(s,named('Stale recovery'),true,stale.primaryRaw),{code:'STORAGE_CONFLICT'});
 assert.deepEqual(s.dump(),before);
});

test('portable archive roundtrip preserves maximum snapshot count and current project',()=>{
 const s=store();saveProject(s,named('Active'));
 for(let i=0;i<12;i++)addSnapshot(s,named('Archived '+i),1000+i);
 const file=serializeArchiveBackup(readArchive(s));
 const target=store();saveProject(target,named('Different active'));
 const parsed=parseArchiveBackup(file);
 assert.equal(importArchiveBackup(target,parsed,null),12);
 assert.deepEqual(readArchive(target).items.map(i=>i.project.title),readArchive(s).items.map(i=>i.project.title));
 assert.equal(inspectStorage(target).project.title,'Different active');
});

test('archive replacement rejects stale and quota-failed writes without mutation',()=>{
 const s=store();addSnapshot(s,named('Before'),1000);
 const file=parseArchiveBackup(serializeArchiveBackup(readArchive(s)));
 const before=s.dump();
 assert.throws(()=>importArchiveBackup(s,file,'stale'),{code:'ARCHIVE_CONFLICT'});
 assert.deepEqual(s.dump(),before);
 const fail={getItem:key=>s.getItem(key),setItem:()=>{throw Error('QuotaExceededError');}};
 assert.throws(()=>importArchiveBackup(fail,file,s.getItem(ARCHIVE_KEY)),/QuotaExceededError/);
 assert.deepEqual(s.dump(),before);
});
