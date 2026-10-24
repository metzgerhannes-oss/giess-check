import test from 'node:test';
import assert from 'node:assert/strict';
import {blankProject} from '../core.mjs';
import {MAX_BACKUP_BYTES} from '../backup.mjs';
import {saveProject,inspectStorage,storageEventConflicts,PRIMARY_KEY,BACKUP_KEY} from '../storage.mjs';
import {ARCHIVE_KEY,addSnapshot,readArchive,removeSnapshot} from '../archive.mjs';
import {serializeArchiveBackup,importArchiveBackupAsync} from '../archive-transfer.mjs';

const named=title=>({...blankProject(),title});
function store(){
 const map=new Map();
 return {
  getItem:key=>map.has(key)?map.get(key):null,
  setItem:(key,value)=>map.set(key,String(value)),
  dump:()=>new Map(map)
 };
}
function fixture(){
 const source=store();
 addSnapshot(source,named('Portable'),1000);
 return serializeArchiveBackup(readArchive(source));
}

test('oversized primary recovers from a bounded backup without writing',()=>{
 const s=store(),safe=JSON.stringify(named('Safe'));
 s.setItem(PRIMARY_KEY,' '.repeat(MAX_BACKUP_BYTES+1));
 s.setItem(BACKUP_KEY,safe);
 const before=s.dump(),found=inspectStorage(s);
 assert.equal(found.state,'recovered');
 assert.equal(found.project.title,'Safe');
 assert.deepEqual(s.dump(),before);
 assert.throws(()=>saveProject(s,named('Unsafe'),false,found.primaryRaw),/beschädigt/);
 assert.deepEqual(s.dump(),before);
});

test('multibyte oversized JSON is rejected even if its character count is under limit',()=>{
 const s=store(),raw=JSON.stringify({...named('Looks valid'),padding:'ü'.repeat(55000)});
 assert.ok(raw.length<MAX_BACKUP_BYTES);
 assert.ok(new TextEncoder().encode(raw).byteLength>MAX_BACKUP_BYTES);
 s.setItem(PRIMARY_KEY,raw);
 assert.equal(inspectStorage(s).state,'damaged');
 assert.equal(s.getItem(PRIMARY_KEY),raw);
});

test('oversized backup cannot hide a healthy primary',()=>{
 const s=store();
 saveProject(s,named('Active'));
 s.setItem(BACKUP_KEY,' '.repeat(MAX_BACKUP_BYTES+1));
 assert.equal(inspectStorage(s).state,'ok');
 assert.equal(inspectStorage(s).project.title,'Active');
});

test('explicit repair of oversized primary preserves an intact backup',()=>{
 const s=store(),safe=JSON.stringify(named('Recoverable'));
 s.setItem(PRIMARY_KEY,' '.repeat(MAX_BACKUP_BYTES+1));
 s.setItem(BACKUP_KEY,safe);
 const old=inspectStorage(s);
 saveProject(s,named('Repaired'),true,old.primaryRaw);
 assert.equal(inspectStorage(s).project.title,'Repaired');
 assert.equal(s.getItem(BACKUP_KEY),safe);
});

test('storage.clear always invalidates a tab including an empty-startup tab',()=>{
 assert.equal(storageEventConflicts(null,null,null),true);
 assert.equal(storageEventConflicts(null,null,'existing'),true);
 assert.equal(storageEventConflicts(PRIMARY_KEY,'changed','old'),true);
 assert.equal(storageEventConflicts(PRIMARY_KEY,null,null),false);
 assert.equal(storageEventConflicts(BACKUP_KEY,'other','old'),false);
});

test('archive import detects changes during delayed file reading and preserves both versions',async()=>{
 const s=store(),file=fixture();
 const baseline=readArchive(s).raw;
 let release;
 const delayed=new Promise(resolve=>{release=resolve;});
 const pending=importArchiveBackupAsync(s,()=>delayed,baseline,()=>true);
 addSnapshot(s,named('Other tab'),2000);
 const before=s.dump();
 release(file);
 await assert.rejects(pending,{code:'ARCHIVE_CONFLICT'});
 assert.deepEqual(s.dump(),before);
});

test('archive import detects changes during confirmation without overwriting',async()=>{
 const s=store(),file=fixture(),baseline=readArchive(s).raw;
 await assert.rejects(
  importArchiveBackupAsync(s,()=>file,baseline,()=>{
   addSnapshot(s,named('Other tab'),3000);
   return true;
  }),
  {code:'ARCHIVE_CONFLICT'}
 );
 assert.equal(readArchive(s).items[0].project.title,'Other tab');
});

test('stale displayed archive is rejected before reading the replacement file',async()=>{
 const s=store(),file=fixture(),baseline=readArchive(s).raw;
 addSnapshot(s,named('Newer'),4000);
 let read=false;
 await assert.rejects(importArchiveBackupAsync(s,()=>{read=true;return file;},baseline,()=>true),{code:'ARCHIVE_CONFLICT'});
 assert.equal(read,false);
 assert.equal(readArchive(s).items[0].project.title,'Newer');
});

test('cancelling archive import never writes to any key',async()=>{
 const s=store(),file=fixture();
 saveProject(s,named('Active'));
 const before=s.dump();
 assert.equal(await importArchiveBackupAsync(s,()=>file,readArchive(s).raw,()=>false),null);
 assert.deepEqual(s.dump(),before);
});

test('successful guarded archive import preserves active project and backup',async()=>{
 const s=store(),file=fixture();
 saveProject(s,named('Active'));
 const primary=s.getItem(PRIMARY_KEY),backup=s.getItem(BACKUP_KEY);
 assert.equal(await importArchiveBackupAsync(s,()=>file,readArchive(s).raw,()=>true),1);
 assert.equal(readArchive(s).items[0].project.title,'Portable');
 assert.equal(s.getItem(PRIMARY_KEY),primary);
 assert.equal(s.getItem(BACKUP_KEY),backup);
});

test('stale rendered snapshot cannot be removed after another tab changes archive',()=>{
 const s=store(),entry=addSnapshot(s,named('Old'),1000);
 const displayed=readArchive(s).raw;
 addSnapshot(s,named('Remote'),2000);
 const before=s.dump();
 assert.throws(()=>removeSnapshot(s,entry.id,displayed),{code:'ARCHIVE_CONFLICT'});
 assert.deepEqual(s.dump(),before);
});
