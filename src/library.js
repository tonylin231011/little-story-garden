export const BUILTIN_ID='ort_hide_and_seek_l1plus_v1';
export const LIBRARY_KEY='story-garden-library';
export const MAX_PAGES=40;
export function storageFor(id){return id===BUILTIN_ID?'hide-and-seek-v1':'story-garden-'+id;}
function openDB(){return new Promise((resolve,reject)=>{const req=indexedDB.open(LIBRARY_KEY,1);req.onupgradeneeded=()=>{req.result.createObjectStore('episodes',{keyPath:'id'});req.result.createObjectStore('assets');};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
async function transact(stores,mode,run){
 const db=await openDB();try{return await new Promise((resolve,reject)=>{const tx=db.transaction(stores,mode);let output;try{output=run(tx);}catch(error){tx.abort();reject(error);return;}tx.oncomplete=()=>resolve(typeof output==='function'?output():output);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('本机保存中断'));});}finally{db.close();}
}
export function listEpisodes(){return transact(['episodes'],'readonly',tx=>{const req=tx.objectStore('episodes').getAll();return ()=>req.result.sort((a,b)=>b.updatedAt-a.updatedAt);});}
export function getEpisode(id){return transact(['episodes'],'readonly',tx=>{const req=tx.objectStore('episodes').get(id);return ()=>req.result;});}
export function assetBlob(key){return transact(['assets'],'readonly',tx=>{const req=tx.objectStore('assets').get(key);return ()=>req.result;});}
export function saveEpisode(record,assets=[]){return transact(['episodes','assets'],'readwrite',tx=>{tx.objectStore('episodes').put({...record,updatedAt:Date.now()});for(const asset of assets)tx.objectStore('assets').put(asset.blob,asset.key);});}
export function splitText(text){return String(text||'').replace(/\r/g,'').split(/(?<=[.!?])\s+|\n+/).map(t=>t.trim()).filter(Boolean).map(text=>({voice:'narrator',text}));}
export function makeDraft(title,inputs,id=crypto.randomUUID()){
 if(!title.trim())throw Error('请给这一集取个名字。');
 if(!inputs.length||inputs.length>MAX_PAGES)throw Error('每集需要 1–'+MAX_PAGES+' 页。');
 const images={},assets=[];
 const pages=inputs.map((input,index)=>{
  const pageId='page_'+String(index+1).padStart(3,'0'),imageId='image_'+pageId,key='local:'+id+':'+(input.id||crypto.randomUUID());
  images[imageId]={asset_id:imageId,source:key};assets.push({key,blob:input.blob});
  const segments=splitText(input.text);
  return {page_id:pageId,image_asset:imageId,read_aloud:{segments,silent:false},hotspots:[],activities:segments.length?[{activity_id:pageId+'_repeat',category:'story',type:'listen_and_repeat',prompt:segments[0].text,tts:segments[0].text,enabled:true,reviewed:false,parent_note:'先听一句，再试着说。不评分，愿意说一个词也很好。',feedback:{complete:'Well done!'}}]:[],parent_guide:'先看图，再读一句；给孩子一点观察和回应的时间。'};
 });
 const lesson={schema_version:'2.0.0',lesson_id:id,book:{title:title.trim(),language:'en',content_source:'family_import'},assets:{images},pages,review:[{activity_id:'review_talk',type:'parent_discussion',category:'story',prompt:'Which page do you like?',tts:'Which page do you like?',enabled:true,reviewed:false,parent_note:'用中文说也可以。',feedback:{complete:'Well done!'}}]};
 return {record:{id,title:title.trim(),status:'draft',lesson,createdAt:Date.now(),updatedAt:Date.now()},assets};
}
export async function resolveImages(lesson){
 const entries=await Promise.all(Object.values(lesson.assets.images).map(async asset=>{
  if(!asset.source.startsWith('local:'))return [asset.source,asset.source];
  const blob=await assetBlob(asset.source);if(!blob)throw Error('这一集的图片缺失，请从原始 PDF 或截图重新制作；Lesson JSON 不包含图片。');
  return [asset.source,URL.createObjectURL(blob)];
 }));
 return new Map(entries);
}
export function revokeImages(map){for(const url of map.values())if(url.startsWith('blob:'))URL.revokeObjectURL(url);}
export function publicationProblems(lesson){
 const issues=[];
 for(const [i,page] of lesson.pages.entries())if(!page.read_aloud?.segments?.length&&!page.read_aloud?.silent)issues.push('第 '+(i+1)+' 页：填写正文，或确认这一页没有正文。');
 return issues;
}

