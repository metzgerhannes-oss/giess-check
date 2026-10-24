import test from 'node:test';
import assert from 'node:assert/strict';
import {createUnsavedGuard} from '../unsaved.mjs';
function fakeWindow(){
 const handlers=new Map();
 return {handlers,addEventListener:(name,fn)=>handlers.set(name,fn),removeEventListener:(name,fn)=>{if(handlers.get(name)===fn)handlers.delete(name);}};
}
function fire(target){
 const event={defaultPrevented:false,returnValue:undefined,preventDefault(){this.defaultPrevented=true;}};
 target.handlers.get('beforeunload')?.(event);
 return event;
}
test('guard does not interrupt clean navigation',()=>{
 const target=fakeWindow(),guard=createUnsavedGuard(target);
 assert.equal(guard.isDirty(),false);
 assert.equal(fire(target).defaultPrevented,false);
 guard.dispose();
 assert.equal(target.handlers.has('beforeunload'),false);
});
test('failed persistence marks edits and warns on navigation',()=>{
 const target=fakeWindow(),guard=createUnsavedGuard(target);
 guard.setDirty(true);
 assert.equal(guard.isDirty(),true);
 const event=fire(target);
 assert.equal(event.defaultPrevented,true);
 assert.equal(event.returnValue,'');
});
test('successful save or explicit reload clears warning',()=>{
 const target=fakeWindow(),guard=createUnsavedGuard(target);
 guard.setDirty(true);guard.setDirty(false);
 assert.equal(guard.isDirty(),false);
 assert.equal(fire(target).defaultPrevented,false);
});
