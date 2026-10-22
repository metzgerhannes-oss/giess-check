import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectStorage} from '../storage.mjs';

test('invalid browser storage is detected without replacing it',()=>{
 const store={getItem:()=>'{invalid'};
 assert.equal(inspectStorage(store).state,'damaged');
});
