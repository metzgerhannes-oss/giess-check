import test from 'node:test';
import assert from 'node:assert/strict';
import {blankProject} from '../core.mjs';
import {inspectStorage,saveProject,PRIMARY_KEY,BACKUP_KEY} from '../storage.mjs';
import {readArchive,addSnapshot,ARCHIVE_KEY} from '../archive.mjs';
function faultStore(){
 const data=new Map();let blocked=null;
 return {
  getItem:key=>{if(blocked?.read===key)throw new Error('SecurityError');return data.has(key)?data.get(key):null;},
  setItem:(key,value)=>{if(blocked?.write===key)throw new Error('QuotaExceededError');data.set(key,String(value));},
  setBlocked:value=>{blocked=value;},dump:()=>new Map(data)
 };
}
const project=title=>({...blankProject(),title});
test('failed primary write preserves both current project and previous backup',()=>{
 const s=faultStore();saveProject(s,project('A'));saveProject(s,project('B'));
 const before=s.dump();s.setBlocked({write:PRIMARY_KEY});
 assert.throws(()=>saveProject(s,project('C')),/QuotaExceededError/);
 assert.deepEqual(s.dump(),before);
});
test('failed backup write persists primary and reports reduced redundancy',()=>{
 const s=faultStore();saveProject(s,project('A'));saveProject(s,project('B'));
 const before=s.getItem(BACKUP_KEY),errors=[];
 s.setBlocked({write:BACKUP_KEY});
 const saved=saveProject(s,project('C'),false,undefined,error=>errors.push(error.message));
 assert.equal(saved.title,'C');assert.equal(inspectStorage(s).project.title,'C');
 assert.equal(s.getItem(BACKUP_KEY),before);assert.deepEqual(errors,['QuotaExceededError']);
});
test('first write with backup quota failure preserves valid primary',()=>{
 const s=faultStore(),warnings=[];s.setBlocked({write:BACKUP_KEY});
 saveProject(s,project('First'),false,null,e=>warnings.push(e.message));
 assert.equal(inspectStorage(s).state,'ok');assert.equal(inspectStorage(s).project.title,'First');
 assert.equal(s.getItem(BACKUP_KEY),null);assert.equal(warnings.length,1);
});
test('later successful save restores previous-primary recovery copy',()=>{
 const s=faultStore();s.setBlocked({write:BACKUP_KEY});saveProject(s,project('First'));
 s.setBlocked(null);saveProject(s,project('Second'));
 assert.equal(JSON.parse(s.getItem(BACKUP_KEY)).title,'First');
 assert.equal(JSON.parse(s.getItem(PRIMARY_KEY)).title,'Second');
});
test('damaged primary requires explicit recovery override',()=>{
 const s=faultStore();saveProject(s,project('First'));s.setItem(PRIMARY_KEY,'{corrupt');
 const before=s.dump();assert.throws(()=>saveProject(s,project('Second')),/beschädigt/);
 assert.deepEqual(s.dump(),before);saveProject(s,project('Second'),true);
 assert.equal(JSON.parse(s.getItem(PRIMARY_KEY)).title,'Second');
 assert.equal(JSON.parse(s.getItem(BACKUP_KEY)).title,'First');
});
test('stale optimistic version rejects before any write',()=>{
 const s=faultStore();saveProject(s,project('First'));const before=s.dump();
 assert.throws(()=>saveProject(s,project('Stale'),false,'outdated'),e=>e.code==='STORAGE_CONFLICT');
 assert.deepEqual(s.dump(),before);
});
test('250 edits with intermittent quota failures preserve last valid commit',()=>{
 const s=faultStore();saveProject(s,project('Start'));let last='Start',failed=0,warnings=0;
 for(let i=1;i<=250;i++){
  s.setBlocked(i%17===0?{write:PRIMARY_KEY}:i%11===0?{write:BACKUP_KEY}:null);
  try{saveProject(s,project('Revision '+i),false,s.getItem(PRIMARY_KEY),()=>warnings++);last='Revision '+i;}
  catch(error){assert.equal(error.message,'QuotaExceededError');failed++;}
  assert.equal(inspectStorage(s).project.title,last);assert.equal(inspectStorage(s).state,'ok');
 }
 assert.ok(failed>=10);assert.ok(warnings>=15);
});
test('archive permission error is unavailable, not false corruption',()=>{
 const s=faultStore();addSnapshot(s,project('Archived'));const before=s.dump();
 s.setBlocked({read:ARCHIVE_KEY});assert.equal(readArchive(s).state,'unavailable');
 assert.throws(()=>addSnapshot(s,project('New')),/nicht verfügbar/);
 assert.deepEqual(s.dump(),before);s.setBlocked(null);
 assert.equal(readArchive(s).state,'ok');
 assert.equal(readArchive(s).items[0].project.title,'Archived');
});
