import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {verifyPublishedAssets} from './live-verify.mjs';
const base=process.env.PAGES_URL||'https://metzgerhannes-oss.github.io/giess-check/projekt7/';
const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
for(let i=1;i<=7;i++){
 try{
  const checked=await verifyPublishedAssets(base,root);
  console.log('Verified deployed HTTPS assets against checked-out commit:',checked.length);
  process.exit(0);
 }catch(error){
  console.error('HTTPS verification '+i+'/7: '+error.message);
  if(i===7)process.exitCode=1;
  else await new Promise(resolve=>setTimeout(resolve,20000));
 }
}
