import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectStorage} from '../storage.mjs';
test('empty storage starts',()=>assert.equal(inspectStorage(null).state,'unavailable'));
