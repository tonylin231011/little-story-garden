import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pcmWav} from '../src/wav.js';
import {recordResult,dueResults,latestResults} from '../src/learning.js';
async function sample(){
 const manifest=JSON.parse(await readFile(new URL('../public/audio/manifest.json',import.meta.url),'utf8'));
 const bytes=await readFile(new URL('../public'+manifest['narrator|Hide and Seek.'].replace('.mp3','.wav'),import.meta.url));
 return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
}
test('PCM decodes without browser codec and contains speech',async()=>{
 const decoded=pcmWav(await sample());
 assert.equal(decoded.sampleRate,24000);assert.equal(decoded.channels.length,1);
 assert.ok(decoded.length>2400);assert.ok(decoded.channels[0].some(x=>Math.abs(x)>.01));
});
test('PCM rejects corrupt headers, truncation, unsupported formats',async()=>{
 assert.throws(()=>pcmWav(new ArrayBuffer(44)));
 const data=await sample();assert.throws(()=>pcmWav(data.slice(0,50)));
 const broken=data.slice(0);new DataView(broken).setUint16(20,3,true);assert.throws(()=>pcmWav(broken));
});
const at=new Date(2026,8,25,12).getTime(),q={id:'q1',pageId:'page_01',prompt:'Find it',type:'point_and_find',at};
test('Independent answers recur after 1, 3, then 7 local calendar days',()=>{
 let history=[],time=at;for(const [round,days] of [[1,1],[2,3],[3,7]]){
  history=recordResult(history,{...q,at:time});const last=history.at(-1);assert.equal(last.streak,round);
  const expected=new Date(time);expected.setDate(expected.getDate()+days);expected.setHours(0,0,0,0);
  assert.equal(last.dueAt,expected.getTime());assert.equal(dueResults(history,time).length,0);
  assert.equal(dueResults(history,last.dueAt).length,1);
  const early=recordResult(history,{...q,at:time+1000}).at(-1);assert.equal(early.streak,round);assert.equal(early.dueAt,last.dueAt);
  time=last.dueAt+3600000;
 }
});
test('Assisted, retried and participatory outcomes stay distinct',()=>{
 const helped=recordResult([],{...q,attempts:2});assert.equal(helped[0].result,'together');assert.equal(dueResults(helped,at).length,1);
 const retried=recordResult([],{...q,attempts:1});assert.equal(retried[0].result,'retried');assert.equal(dueResults(retried,at).length,0);
 const talk=recordResult([],{...q,type:'listen_and_repeat'});assert.equal(talk[0].result,'participated');assert.equal(dueResults(talk,at).length,0);
});
test('Wrong answers enter review; success replaces pending result',()=>{
 let history=recordResult([],{...q,failed:true});assert.equal(dueResults(history,at).length,1);
 history=recordResult(history,{...q,at:at+1000});
 assert.equal(latestResults(history).length,1);assert.equal(dueResults(history,at+1000).length,0);
});

