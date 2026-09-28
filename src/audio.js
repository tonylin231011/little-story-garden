import {pcmWav} from './wav.js';
function database(){return new Promise((resolve,reject)=>{const r=indexedDB.open('hide-and-seek-audio',1);r.onupgradeneeded=()=>r.result.createObjectStore('originals');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
export async function originalAudio(key,blob){
 const db=await database();try{return await new Promise((resolve,reject)=>{
  const tx=db.transaction('originals',blob===undefined?'readonly':'readwrite'),store=tx.objectStore('originals');
  const req=blob===undefined?store.get(key):blob===null?store.delete(key):store.put(blob,key);
  tx.oncomplete=()=>resolve(req.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Audio storage aborted'));
 });}finally{db.close();}
}
const compatible=url=>typeof url==='string'&&url.startsWith('/audio/tencent/')?url.replace(/\.mp3$/,'.wav'):url;
export class AudioAdapter{
 constructor(manifest,onStatus){
  this.scope='';this.manifest=manifest;this.onStatus=onStatus;this.token=0;this.audio=null;this.context=null;this.source=null;this.cancel=null;this._slow=false;this.voiceName='';this.cache=new Map();this.status='';
  this.last={backend:'尚未播放',state:'idle',error:'',file:''};
 }
 statusText(text){this.status=text;this.onStatus(text);}
 get slow(){return this._slow;}
 set slow(value){this._slow=!!value;if(this.source)this.source.playbackRate.value=this.slow?.82:1;if(this.audio)this.audio.playbackRate=this.slow?.82:1;}
 // Resume synchronously on a gesture, before IndexedDB and network awaits.
 unlock(){
  try{
   const Context=globalThis.AudioContext||globalThis.webkitAudioContext;
   if(!Context)return Promise.resolve(false);
   if(!this.context||this.context.state==='closed')this.context=new Context();
   return this.context.resume().then(()=>this.context.state==='running',()=>false);
  }catch{return Promise.resolve(false);}
 }
 diagnostics(){return {...this.last,context:this.context?.state||'unavailable',voice:this.voiceName,version:'1.2.0',userAgent:globalThis.navigator?.userAgent||''};}
 stop(){
  this.token++;this.cancel?.();this.cancel=null;
  if(this.source){try{this.source.stop();}catch{}this.source.disconnect();this.source=null;}
  if(this.audio){this.audio.pause();this.audio.removeAttribute('src');this.audio.load();}
  this.last.state='stopped';this.statusText('');
 }
 setVoice(manifest,name){this.stop();this.manifest=manifest;this.voiceName=name;}
 async buffer(input){
  const url=compatible(input);
  if(typeof url==='string'&&this.cache.has(url))return this.cache.get(url);
  let bytes;
  if(input instanceof Blob)bytes=await input.arrayBuffer();
  else{
   let response=await fetch(url);
   if(!response.ok&&url!==input)response=await fetch(input);
   if(!response.ok)throw Error('音频文件读取失败（'+response.status+'）');
   bytes=await response.arrayBuffer();
  }
  let decoded;
  try{
   const pcm=pcmWav(bytes);decoded=this.context.createBuffer(pcm.channels.length,pcm.length,pcm.sampleRate);
   pcm.channels.forEach((samples,i)=>decoded.copyToChannel(samples,i));
  }catch{decoded=await this.context.decodeAudioData(bytes.slice(0));}
  if(typeof url==='string'){if(this.cache.size>=24)this.cache.delete(this.cache.keys().next().value);this.cache.set(url,decoded);}
  return decoded;
 }
 async webPlay(input,token){
  const buffer=await this.buffer(input);if(token!==this.token)return;
  if(this.context.state!=='running')throw new DOMException('请点一下开启声音','NotAllowedError');
  return new Promise((resolve,reject)=>{
   const source=this.context.createBufferSource();this.source=source;source.buffer=buffer;source.playbackRate.value=this.slow?.82:1;source.connect(this.context.destination);
   let settled=false;
   const finish=error=>{if(settled)return;settled=true;source.onended=null;this.context.removeEventListener('statechange',stateChanged);source.disconnect();if(this.source===source)this.source=null;this.cancel=null;error?reject(error):resolve();};
   const stateChanged=()=>{if(this.context.state!=='running'){try{source.stop();}catch{}finish(new DOMException('声音被系统暂停','NotAllowedError'));}};
   this.cancel=()=>{try{source.stop();}catch{}finish();};
   source.onended=()=>finish();this.context.addEventListener('statechange',stateChanged);
   this.last.backend='Web Audio · PCM';this.last.state='playing';
   try{source.start();}catch(error){finish(error);}
  });
 }
 async mediaPlay(input,token){
  if(token!==this.token)return;
  const blob=input instanceof Blob,src=blob?URL.createObjectURL(input):compatible(input);
  const audio=this.audio||(this.audio=new Audio());audio.preload='auto';audio.src=src;audio.playbackRate=this.slow?.82:1;
  this.last.backend='HTML Audio · WAV';
  try{
   await new Promise((resolve,reject)=>{
    let settled=false;
    const finish=error=>{if(settled)return;settled=true;audio.onended=null;audio.onerror=null;this.cancel=null;error?reject(error):resolve();};
    this.cancel=()=>{audio.pause();finish();};audio.onended=()=>finish();
    audio.onerror=()=>finish(Error('浏览器无法解码音频（'+(audio.error?.code||'unknown')+'）'));
    audio.play().then(()=>{if(token===this.token)this.last.state='playing';},finish);
   });
  }finally{if(blob)URL.revokeObjectURL(src);}
 }
 async play(items,{pageId,onComplete,urls:explicitUrls,label,localRecording=false}={}){
  this.stop();const token=this.token;const ready=this.unlock();this.last.error='';this.last.state='loading';
  const local=async key=>{try{return await originalAudio(this.scope+key);}catch{return undefined;}};
  let sources=[],generated=false;
  if(explicitUrls){sources=explicitUrls.map(source=>({source}));generated=!localRecording;}
  else{
   for(const item of items){
    const key=(item.voice||'narrator')+'|'+item.text,imported=await local('speech:'+key),bundled=this.manifest[key];
    sources.push({source:imported||bundled,fallback:imported&&bundled?[{source:bundled}]:null});
    if(!imported&&bundled)generated=true;
   }
   const original=pageId?await local(pageId):null;
   if(original){sources=[{source:original,fallback:sources}];generated=false;}
  }
  if(token!==this.token)return false;
  if(!sources.length||sources.some(s=>!s.source)){this.last.state='missing';this.statusText('这段文字还没有录音。家长可在家长区导入音频；修改过的问题需匹配新录音。');return false;}
  this.statusText(localRecording?'听听自己的声音':generated?'正在播放腾讯云 AI 合成语音 · '+(label||this.voiceName):'正在播放本机导入的音频');
  try{
   const unlocked=await ready;if(token!==this.token)return false;
   const playEntry=async entry=>{
    if(token!==this.token)return;
    this.last.file=typeof entry.source==='string'?compatible(entry.source):'本机录音';
    try{
     if(unlocked){
      try{await this.webPlay(entry.source,token);}
      catch(error){if(token!==this.token)return;if(error.name==='NotAllowedError')throw error;await this.mediaPlay(entry.source,token);}
     }else await this.mediaPlay(entry.source,token);
    }catch(error){
     if(token!==this.token)return;
     if(entry.fallback?.every(s=>s.source)&&error.name!=='NotAllowedError'){
      this.statusText('导入的录音无法播放，已改用内置语音。');for(const item of entry.fallback)await playEntry(item);
     }else throw error;
    }
   };
   for(const source of sources)await playEntry(source);
   if(token!==this.token)return false;
   this.last.state='ended';this.statusText('');onComplete?.();return true;
  }catch(error){
   if(token!==this.token)return false;
   this.stop();this.last.state='error';this.last.error=error.name+': '+error.message;
   this.statusText(error.name==='NotAllowedError'?'浏览器暂停了声音。请点右上角「开启声音」，再点 Listen。':'声音播放失败：'+error.message+'。家长区可测试声音并查看诊断。');return false;
  }
 }
 speak(text){return this.play([{text}]);}
}



