import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { originalPlaceIds, isOriginalStudy, shouldStoreStudy, planLibraryCleanup } from '../src/library-policy.js';
import { createSaveQueue } from '../src/persistence.js';

const project=(id,extra={})=>({id,images:[{name:'roof.jpg'},null],...extra});
test('the protected place list matches all eleven original supplied places',()=>{
 const manifest=JSON.parse(fs.readFileSync(new URL('../public/demo/manifest.json',import.meta.url)));
 assert.deepEqual(originalPlaceIds,[...manifest.pairs.map(p=>p.id)]);
 for(const id of originalPlaceIds)assert.equal(isOriginalStudy({id:`dataset-${id}`}),true);
 assert.equal(isOriginalStudy({datasetId:'haeco'}),true);
 assert.equal(isOriginalStudy({datasetId:'haeco-example'}),false);
});
test('trials, imports and unchosen legacy uploads do not enter saved storage',()=>{
 assert.equal(shouldStoreStudy(project('new')),false);
 assert.equal(shouldStoreStudy(project('trial',{saveMode:'trial'})),false);
 assert.equal(shouldStoreStudy(project('chosen',{saveMode:'saved'})),true);
 assert.equal(shouldStoreStudy(project('dataset-haeco')),true);
});
test('cleanup removes old additions while preserving original reviews and explicit saves',()=>{
 const original=project('dataset-haeco',{note:'Keep these reviews'}),old=project('old-upload'),saved=project('chosen',{saveMode:'saved'});
 const result=planLibraryCleanup([original,old,saved],old);
 assert.deepEqual(result.kept,[original,saved]);assert.deepEqual(result.removed,[old]);assert.equal(result.current,null);
 assert.equal(original.note,'Keep these reviews');
 const next=planLibraryCleanup(result.kept,saved);
 assert.deepEqual(next.removed,[]);assert.equal(next.current,saved);
});
test('cleanup includes an unsaved old current record and keeps its newest review snapshot',()=>{
 const old=project('old',{updatedAt:'2026-11-03T01:00:00Z'}),current={...old,updatedAt:'2026-11-04T01:00:00Z',count:17};
 assert.deepEqual(planLibraryCleanup([old],current).removed,[current]);
 assert.deepEqual(planLibraryCleanup([],current).removed,[current]);
});
test('removed writes cannot be resurrected by retrying another failed study save',async()=>{
 let fail=true;const writes=[];
 const queue=createSaveQueue(async(current,records)=>{if(fail)throw new Error('quota');writes.push({current,records});});
 await queue.enqueue(project('keep',{saveMode:'saved'}));
 await queue.enqueue(project('remove',{saveMode:'saved'}));
 queue.discard(['remove']);fail=false;await queue.retry();
 assert.equal(writes[0].current,null);assert.deepEqual(writes[0].records.map(p=>p.id),['keep']);assert.equal(queue.pending,0);
});
