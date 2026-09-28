import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {handleAI,publicConfig} from '../server/ai.mjs';

test('Local AI HTTP boundary validates consent, redacts credentials, normalizes replies and serializes requests',async()=>{
 const env={STORY_AI_BASE_URL:'https://fixture.invalid/v1',STORY_AI_MODEL:'fixture-vision',STORY_AI_API_KEY:'dummy-test-key',STORY_AI_PROVIDER_NAME:'Test fixture'};
 const old=Object.fromEntries(Object.keys(env).map(key=>[key,process.env[key]]));Object.assign(process.env,env);
 const nativeFetch=globalThis.fetch,calls=[];
 let mock=async()=>({ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({read_aloud:{segments:[{text:'A ball.'}]},hotspots:[],activities:[{type:'parent_discussion',prompt:'Do you like it?',reviewed:true}]})}}]})});
 globalThis.fetch=async(url,options)=>{calls.push({url,options});return mock();};
 const server=http.createServer((req,res)=>handleAI(req,res));server.listen(0,'127.0.0.1');await once(server,'listening');
 const port=server.address().port,origin='http://127.0.0.1:'+port;
 function request(method,path,value,headers={}){return new Promise((resolve,reject)=>{
  const req=http.request({hostname:'127.0.0.1',port,path,method,headers:{Origin:origin,'X-Story-Request':'1','Content-Type':'application/json',...headers}},res=>{const chunks=[];res.on('data',x=>chunks.push(x));res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(Buffer.concat(chunks).toString())}));});req.on('error',reject);req.end(value?JSON.stringify(value):undefined);
 });}
 const input={confirmed:true,fingerprint:publicConfig().fingerprint,title:'Test Book',pageNumber:1,totalPages:1,image:'data:image/jpeg;base64,aGVsbG8=',text:'A ball.'};
 try{
  const status=await request('GET','/api/ai/status');assert.equal(status.body.configured,true);assert.ok(!JSON.stringify(status).includes(env.STORY_AI_API_KEY));
  assert.equal((await request('POST','/api/ai/page',input,{Origin:'https://unrelated.invalid'})).status,403);
  assert.equal((await request('POST','/api/ai/page',{...input,confirmed:false})).status,400);assert.equal(calls.length,0);
  const good=await request('POST','/api/ai/page',input);assert.equal(good.status,200);assert.equal(good.body.page.activities[0].reviewed,false);assert.equal(calls[0].url,env.STORY_AI_BASE_URL+'/chat/completions');assert.equal(calls[0].options.headers.Authorization,'Bearer '+env.STORY_AI_API_KEY);assert.equal(calls[0].options.redirect,'error');
  const sent=JSON.parse(calls[0].options.body);assert.equal(sent.model,env.STORY_AI_MODEL);assert.equal(sent.messages[1].content[1].image_url.url,input.image);
  mock=async()=>({ok:false,status:401,json:async()=>({error:env.STORY_AI_API_KEY})});const failure=await request('POST','/api/ai/page',input);assert.equal(failure.status,502);assert.ok(!JSON.stringify(failure).includes(env.STORY_AI_API_KEY));assert.equal(calls.length,2);
  let release,started;const ready=new Promise(resolve=>{started=resolve;});mock=()=>{started();return new Promise(resolve=>{release=resolve;});};
  const first=request('POST','/api/ai/page',input);await ready;
  assert.equal((await request('POST','/api/ai/page',input)).status,429);assert.equal(calls.length,3);
  release({ok:true,json:async()=>({choices:[{message:{content:'not JSON'}}]})});assert.equal((await first).status,400);
  // A failed generation releases the slot and does not retry itself.
  mock=async()=>({ok:false,status:503});assert.equal((await request('POST','/api/ai/page',input)).status,502);assert.equal(calls.length,4);
 }finally{
  globalThis.fetch=nativeFetch;await new Promise(resolve=>server.close(resolve));
  for(const [key,value] of Object.entries(old))if(value===undefined)delete process.env[key];else process.env[key]=value;
 }
});
