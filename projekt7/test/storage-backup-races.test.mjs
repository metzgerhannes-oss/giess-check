import test from 'node:test';
import assert from 'node:assert/strict';
import {blankProject} from '../core.mjs';
import {saveProject,PRIMARY_KEY,BACKUP_KEY} from '../storage.mjs';

const named=title=>({...blankProject(),title});
function store(){
 const data=new Map();
 return {
  getItem:key=>data.has(key)?data.get(key):null,
  setItem:(key,value)=>data.set(key,String(value)),
  dump:()=>new Map(data)
 };
}

test('normal saves advance the previous-primary recovery copy without warnings',()=>{
 const s=store(),warnings=[];
 saveProject(s,named('First'),false,null,e=>warnings.push(e));
 saveProject(s,named('Second'),false,s.getItem(PRIMARY_KEY),e=>warnings.push(e));
 assert.equal(JSON.parse(s.getItem(PRIMARY_KEY)).title,'Second');
 assert.equal(JSON.parse(s.getItem(BACKUP_KEY)).title,'First');
 assert.equal(warnings.length,0);
});

test('a competing recovery-copy write during primary save is preserved',()=>{
 const s=store(),warnings=[];
 saveProject(s,named('First'));saveProject(s,named('Second'));
 const remote=JSON.stringify(named('Other tab recovery'));
 const racing={
  getItem:key=>s.getItem(key),
  setItem(key,value){
   s.setItem(key,value);
   if(key===PRIMARY_KEY)s.setItem(BACKUP_KEY,remote);
  }
 };
 const saved=saveProject(racing,named('Third'),false,s.getItem(PRIMARY_KEY),e=>warnings.push(e.message));
 assert.equal(saved.title,'Third');
 assert.equal(JSON.parse(s.getItem(PRIMARY_KEY)).title,'Third');
 assert.equal(s.getItem(BACKUP_KEY),remote,'Another tab backup must not be overwritten');
 assert.match(warnings[0],/zwischenzeitlich/);
 assert.equal(warnings.length,1);
});

test('denied optional backup read never blocks a valid primary save',()=>{
 const s=store(),warnings=[];
 saveProject(s,named('First'));
 const before=s.getItem(BACKUP_KEY);
 const guarded={
  getItem(key){if(key===BACKUP_KEY)throw Error('SecurityError');return s.getItem(key);},
  setItem:(key,value)=>s.setItem(key,value)
 };
 const saved=saveProject(guarded,named('Second'),false,s.getItem(PRIMARY_KEY),e=>warnings.push(e.message));
 assert.equal(saved.title,'Second');
 assert.equal(JSON.parse(s.getItem(PRIMARY_KEY)).title,'Second');
 assert.equal(s.getItem(BACKUP_KEY),before);
 assert.deepEqual(warnings,['SecurityError']);
});

test('competing primary overwrite before backup write raises conflict and preserves backup',()=>{
 const s=store();saveProject(s,named('First'));saveProject(s,named('Second'));
 const previousBackup=s.getItem(BACKUP_KEY),remote=JSON.stringify(named('Other tab'));
 let reads=0,backupWrites=0;
 const racing={
  getItem(key){
   if(key===PRIMARY_KEY&&++reads===4)s.setItem(PRIMARY_KEY,remote);
   return s.getItem(key);
  },
  setItem(key,value){
   if(key===BACKUP_KEY)backupWrites++;
   s.setItem(key,value);
  }
 };
 assert.throws(()=>saveProject(racing,named('Third'),false,s.getItem(PRIMARY_KEY)),{code:'STORAGE_CONFLICT'});
 assert.equal(s.getItem(PRIMARY_KEY),remote);
 assert.equal(s.getItem(BACKUP_KEY),previousBackup);
 assert.equal(backupWrites,0);
});

test('competing primary overwrite during backup write is not reported as success',()=>{
 const s=store();saveProject(s,named('First'));saveProject(s,named('Second'));
 const remote=JSON.stringify(named('Other tab'));
 const racing={
  getItem:key=>s.getItem(key),
  setItem(key,value){
   s.setItem(key,value);
   if(key===BACKUP_KEY)s.setItem(PRIMARY_KEY,remote);
  }
 };
 assert.throws(()=>saveProject(racing,named('Third'),false,s.getItem(PRIMARY_KEY)),{code:'STORAGE_CONFLICT'});
 assert.equal(s.getItem(PRIMARY_KEY),remote);
});

test('failed optional backup write warns while confirmed primary remains usable',()=>{
 const s=store(),warnings=[];
 saveProject(s,named('First'));
 const guarded={
  getItem:key=>s.getItem(key),
  setItem(key,value){if(key===BACKUP_KEY)throw Error('QuotaExceededError');s.setItem(key,value);}
 };
 const saved=saveProject(guarded,named('Second'),false,s.getItem(PRIMARY_KEY),e=>warnings.push(e.message));
 assert.equal(saved.title,'Second');
 assert.equal(JSON.parse(s.getItem(PRIMARY_KEY)).title,'Second');
 assert.deepEqual(warnings,['QuotaExceededError']);
});
