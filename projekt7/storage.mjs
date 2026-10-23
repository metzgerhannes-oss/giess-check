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
export function saveProject(storage,project,override=false,expectedPrimaryRaw=undefined){
 const clean=validateProject(project);
 const current=storage.getItem(PRIMARY_KEY);
 // Best-effort optimistic precondition: localStorage has no atomic compare-and-swap.
 if(expectedPrimaryRaw!==undefined&&current!==expectedPrimaryRaw){
  const error=new Error('Der Browserstand wurde in einem anderen Tab geändert.');
  error.code='STORAGE_CONFLICT';
  throw error;
 }
 if(current!==null){
  try{
   const last=decode(current);
   storage.setItem(BACKUP_KEY,JSON.stringify(last));
  }catch(error){
   if(!override)throw new Error('Lokale Sicherung ist beschädigt.');
  }
 }else if(storage.getItem(BACKUP_KEY)===null){
  storage.setItem(BACKUP_KEY,JSON.stringify(clean));
 }
 storage.setItem(PRIMARY_KEY,JSON.stringify(clean));
 return clean;
}
