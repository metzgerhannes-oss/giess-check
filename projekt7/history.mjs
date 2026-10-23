import {validateProject} from './core.mjs';
export function createHistory(initial,limit=40){
 const cap=Math.max(2,Math.min(100,Math.floor(Number(limit)||40)));
 let current=JSON.stringify(validateProject(initial));
 const past=[],future=[];
 const copy=()=>JSON.parse(current);
 return {
  push(value){
   const next=JSON.stringify(validateProject(value));
   if(next===current)return false;
   past.push(current);if(past.length>cap)past.shift();
   current=next;future.length=0;return true;
  },
  undo(){if(!past.length)return null;future.push(current);current=past.pop();return copy();},
  redo(){if(!future.length)return null;past.push(current);current=future.pop();return copy();},
  canUndo:()=>past.length>0,canRedo:()=>future.length>0
 };
}
