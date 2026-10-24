import {starterProject,validateProject} from './core.mjs';
export const PRIMARY_KEY='klarpunkt.project.v1';
export const BACKUP_KEY='klarpunkt.project.backup.v1';
function decode(raw){
 return raw===null?null:validateProject(JSON.parse(raw));
}
export function inspectStorage(storage){
 if(!storage)return {state:'unavailable',project:starterProject(),primaryRaw:undefined};
 try{
  const primary=storage.getItem(PRIMARY_KEY);
  const backup=storage.getItem(BACKUP_KEY);
  if(primary===null&&backup===null)return {state:'new',project:starterProject(),primaryRaw:primary};
  try{
   const value=decode(primary);
   if(value)return {state:'ok',project:value,primaryRaw:primary};
  }catch{}
  try{
   const value=decode(backup);
   if(value)return {state:'recovered',project:value,primaryRaw:primary};
  }catch{}
  return {state:'damaged',project:starterProject(),primaryRaw:primary};
 }catch{return {state:'unavailable',project:starterProject(),primaryRaw:undefined};}
}
export function saveProject(storage,project,override=false,expectedPrimaryRaw=undefined,onBackupFailure=null){
 const clean=validateProject(project);
 const current=storage.getItem(PRIMARY_KEY);
 // Best-effort optimistic precondition: localStorage has no atomic compare-and-swap.
 if(expectedPrimaryRaw!==undefined&&current!==expectedPrimaryRaw){
  const error=new Error('Der Browserstand wurde in einem anderen Tab geändert.');
  error.code='STORAGE_CONFLICT';
  throw error;
 }
 const previousBackup=storage.getItem(BACKUP_KEY);
 let last=null;
 if(current!==null){
  try{last=decode(current);}
  catch{
   if(!override)throw new Error('Lokale Sicherung ist beschädigt.');
  }
 }
 const nextRaw=JSON.stringify(clean);
 // Save the active version first: a failed primary write never changes backup.
 // Separate localStorage keys are not an atomic transaction.
 storage.setItem(PRIMARY_KEY,nextRaw);
 const backupRaw=last?JSON.stringify(last):(current===null&&previousBackup===null?nextRaw:null);
 if(backupRaw!==null){
  try{storage.setItem(BACKUP_KEY,backupRaw);}
  catch(error){
   // Active data is saved; the previous backup is unchanged.
   if(typeof onBackupFailure==='function')onBackupFailure(error);
  }
 }
 return clean;
}
