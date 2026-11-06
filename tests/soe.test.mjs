import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {createRequire} from 'node:module';
import {EventEmitter} from 'node:events';
const require=createRequire(import.meta.url);
const {signedUrl,evaluate}=require('../cloudfunctions/pronunciation/soe.js');

test('SOE URL signs the raw sorted parameters without exposing the key',()=>{
 const url=signedUrl({appid:'123',secretId:'AKIDexample',secretKey:'secret',text:'Can you see me?',now:1000,nonce:42,voiceId:'voice-1'});
 const parsed=new URL(url),params=[...parsed.searchParams.entries()].filter(([key])=>key!=='signature').sort(([a],[b])=>a.localeCompare(b,'en'));
 const raw=parsed.host+parsed.pathname+'?'+params.map(([key,value])=>key+'='+value).join('&');
 assert.equal(parsed.searchParams.get('signature'),createHmac('sha1','secret').update(raw).digest('base64'));
 assert.equal(parsed.searchParams.get('ref_text'),'Can you see me?');
 assert.equal(parsed.searchParams.get('rec_mode'),'1');
 assert.ok(!url.includes('secret&'));
});

test('SOE waits for handshake and final result before returning assessment',async()=>{
 class FakeSocket extends EventEmitter{
  static OPEN=1;static CONNECTING=0;
  constructor(){super();this.readyState=1;this.sent=[];queueMicrotask(()=>this.emit('message',Buffer.from('{"code":0,"message":"success"}')));}
  send(value){this.sent.push(value);if(this.sent.length===2)queueMicrotask(()=>{
   this.emit('message',Buffer.from(JSON.stringify({code:0,result:{SuggestedScore:89,PronAccuracy:88,PronFluency:.8,PronCompletion:1}})));
   this.emit('message',Buffer.from('{"code":0,"final":1}'));
  });}
  close(){this.readyState=3;}
 }
 const wav=Buffer.from('RIFFtest');
 const result=await evaluate(wav,'Can you see me?',{appid:'123',secretId:'AKIDexample',secretKey:'secret'},FakeSocket);
 assert.equal(result.score,89);assert.equal(result.completion,1);
});
