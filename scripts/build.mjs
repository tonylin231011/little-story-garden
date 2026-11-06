import {mkdir,cp,copyFile,readdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';

await mkdir('dist',{recursive:true});
await cp('public','dist',{recursive:true});
await cp('src','dist/src',{recursive:true});
await copyFile('index.html','dist/index.html');
const html=await readFile('dist/index.html','utf8');
await writeFile('dist/index.html',html.replace('<title>','<meta name="story-static" content="1"><title>'));
await writeFile('dist/.nojekyll','');

async function files(directory,relative=''){
 const result=[];
 for(const item of await readdir(directory,{withFileTypes:true})){
  const name=path.posix.join(relative,item.name);
  if(item.isDirectory())result.push(...await files(path.join(directory,item.name),name));
  else if(item.isFile()&&name!=='sw.js'&&!name.startsWith('.'))result.push(name);
 }
 return result;
}
const assets=(await files('dist')).sort();
const digest=createHash('sha256');
for(const asset of assets){digest.update(asset);digest.update(await readFile(path.join('dist',asset)));}
const cache='story-garden-'+digest.digest('hex').slice(0,16);
const worker=`const CACHE=${JSON.stringify(cache)};
const ASSETS=${JSON.stringify(assets)};
self.addEventListener('install',event=>event.waitUntil((async()=>{
 await caches.delete(CACHE);
 const cache=await caches.open(CACHE);
 for(let index=0;index<ASSETS.length;index+=20){
  const batch=ASSETS.slice(index,index+20).map(asset=>new URL(asset,self.registration.scope).href);
  await cache.addAll(batch);
 }
 await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 for(const key of await caches.keys())if(key.startsWith('story-garden-')&&key!==CACHE)await caches.delete(key);
 await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==self.location.origin||!url.href.startsWith(self.registration.scope)||url.pathname.includes('/api/'))return;
 event.respondWith((async()=>{
  const cached=await caches.match(request,{ignoreSearch:true});
  if(!cached){
   if(request.mode==='navigate')return await caches.match(new URL('index.html',self.registration.scope))||fetch(request);
   return fetch(request);
  }
  const range=request.headers.get('range');
  if(!range)return cached;
  const match=/^bytes=(\\d+)-(\\d*)$/.exec(range);
  if(!match)return cached;
  const bytes=await cached.arrayBuffer(),start=Number(match[1]),end=match[2]?Math.min(Number(match[2]),bytes.byteLength-1):bytes.byteLength-1;
  if(start>end||start>=bytes.byteLength)return new Response(null,{status:416,headers:{'Content-Range':'bytes */'+bytes.byteLength}});
  const headers=new Headers(cached.headers);
  headers.set('Content-Range','bytes '+start+'-'+end+'/'+bytes.byteLength);
  headers.set('Content-Length',String(end-start+1));
  headers.set('Accept-Ranges','bytes');
  return new Response(bytes.slice(start,end+1),{status:206,headers});
 })());
});`;
await writeFile('dist/sw.js',worker);
console.log(`Static offline site ready: dist (${assets.length} cached files).`);
