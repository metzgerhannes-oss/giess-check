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
function intercept(base,handler){
 return {
  getItem:key=>base.getItem(key),
  setItem:(key,value)=>handler(key,String(value),base)
 };
}

test('silently ignored first primary write never seeds a false backup',()=>{
 const s=store();
 const faulty=intercept(s,(key,value,base)=>{if(key!==PRIMARY_KEY)base.setItem(key,value);});
 assert.throws(()=>saveProject(faulty,named('New'),false,null),{code:'STORAGE_CONFLICT'});
 assert.equal(s.getItem(PRIMARY_KEY),null);
 assert.equal(s.getItem(BACKUP_KEY),null);
});

test('intervening primary overwrite is detected before recovery copy advances',()=>{
 const s=store();saveProject(s,named('Previous'));
 const oldBackup=s.getItem(BACKUP_KEY),remote=JSON.stringify(named('Other tab'));
 const racing=intercept(s,(key,value,base)=>base.setItem(key,key===PRIMARY_KEY?remote:value));
 assert.throws(()=>saveProject(racing,named('Stale'),false,s.getItem(PRIMARY_KEY)),{code:'STORAGE_CONFLICT'});
 assert.equal(s.getItem(PRIMARY_KEY),remote);
 assert.equal(s.getItem(BACKUP_KEY),oldBackup);
});

test('unreadable primary after commit never overwrites recovery copy',()=>{
 const s=store();saveProject(s,named('Previous'));
 const backup=s.getItem(BACKUP_KEY);let wrote=false;
 const faulty={
  getItem(key){if(wrote&&key===PRIMARY_KEY)throw Error('SecurityError');return s.getItem(key);},
  setItem(key,value){s.setItem(key,value);if(key===PRIMARY_KEY)wrote=true;}
 };
 assert.throws(()=>saveProject(faulty,named('Next'),false,s.getItem(PRIMARY_KEY)),/SecurityError/);
 assert.equal(s.getItem(BACKUP_KEY),backup);
});

test('silently ignored optional backup is reported without undoing primary',()=>{
 const s=store();saveProject(s,named('Previous'));saveProject(s,named('Latest'));
 const previousBackup=s.getItem(BACKUP_KEY),warnings=[];
 const faulty=intercept(s,(key,value,base)=>{if(key!==BACKUP_KEY)base.setItem(key,value);});
 const result=saveProject(faulty,named('Next'),false,s.getItem(PRIMARY_KEY),e=>warnings.push(e.message));
 assert.equal(result.title,'Next');
 assert.equal(JSON.parse(s.getItem(PRIMARY_KEY)).title,'Next');
 assert.equal(s.getItem(BACKUP_KEY),previousBackup);
 assert.match(warnings[0],/bestätigt/);
 assert.equal(warnings.length,1);
});

test('a changed backup after write is warned about and never rewritten again',()=>{
 const s=store();saveProject(s,named('Previous'));
 const other=JSON.stringify(named('Another recovery')),warnings=[];
 const racing=intercept(s,(key,value,base)=>base.setItem(key,key===BACKUP_KEY?other:value));
 saveProject(racing,named('Next'),false,s.getItem(PRIMARY_KEY),e=>warnings.push(e.message));
 assert.equal(s.getItem(BACKUP_KEY),other);
 assert.equal(JSON.parse(s.getItem(PRIMARY_KEY)).title,'Next');
 assert.equal(warnings.length,1);
});

test('throwing warning callback cannot turn committed primary into a failed save',()=>{
 const s=store();saveProject(s,named('Previous'));saveProject(s,named('Latest'));
 const faulty=intercept(s,(key,value,base)=>{if(key!==BACKUP_KEY)base.setItem(key,value);});
 assert.equal(saveProject(faulty,named('Next'),false,s.getItem(PRIMARY_KEY),()=>{throw Error('UI failure');}).title,'Next');
 assert.equal(JSON.parse(s.getItem(PRIMARY_KEY)).title,'Next');
});

test('silently ignored archive append cannot claim a saved snapshot',()=>{
 const s=store();
 const faulty=intercept(s,(key,value,base)=>{if(key!==ARCHIVE_KEY)base.setItem(key,value);});
 assert.throws(()=>addSnapshot(faulty,named('New'),1000),{code:'ARCHIVE_CONFLICT'});
 assert.equal(s.getItem(ARCHIVE_KEY),null);
});

test('archive removal detects a competing post-write replacement',()=>{
 const s=store(),entry=addSnapshot(s,named('Original'),1000);
 const remote=JSON.stringify({version:1,items:[],source:'other-tab'});
 const racing=intercept(s,(key,value,base)=>base.setItem(key,key===ARCHIVE_KEY?remote:value));
 assert.throws(()=>removeSnapshot(racing,entry.id),{code:'ARCHIVE_CONFLICT'});
 assert.equal(s.getItem(ARCHIVE_KEY),remote);
 assert.equal(readArchive(s).state,'ok');
});

test('silently ignored archive import preserves the previous archive and active data',()=>{
 const s=store();saveProject(s,named('Active'));addSnapshot(s,named('Archived'),1000);
 const before=s.dump();
 const faulty=intercept(s,(key,value,base)=>{if(key!==ARCHIVE_KEY)base.setItem(key,value);});
 assert.throws(()=>importArchiveBackup(faulty,{version:1,items:[]},s.getItem(ARCHIVE_KEY)),{code:'ARCHIVE_CONFLICT'});
 assert.deepEqual(s.dump(),before);
});

test('archive import with denied post-write verification never changes active keys',()=>{
 const s=store();saveProject(s,named('Active'));
 const beforePrimary=s.getItem(PRIMARY_KEY),beforeBackup=s.getItem(BACKUP_KEY);
 let wrote=false;
 const faulty={
  getItem(key){if(wrote&&key===ARCHIVE_KEY)throw Error('SecurityError');return s.getItem(key);},
  setItem(key,value){s.setItem(key,value);if(key===ARCHIVE_KEY)wrote=true;}
 };
 assert.throws(()=>importArchiveBackup(faulty,{version:1,items:[{id:'s1',createdAt:1,project:named('Archived')}]},null),/SecurityError/);
 assert.equal(s.getItem(PRIMARY_KEY),beforePrimary);
 assert.equal(s.getItem(BACKUP_KEY),beforeBackup);
});
