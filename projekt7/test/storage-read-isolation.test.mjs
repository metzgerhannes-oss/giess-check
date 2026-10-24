import test from 'node:test';
import assert from 'node:assert/strict';
import {blankProject} from '../core.mjs';
import {inspectStorage,saveProject,PRIMARY_KEY,BACKUP_KEY} from '../storage.mjs';

function faultStore(){
 const values=new Map(),blockedReads=new Set(),blockedWrites=new Set(),reads=[];
 return {
  getItem(key){reads.push(key);if(blockedReads.has(key))throw Error('SecurityError: '+key);return values.has(key)?values.get(key):null;},
  setItem(key,value){if(blockedWrites.has(key))throw Error('QuotaExceededError: '+key);values.set(key,String(value));},
  blockRead(key){blockedReads.add(key);},
  unblockRead(key){blockedReads.delete(key);},
  blockWrite(key){blockedWrites.add(key);},
  dump(){return new Map(values);},
  reads
 };
}
const named=title=>({...blankProject(),title});

test('valid primary loads even when backup read is forbidden',()=>{
 const s=faultStore();saveProject(s,named('Active'));s.blockRead(BACKUP_KEY);
 const before=s.reads.length,found=inspectStorage(s);
 assert.equal(found.state,'ok');assert.equal(found.project.title,'Active');
 assert.deepEqual(s.reads.slice(before),[PRIMARY_KEY]);
});
test('valid primary can be saved without reading inaccessible backup',()=>{
 const s=faultStore();saveProject(s,named('A'));saveProject(s,named('B'));
 s.blockRead(BACKUP_KEY);
 const before=s.reads.length,expected=s.getItem(PRIMARY_KEY);
 saveProject(s,named('C'),false,expected);
 assert.deepEqual(s.reads.slice(before+1),[PRIMARY_KEY,PRIMARY_KEY]);
 assert.equal(JSON.parse(s.getItem(PRIMARY_KEY)).title,'C');
 s.unblockRead(BACKUP_KEY);
 assert.equal(JSON.parse(s.getItem(BACKUP_KEY)).title,'B');
});
test('valid primary is authoritative even if backup contains malformed JSON',()=>{
 const s=faultStore();saveProject(s,named('Active'));s.setItem(BACKUP_KEY,'{damaged');
 assert.equal(inspectStorage(s).state,'ok');
 saveProject(s,named('Next'));
 assert.equal(JSON.parse(s.getItem(BACKUP_KEY)).title,'Active');
});
test('invalid primary still recovers valid backup without mutation',()=>{
 const s=faultStore();saveProject(s,named('Recovered'));s.setItem(PRIMARY_KEY,'{broken');
 const before=s.dump(),found=inspectStorage(s);
 assert.equal(found.state,'recovered');assert.equal(found.project.title,'Recovered');
 assert.deepEqual(s.dump(),before);
});
test('inaccessible backup with invalid primary is unavailable, never falsely damaged',()=>{
 const s=faultStore();saveProject(s,named('Safe'));s.setItem(PRIMARY_KEY,'{broken');
 const before=s.dump();s.blockRead(BACKUP_KEY);
 assert.equal(inspectStorage(s).state,'unavailable');
 assert.deepEqual(s.dump(),before);
});
test('inaccessible backup with missing primary does not falsely create new state',()=>{
 const s=faultStore();s.blockRead(BACKUP_KEY);
 assert.equal(inspectStorage(s).state,'unavailable');
 assert.equal(s.dump().size,0);
});
test('inaccessible primary never triggers a backup-only startup or writes',()=>{
 const s=faultStore();saveProject(s,named('Safe'));s.blockRead(PRIMARY_KEY);
 const before=s.dump();assert.equal(inspectStorage(s).state,'unavailable');
 assert.deepEqual(s.dump(),before);
});
test('no valid primary and unreadable backup aborts before any write',()=>{
 const s=faultStore();s.blockRead(BACKUP_KEY);const before=s.dump();
 assert.throws(()=>saveProject(s,named('New')),/SecurityError/);
 assert.deepEqual(s.dump(),before);
});
test('explicit corrupt-primary override cannot hide an unreadable recovery copy',()=>{
 const s=faultStore();saveProject(s,named('Backup'));s.setItem(PRIMARY_KEY,'{broken');
 const before=s.dump();s.blockRead(BACKUP_KEY);
 assert.throws(()=>saveProject(s,named('Replacement'),true,s.getItem(PRIMARY_KEY)),/SecurityError/);
 assert.deepEqual(s.dump(),before);
});
test('explicit recovery retains readable backup and repairs primary',()=>{
 const s=faultStore();saveProject(s,named('Backup'));s.setItem(PRIMARY_KEY,'{broken');
 saveProject(s,named('Recovered'),true,s.getItem(PRIMARY_KEY));
 assert.equal(inspectStorage(s).project.title,'Recovered');
 assert.equal(JSON.parse(s.getItem(BACKUP_KEY)).title,'Backup');
});
test('first write preserves an existing backup rather than replacing it',()=>{
 const s=faultStore();s.setItem(BACKUP_KEY,JSON.stringify(named('Older')));
 saveProject(s,named('New'));
 assert.equal(JSON.parse(s.getItem(PRIMARY_KEY)).title,'New');
 assert.equal(JSON.parse(s.getItem(BACKUP_KEY)).title,'Older');
});
test('primary quota failure preserves both keys even with valid optional backup',()=>{
 const s=faultStore();saveProject(s,named('A'));saveProject(s,named('B'));
 const before=s.dump();s.blockWrite(PRIMARY_KEY);
 assert.throws(()=>saveProject(s,named('C')),/QuotaExceededError/);
 assert.deepEqual(s.dump(),before);
});
