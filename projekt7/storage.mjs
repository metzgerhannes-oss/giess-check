import {starterProject,validateProject} from './core.mjs';
import {MAX_BACKUP_BYTES} from './backup.mjs';
export const PRIMARY_KEY='klarpunkt.project.v1';
export const BACKUP_KEY='klarpunkt.project.backup.v1';
// A corrupt browser key must not force unbounded JSON parsing or make a
// valid bounded recovery copy inaccessible. Keep the same limit as file backup.
function decode(raw){
 if(raw===null)return null;
 if(typeof raw!=='string'||raw.length>MAX_BACKUP_BYTES||new TextEncoder().encode(raw).byteLength>MAX_BACKUP_BYTES){
  throw new Error('Lokaler Projektstand überschreitet die sichere Größe.');
 }
 return validateProject(JSON.parse(raw));
}
export function inspectStorage(storage){
 if(!storage)return {state:'unavailable',project:starterProject(),primaryRaw:undefined};
 let primary;
 try{primary=storage.getItem(PRIMARY_KEY);}
 catch{return {state:'unavailable',project:starterProject(),primaryRaw:undefined};}
 // The active project is authoritative. A denied optional-backup read must not
 // hide a healthy primary or make the app appear empty.
 if(primary!==null){
  try{
   const value=decode(primary);
   if(value)return {state:'ok',project:value,primaryRaw:primary};
  }catch{}
 }
 let backup;
 try{backup=storage.getItem(BACKUP_KEY);}
 catch{return {state:'unavailable',project:starterProject(),primaryRaw:primary};}
 if(primary===null&&backup===null)return {state:'new',project:starterProject(),primaryRaw:primary};
 try{
  const value=decode(backup);
  if(value)return {state:'recovered',project:value,primaryRaw:primary,backupRaw:backup};
 }catch{}
 return {state:'damaged',project:starterProject(),primaryRaw:primary};
}
export function saveProject(storage,project,override=false,expectedPrimaryRaw=undefined,onBackupFailure=null,expectedRecoveredBackupRaw=undefined){
 const clean=validateProject(project);
 const current=storage.getItem(PRIMARY_KEY);
 // Best-effort optimistic precondition: localStorage has no atomic compare-and-swap.
 if(expectedPrimaryRaw!==undefined&&current!==expectedPrimaryRaw){
  const error=new Error('Der Browserstand wurde in einem anderen Tab geändert.');
  error.code='STORAGE_CONFLICT';
  throw error;
 }
 let last=null;
 if(current!==null){
  try{last=decode(current);}
  catch{
   if(!override)throw new Error('Lokale Sicherung ist beschädigt.');
  }
 }
 const nextRaw=JSON.stringify(clean);
 if(new TextEncoder().encode(nextRaw).byteLength>MAX_BACKUP_BYTES)throw new Error('Projekt überschreitet die sichere Speichergröße.');
 let backupRaw=null;
 let observedBackupRaw=undefined;
 let backupReadError=null;
 if(last){
  // A valid primary is authoritative. Failure to read the optional recovery
  // key must not prevent saving it; instead warn and leave the backup alone.
  backupRaw=JSON.stringify(last);
  try{observedBackupRaw=storage.getItem(BACKUP_KEY);}
  catch(error){backupReadError=error;}
 }else{
  // A missing primary does not mean a fresh installation: the recovery copy
  // may contain the only surviving project. Never shadow it implicitly.
  // A damaged primary still needs explicit override (checked above).
  const previousBackup=storage.getItem(BACKUP_KEY);
  observedBackupRaw=previousBackup;
  // A recovery tab may be stale even when its primary revision is unchanged.
  if(expectedRecoveredBackupRaw!==undefined&&previousBackup!==expectedRecoveredBackupRaw){
   const error=new Error('Wiederherstellungskopie wurde seit dem Laden geändert.');
   error.code='STORAGE_CONFLICT';
   throw error;
  }
  if(current===null&&previousBackup!==null&&!override){
   const error=new Error('Wiederherstellungskopie vorhanden. Bitte den Browserstand zuerst prüfen und ausdrücklich wiederherstellen.');
   error.code='STORAGE_RECOVERY_REQUIRED';
   throw error;
  }
  if(current===null&&previousBackup===null)backupRaw=nextRaw;
 }
 // A second read narrows the inter-tab race window. A revision observed during
 // backup preparation must never be silently replaced by this tab.
 if(storage.getItem(PRIMARY_KEY)!==current){
  const error=new Error('Der Browserstand wurde während des Speicherns geändert.');
  error.code='STORAGE_CONFLICT';
  throw error;
 }
 // If there was no valid primary, the recovery copy may be the sole
 // surviving state. Recheck it before creating a new authoritative primary:
 // another tab could have repaired or replaced the backup during validation.
 if(!last&&storage.getItem(BACKUP_KEY)!==observedBackupRaw){
  const error=new Error('Wiederherstellungskopie wurde während des Speicherns geändert.');
  error.code='STORAGE_CONFLICT';
  throw error;
 }
 // Save the active version first: a failed primary write never changes backup.
 // Separate localStorage keys are not an atomic transaction.
 storage.setItem(PRIMARY_KEY,nextRaw);
 // A storage adapter or a racing tab can acknowledge a write without retaining
 // the intended value. Do not advance the recovery copy unless it is readable
 // back byte-for-byte. A failed verification is never reported as a safe save.
 if(storage.getItem(PRIMARY_KEY)!==nextRaw){
  const error=new Error('Gespeicherter Browserstand konnte nicht bestätigt werden.');
  error.code='STORAGE_CONFLICT';
  throw error;
 }
 // A second tab can replace the just-verified primary before we touch the
 // optional backup. Never report a lost primary write as a successful save.
 function assertOwnPrimary(){
  if(storage.getItem(PRIMARY_KEY)!==nextRaw){
   const error=new Error('Browserstand wurde während der Sicherung von einem anderen Tab geändert.');
   error.code='STORAGE_CONFLICT';
   throw error;
  }
 }
 assertOwnPrimary();
 if(backupRaw!==null){
  try{
   if(backupReadError)throw backupReadError;
   // Do not overwrite another tab's newer recovery copy. This is a best-effort
   // revision guard; localStorage cannot atomically compare and write two keys.
   if(storage.getItem(BACKUP_KEY)!==observedBackupRaw){
    throw new Error('Zusätzliche Sicherung wurde zwischenzeitlich geändert.');
   }
   storage.setItem(BACKUP_KEY,backupRaw);
   if(storage.getItem(BACKUP_KEY)!==backupRaw){
    throw new Error('Zusätzliche Sicherung konnte nicht bestätigt werden.');
   }
  }catch(error){
   // The confirmed primary remains authoritative. An optional-backup warning
   // must not turn an already committed primary into a destructive retry.
   try{if(typeof onBackupFailure==='function')onBackupFailure(error);}catch{}
  }
 }
 // Catch primary replacements during the optional backup write as well.
 assertOwnPrimary();
 return clean;
}

