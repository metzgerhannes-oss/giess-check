import test from 'node:test';
import assert from 'node:assert/strict';
import {blankProject} from '../core.mjs';
import {saveProject,inspectStorage,PRIMARY_KEY,BACKUP_KEY} from '../storage.mjs';

const named=title=>({...blankProject(),title});
function store(){
 const values=new Map();
 return {
  getItem:key=>values.has(key)?values.get(key):null,
  setItem:(key,value)=>values.set(key,String(value)),
  snapshot:()=>new Map(values)
 };
}

test('missing primary with surviving backup requires explicit recovery and never writes',()=>{
 const s=store(),backup=JSON.stringify(named('Only surviving copy'));
 s.setItem(BACKUP_KEY,backup);
 assert.equal(inspectStorage(s).state,'recovered');
 const before=s.snapshot();
 assert.throws(()=>saveProject(s,named('Accidental reset'),false,null),{code:'STORAGE_RECOVERY_REQUIRED'});
 assert.deepEqual(s.snapshot(),before);
});

test('authorized recovery from missing primary preserves the surviving backup',()=>{
 const s=store(),backup=JSON.stringify(named('Surviving copy'));
 s.setItem(BACKUP_KEY,backup);
 const observed=inspectStorage(s);
 assert.equal(saveProject(s,observed.project,true,observed.primaryRaw).title,'Surviving copy');
 assert.equal(s.getItem(BACKUP_KEY),backup);
 assert.equal(inspectStorage(s).state,'ok');
});

test('a competing backup replacement blocks a missing-primary recovery before writing',()=>{
 const s=store(),old=JSON.stringify(named('Old')),newer=JSON.stringify(named('Other tab'));
 s.setItem(BACKUP_KEY,old);
 let reads=0,writes=0;
 const racing={
  getItem(key){
   if(key===BACKUP_KEY&&++reads===2)s.setItem(BACKUP_KEY,newer);
   return s.getItem(key);
  },
  setItem(key,value){writes++;s.setItem(key,value);}
 };
 assert.throws(()=>saveProject(racing,named('Stale'),true,null),{code:'STORAGE_CONFLICT'});
 assert.equal(writes,0);
 assert.equal(s.getItem(PRIMARY_KEY),null);
 assert.equal(s.getItem(BACKUP_KEY),newer);
});

test('a competing backup replacement blocks repair of a corrupt primary',()=>{
 const s=store(),old=JSON.stringify(named('Backup')),newer=JSON.stringify(named('Other tab'));
 s.setItem(PRIMARY_KEY,'{broken');
 s.setItem(BACKUP_KEY,old);
 let reads=0,writes=0;
 const racing={
  getItem(key){
   if(key===BACKUP_KEY&&++reads===2)s.setItem(BACKUP_KEY,newer);
   return s.getItem(key);
  },
  setItem(key,value){writes++;s.setItem(key,value);}
 };
 assert.throws(()=>saveProject(racing,named('Stale repair'),true,'{broken'),{code:'STORAGE_CONFLICT'});
 assert.equal(writes,0);
 assert.equal(s.getItem(PRIMARY_KEY),'{broken');
 assert.equal(s.getItem(BACKUP_KEY),newer);
});

test('unreadable sole backup fails closed before creating a primary',()=>{
 const s=store();
 const blocked={
  getItem(key){if(key===BACKUP_KEY)throw Error('SecurityError');return s.getItem(key);},
  setItem:()=>{throw Error('Unexpected write');}
 };
 assert.throws(()=>saveProject(blocked,named('New'),false,null),/SecurityError/);
 assert.deepEqual(s.snapshot(),new Map());
});

test('new installation with no backup still persists primary and initial recovery copy',()=>{
 const s=store();
 saveProject(s,named('First'),false,null);
 assert.equal(inspectStorage(s).state,'ok');
 assert.equal(JSON.parse(s.getItem(PRIMARY_KEY)).title,'First');
 assert.equal(s.getItem(BACKUP_KEY),s.getItem(PRIMARY_KEY));
});

test('corrupt primary cannot be replaced without explicit approval',()=>{
 const s=store();s.setItem(PRIMARY_KEY,'{broken');
 const before=s.snapshot();
 assert.throws(()=>saveProject(s,named('Unsafe'),false,'{broken'),/beschädigt/);
 assert.deepEqual(s.snapshot(),before);
});
