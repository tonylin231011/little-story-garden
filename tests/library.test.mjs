import test from 'node:test';
import assert from 'node:assert/strict';
import {makeDraft,publicationProblems,storageFor,BUILTIN_ID} from '../src/library.js';
import {validateLesson,normalizeProgress} from '../src/core.js';
import {config,publicConfig,validateInput,normalizePage} from '../server/ai.mjs';
const input={id:'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',blob:new Blob(['image']),text:'A blue ball. A red box.'};
test('New books allow different page counts and keep independent storage',()=>{
 for(const count of [1,2,8,40]){const {record}=makeDraft('New Story',Array.from({length:count},(_,i)=>({...input,id:crypto.randomUUID()})));assert.deepEqual(validateLesson(record.lesson),[]);assert.equal(normalizeProgress({page:99},record.lesson).page,count-1);assert.notEqual(storageFor(record.id),storageFor(BUILTIN_ID));}
 assert.throws(()=>makeDraft('x',Array(41).fill(input)));
});
test('Textless imported pages remain drafts until explicitly marked silent',()=>{
 const {record}=makeDraft('Silent Story',[{...input,text:''}]);assert.deepEqual(validateLesson(record.lesson,{draft:true}),[]);assert.ok(publicationProblems(record.lesson).length);record.lesson.pages[0].read_aloud.silent=true;assert.deepEqual(validateLesson(record.lesson),[]);assert.deepEqual(publicationProblems(record.lesson),[]);
});
test('Generated template questions are never pre-approved',()=>{
 const {record}=makeDraft('Story',[input]);assert.ok(record.lesson.pages[0].activities.every(a=>a.reviewed===false));assert.ok(record.lesson.review.every(a=>a.reviewed===false));
 record.lesson.assets.images.image_page_001.source='https://remote.invalid/private.png';assert.ok(validateLesson(record.lesson).length);
});
const env={STORY_AI_BASE_URL:'https://vision.example/v1',STORY_AI_MODEL:'vision-model',STORY_AI_API_KEY:'test-only-private-value'};
test('Provider is optional and public status never exposes credentials',()=>{
 assert.equal(config({}).configured,false);const status=publicConfig(env);assert.equal(status.configured,true);assert.equal(status.key,undefined);assert.ok(!JSON.stringify(status).includes(env.STORY_AI_API_KEY));assert.equal(config({...env,STORY_AI_BASE_URL:'http://vision.example/v1'}).configured,false);
});
test('AI request requires explicit confirmation of current service and selected image',()=>{
 const cfg=config(env),request={confirmed:true,fingerprint:cfg.fingerprint,title:'Book',text:'A ball.',pageNumber:1,totalPages:2,image:'data:image/jpeg;base64,aGVsbG8='};
 assert.doesNotThrow(()=>validateInput(request,cfg));assert.throws(()=>validateInput({...request,confirmed:false},cfg));assert.throws(()=>validateInput({...request,fingerprint:'old-service'},cfg));assert.throws(()=>validateInput({...request,image:'https://outside.invalid/image'},cfg));
});
test('AI result rejects fabricated geometry and invalid answer references; forces review',()=>{
 const page={read_aloud:{segments:[{text:'A ball.'}]},hotspots:[{id:'h1',label:'ball',bbox:[.1,.1,.2,.2]}],activities:[{type:'point_and_find',prompt:'Can you find the ball?',target_hotspots:['h1'],reviewed:true}],parent_guide:'先找一找。'};
 const result=normalizePage(page);assert.equal(result.activities[0].reviewed,false);
 assert.throws(()=>normalizePage({...page,hotspots:[{id:'h1',label:'ball',bbox:[.9,.1,.4,.2]}]}));
 assert.throws(()=>normalizePage({...page,activities:[{type:'multiple_choice',prompt:'What is it?',choices:[{id:'a',text:'Ball'},{id:'b',text:'Box'}],correct_answer:'c'}]}));
});

