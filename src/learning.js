export function recordResult(history,{id,pageId,prompt,type,attempts=0,assisted=false,failed=false,at=Date.now()}){
 const objective=['multiple_choice','point_and_find'].includes(type);
 const result=!objective?'participated':failed?'needs-practice':assisted||attempts>=2?'together':attempts?'retried':'independent';
 const previous=[...history].reverse().find(x=>x.id===id);
 const early=result==='independent'&&previous?.result==='independent'&&previous.dueAt>at;
 const streak=result==='independent'?(early?previous.streak:(previous?.streak||0)+1):0;
 const days=result==='independent'?[1,3,7][Math.min(streak-1,2)]:result==='retried'?1:0;
 const date=new Date(at);date.setDate(date.getDate()+days);date.setHours(0,0,0,0);
 const event={id,pageId,prompt,type,result,attempts,streak,at,dueAt:objective?(early?previous.dueAt:days?date.getTime():at):null};
 return [...history,event].slice(-500);
}
export function latestResults(history){
 const byId=new Map();for(const item of history)byId.set(item.id,item);return [...byId.values()];
}
export function dueResults(history,at=Date.now()){
 return latestResults(history).filter(x=>x.dueAt!==null&&x.dueAt<=at).sort((a,b)=>a.dueAt-b.dueAt);
}
export function resultLabel(result){
 return {independent:'独立完成',retried:'再试后完成',together:'一起完成',participated:'已参与', 'needs-practice':'再练一次'}[result]||'已参与';
}
export class LocalRecorder{
 constructor(onUpdate,onClip){this.onUpdate=onUpdate;this.onClip=onClip;this.clips=new Map();this.token=0;this.state='idle';this.key='';this.error='';}
 notify(){this.onUpdate();}
 cancel(){
  this.token++;clearTimeout(this.timer);this.timer=null;
  if(this.recorder?.state==='recording')this.recorder.stop();
  this.stream?.getTracks().forEach(t=>t.stop());this.stream=null;this.state='idle';
 }
 async start(key){
  this.cancel();this.key=key;this.error='';const token=this.token;this.state='asking';this.notify();
  if(!navigator.mediaDevices?.getUserMedia||!globalThis.MediaRecorder){this.state='idle';this.error='这个浏览器暂不支持录音，可以直接跟着说。';this.notify();return;}
  try{
   const stream=await navigator.mediaDevices.getUserMedia({audio:true});
   if(token!==this.token){stream.getTracks().forEach(t=>t.stop());return;}
   this.stream=stream;const chunks=[];const recorder=new MediaRecorder(stream);this.recorder=recorder;
   recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};
   recorder.onstop=()=>{
    stream.getTracks().forEach(t=>t.stop());if(token!==this.token)return;
    clearTimeout(this.timer);this.stream=null;this.state='idle';
    const blob=new Blob(chunks,{type:recorder.mimeType||'audio/webm'});
    if(blob.size)this.clips.set(key,blob);else this.error='没有录到声音，可以再试一次。';
    this.notify();if(blob.size)this.onClip?.(key,blob);
   };
   recorder.onerror=()=>{this.cancel();this.error='录音中断了，可以直接跟读或重新试一次。';this.notify();};
   recorder.start();this.state='recording';this.notify();this.timer=setTimeout(()=>this.stop(),15000);
  }catch(error){if(token!==this.token)return;this.cancel();this.error=error.name==='NotAllowedError'?'没有开启麦克风。可以在浏览器中允许录音，或直接跟着说。':'麦克风暂不可用，可以直接跟着说。';this.notify();}
 }
 stop(){clearTimeout(this.timer);if(this.recorder?.state==='recording')this.recorder.stop();}
 clear(key){this.cancel();this.clips.delete(key);this.error='';this.notify();}
}

