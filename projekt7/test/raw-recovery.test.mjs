import test from 'node:test';
import assert from 'node:assert/strict';
import {blankProject} from '../core.mjs';
import {PRIMARY_KEY,BACKUP_KEY,saveProject} from '../storage.mjs';
import {ARCHIVE_KEY,addSnapshot} from '../archive.mjs';
import {exportRawRecovery,MAX_RAW_RESCUE_BYTES,parseArchiveBackup} from '../archive-transfer.mjs';
import {parseBackupText} from '../backup.mjs';
const named=title=>({...blankProject(),title});
function store(seed=[]){
 const data=new Map(seed);let writes=0;
 return {getItem:key=>data.has(key)?data.get(key):null,
  setItem:(key,value)=>{writes++;data.set(key,String(value));},
  get writes(){return writes;},snapshot:()=>new Map(data)};
}
test('corrupted primary and archive preserve every raw byte without mutation',()=>{
 const s=store([[PRIMARY_KEY,'{bad\\u0000\\n'],[BACKUP_KEY,JSON.stringify(named('Backup 🌿'))],[ARCHIVE_KEY,'{broken']]);
 const before=s.snapshot(),data=JSON.parse(exportRawRecovery(s));
 assert.equal(data.format,'klarpunkt-raw-rescue');assert.equal(data.version,1);
 assert.deepEqual(data.raw,{[PRIMARY_KEY]:s.getItem(PRIMARY_KEY),[BACKUP_KEY]:s.getItem(BACKUP_KEY),[ARCHIVE_KEY]:s.getItem(ARCHIVE_KEY)});
 assert.deepEqual(s.snapshot(),before);assert.equal(s.writes,0);
});
test('valid Unicode data and archives remain unchanged',()=>{
 const s=store();saveProject(s,named('Ü🌿'));addSnapshot(s,named('Archive'),1000);
 const before=s.snapshot(),writes=s.writes,raw=JSON.parse(exportRawRecovery(s)).raw;
 for(const key of [PRIMARY_KEY,BACKUP_KEY,ARCHIVE_KEY])assert.equal(raw[key],s.getItem(key));
 assert.deepEqual(s.snapshot(),before);assert.equal(s.writes,writes);
});
test('absent optional keys remain null; completely empty storage is refused',()=>{
 const s=store([[BACKUP_KEY,'{bad']]),raw=JSON.parse(exportRawRecovery(s)).raw;
 assert.equal(raw[PRIMARY_KEY],null);assert.equal(raw[ARCHIVE_KEY],null);
 assert.equal(raw[BACKUP_KEY],'{bad');
 assert.throws(()=>exportRawRecovery(store()),/Keine lokalen Rohdaten/);
});
test('rescue JSON cannot bypass validated project or archive imports',()=>{
 const s=store([[PRIMARY_KEY,'{bad']]),raw=exportRawRecovery(s);
 assert.throws(()=>parseArchiveBackup(raw),/Archivformat/);
 assert.throws(()=>parseBackupText(raw));
 assert.equal(s.writes,0);
});
test('denied first and second reads fail without mutations',()=>{
 const s=store([[PRIMARY_KEY,'present']]);
 assert.throws(()=>exportRawRecovery({getItem:()=>{throw Error('SecurityError');}}),/SecurityError/);
 let reads=0;
 assert.throws(()=>exportRawRecovery({getItem:key=>{if(++reads===4)throw Error('Read denied');return s.getItem(key);}}),/Read denied/);
 assert.equal(s.writes,0);
});
test('concurrent changes during double-read abort inconsistent rescue',()=>{
 const s=store([[PRIMARY_KEY,'first']]);let reads=0;
 const racing={getItem:key=>++reads===4?'other-tab':s.getItem(key)};
 assert.throws(()=>exportRawRecovery(racing),{code:'STORAGE_CONFLICT'});
 assert.equal(s.writes,0);
});
test('oversized raw entry and escaped JSON payload are rejected read-only',()=>{
 const huge=store([[PRIMARY_KEY,'x'.repeat(MAX_RAW_RESCUE_BYTES+1)]]);
 assert.throws(()=>exportRawRecovery(huge),/zu groß/);
 const escaped=store([[PRIMARY_KEY,String.fromCharCode(0).repeat(MAX_RAW_RESCUE_BYTES/2)]]);
 assert.throws(()=>exportRawRecovery(escaped),/2 MB/);
 assert.equal(huge.writes,0);assert.equal(escaped.writes,0);
});
test('missing storage and invalid adapter types fail closed',()=>{
 assert.throws(()=>exportRawRecovery(null),/nicht verfügbar/);
 assert.throws(()=>exportRawRecovery({getItem:key=>key===PRIMARY_KEY?42:null}),/ungültig/);
});
