// Dependency-free offline graph audit: imported assets must be cached.
import {existsSync,readFileSync} from 'node:fs';
import {dirname,relative,resolve,sep} from 'node:path';
export function auditOfflineGraph(root,overrides={}){
 const base=resolve(root),errors=[],required=new Set(['index.html']),modules=[],visited=new Set();
 const has=path=>Object.hasOwn(overrides,path)||existsSync(resolve(base,path));
 const read=path=>Object.hasOwn(overrides,path)?overrides[path]:readFileSync(resolve(base,path),'utf8');
 function reference(spec,source){
  if(typeof spec!=='string'||(!spec.startsWith('./')&&!spec.startsWith('../'))){
   errors.push('Nonlocal asset reference in '+source+': '+String(spec));return null;
  }
  if(/[?#]/.test(spec)){errors.push('URL variant in '+source+': '+spec);return null;}
  const dest=resolve(base,dirname(source),spec);
  if(dest!==base&&!dest.startsWith(base+sep)){errors.push('Asset escapes project root: '+spec);return null;}
  const path=relative(base,dest).split(sep).join('/');
  if(!path||!has(path)){errors.push('Missing local asset from '+source+': '+spec);return null;}
  required.add(path);
  if(/\.m?js$/.test(path))modules.push(path);
  return path;
 }
 const html=read('index.html');
 for(const match of html.matchAll(/\b(?:src|href)=["']([^"']+)["']/g)){
  if(!match[1].startsWith('#'))reference(match[1],'index.html');
 }
 const manifest=JSON.parse(read('manifest.webmanifest'));
 reference(manifest.start_url,'manifest.webmanifest');
 for(const icon of manifest.icons||[])reference(icon.src,'manifest.webmanifest');
 const cssQueue=[...required].filter(path=>path.endsWith('.css')),checkedCss=new Set();
 while(cssQueue.length){
  const path=cssQueue.shift();
  if(checkedCss.has(path))continue;
  checkedCss.add(path);
  const css=read(path);
  for(const match of css.matchAll(/\burl\(\s*["']?([^"')\s]+)["']?\s*\)/g)){
   const dest=reference(match[1],path);if(dest?.endsWith('.css'))cssQueue.push(dest);
  }
  for(const match of css.matchAll(/@import\s+["']([^"']+)["']/g)){
   const dest=reference(match[1],path);if(dest?.endsWith('.css'))cssQueue.push(dest);
  }
 }
 const imports=/(?:^|\n)\s*(?:import|export)\s+(?:[^'";]*?\s+from\s*)?(["'])([^"']+)\1/g;
 while(modules.length){
  const path=modules.shift();if(visited.has(path))continue;
  visited.add(path);
  const js=read(path);
  if(/\bimport\s*\(/.test(js))errors.push('Dynamic import cannot be precached safely: '+path);
  for(const match of js.matchAll(imports))reference(match[2],path);
 }
 const sw=read('sw.js');
 if(/\bimportScripts\s*\(/.test(sw))errors.push('Untracked service worker importScripts');
 const list=sw.match(/\bconst FILES\s*=\s*(\[[\s\S]*?\])\s*;/);
 if(!list){errors.push('Missing literal service-worker FILES list');return errors;}
 let files;
 try{files=JSON.parse(list[1].replace(/'/g,'"'));}
 catch{errors.push('Service-worker FILES list must contain literal paths');return errors;}
 if(!Array.isArray(files)||files.some(path=>typeof path!=='string')){
  errors.push('Invalid service-worker FILES list');return errors;
 }
 const cached=new Set();
 for(const entry of files){
  if(entry==='./')continue; // Root and index.html intentionally share a document.
  if(!entry.startsWith('./')||/[?#]/.test(entry)){errors.push('Unsafe precache entry: '+entry);continue;}
  const path=entry.slice(2);
  if(cached.has(path))errors.push('Duplicate precache entry: '+entry);
  cached.add(path);
  if(!has(path))errors.push('Precache references missing asset: '+entry);
 }
 for(const path of required)if(!cached.has(path))errors.push('Offline dependency not precached: '+path);
 return errors;
}
