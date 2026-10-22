import {starterProject,validateProject} from './core.mjs';
export const PRIMARY_KEY='klarpunkt.project.v1';
export const BACKUP_KEY='klarpunkt.project.backup.v1';
export function inspectStorage(storage){
 if(!storage)return {state:'unavailable',project:starterProject()};
 try{
  const raw=storage.getItem(PRIMARY_KEY);
  if(raw===null)return {state:'new',project:starterProject()};
  try{return {state:'ok',project:validateProject(JSON.parse(raw))};}
  catch{return {state:'damaged',project:starterProject(),damagedRaw:raw};}
 }catch{return {state:'unavailable',project:starterProject()};}
}
