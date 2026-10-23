import {validateProject} from './core.mjs';
export const MAX_BACKUP_BYTES=100000;
const size=text=>new TextEncoder().encode(text).byteLength;
export function serializeBackup(project){
 const json=JSON.stringify(validateProject(project),null,2);
 if(size(json)>MAX_BACKUP_BYTES)throw new Error('Sicherung überschreitet 100 KB.');
 return json;
}
export function parseBackupText(text){
 if(typeof text!=='string'||text.length>MAX_BACKUP_BYTES)throw new Error('Sicherung überschreitet 100 KB.');
 const cleaned=text.replace(/^\uFEFF/,'');
 if(size(cleaned)>MAX_BACKUP_BYTES)throw new Error('Sicherung überschreitet 100 KB.');
 try{return validateProject(JSON.parse(cleaned));}
 catch(error){throw new Error('Ungültige oder beschädigte Sicherung: '+(error?.message||'Dateifehler'));}
}
