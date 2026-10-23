import test from 'node:test';
import assert from 'node:assert/strict';
import {blankProject,validateProject} from '../core.mjs';
import {MAX_BACKUP_BYTES,serializeBackup,parseBackupText} from '../backup.mjs';
test('UTF-8 roundtrip and BOM',()=>{
 const p=blankProject();p.title='Entscheidung über Café ☕';p.options[0].name='Zürich';
 const data=serializeBackup(p);
 assert.deepEqual(parseBackupText(data),validateProject(p));
 assert.deepEqual(parseBackupText('\uFEFF'+data),validateProject(p));
});
test('invalid formats fail safely',()=>{
 for(const value of ['{broken','null','[]','{"version":2}',JSON.stringify({version:1,options:[],criteria:[]})])assert.throws(()=>parseBackupText(value));
});
test('UTF-8 byte limit enforced',()=>{
 assert.throws(()=>parseBackupText('a'.repeat(MAX_BACKUP_BYTES+1)),/100 KB/);
 assert.throws(()=>parseBackupText('ü'.repeat(MAX_BACKUP_BYTES/2+1)),/100 KB/);
});
test('export never mutates the original',()=>{
 const p=blankProject(),before=JSON.stringify(p);serializeBackup(p);assert.equal(JSON.stringify(p),before);
});
test('malicious option identifiers do not pollute prototypes',()=>{
 const p=blankProject();p.options[0].id='__proto__';p.criteria[0].ratings=JSON.parse('{"__proto__":10,"o2":4}');
 const v=parseBackupText(serializeBackup(p));
 assert.equal(Object.hasOwn(v.criteria[0].ratings,'__proto__'),true);
 assert.equal(({}).polluted,undefined);
});