// A resumed tab must not trust an old in-memory revision. A failed read or
// an unknown startup revision is never evidence that overwriting is safe.
export function inspectPrimaryRevision(storage,expectedRaw){
 if(!storage)return 'unavailable';
 let current;
 try{current=storage.getItem(PRIMARY_KEY);}
 catch{return 'unavailable';}
 if(expectedRaw===undefined)return 'unverified';
 return current===expectedRaw?'unchanged':'changed';
}

// A storage.clear() event has key=null and newValue=null. It must invalidate
// a tab even when that tab originally observed an empty primary key.
// Healthy primaries do not need their optional backup to be readable.
export function inspectBackupRevision(storage,expectedRaw){
 if(!storage)return 'unavailable';
 let current;
 try{current=storage.getItem(BACKUP_KEY);}
 catch{return 'unavailable';}
 if(expectedRaw===undefined)return 'unverified';
 return current===expectedRaw?'unchanged':'changed';
}
export function storageEventConflicts(key,newValue,expectedRaw,expectedRecoveredBackupRaw=undefined){
 return key===null||(key===PRIMARY_KEY&&newValue!==expectedRaw)||
  (expectedRecoveredBackupRaw!==undefined&&key===BACKUP_KEY&&newValue!==expectedRecoveredBackupRaw);
}
