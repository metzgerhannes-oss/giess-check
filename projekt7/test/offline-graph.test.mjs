import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {auditOfflineGraph} from './offline-graph.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('all HTML, manifest, CSS and module dependencies are cached',()=>{
 assert.deepEqual(auditOfflineGraph(root),[]);
});
test('new valid module omitted from precache fails',()=>{
 const errors=auditOfflineGraph(root,{'app.mjs':source('app.mjs')+"\nimport './future-helper.mjs';\n",'future-helper.mjs':'export const safe=true;\n'});
 assert.ok(errors.some(e=>e.includes('Offline dependency not precached: future-helper.mjs')),errors.join('\n'));
});
test('missing imported module fails before deployment',()=>{
 const errors=auditOfflineGraph(root,{'app.mjs':source('app.mjs')+"\nimport './missing-helper.mjs';\n"});
 assert.ok(errors.some(e=>e.includes('Missing local asset')),errors.join('\n'));
});
test('external and dynamic module imports fail closed',()=>{
 const errors=auditOfflineGraph(root,{'core.mjs':source('core.mjs')+"\nimport 'https://cdn.example.test/module.mjs';\n",'app.mjs':source('app.mjs')+"\nconst injected=import('./later.mjs');\n"});
 assert.ok(errors.some(e=>e.includes('Nonlocal asset reference')),errors.join('\n'));
 assert.ok(errors.some(e=>e.includes('Dynamic import')),errors.join('\n'));
});
test('new HTML stylesheet missing from cache is detected',()=>{
 const errors=auditOfflineGraph(root,{'index.html':source('index.html').replace('</head>','<link rel="stylesheet" href="./extra.css"></head>'),'extra.css':'body{color:black}'});
 assert.ok(errors.some(e=>e.includes('Offline dependency not precached: extra.css')),errors.join('\n'));
});
test('precache missing files and omissions fail',()=>{
 const errors=auditOfflineGraph(root,{'sw.js':source('sw.js').replace("'./manifest.webmanifest'","'./missing.webmanifest'")});
 assert.ok(errors.some(e=>e.includes('Precache references missing asset')),errors.join('\n'));
 assert.ok(errors.some(e=>e.includes('Offline dependency not precached: manifest.webmanifest')),errors.join('\n'));
});
