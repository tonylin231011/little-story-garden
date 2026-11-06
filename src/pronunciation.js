export function pronunciationFeedback(result){
 const score=Number(result?.score),completion=Number(result?.completion);
 if(!Number.isFinite(score)||score<0||score>100)return {title:'Nice try!',message:'再听一遍，轻轻跟着说。',level:'retry'};
 if(score>=85&&completion>=0.8)return {title:'Excellent!',message:'这一句读得很清楚！',level:'excellent'};
 if(score>=65&&completion>=0.6)return {title:'Good job!',message:'读得不错，再听一遍会更棒。',level:'good'};
 return {title:'Good try!',message:'勇敢开口了！再听一遍，慢慢说。',level:'retry'};
}

export async function pronunciationWav(blob){
 const Context=globalThis.AudioContext||globalThis.webkitAudioContext;
 if(!Context)throw Error('这个浏览器无法准备评测音频');
 const context=new Context();
 let decoded;
 try{decoded=await context.decodeAudioData(await blob.arrayBuffer());}
 finally{await context.close();}
 const rate=16000,length=Math.floor(decoded.duration*rate);
 if(length<rate/4||length>rate*16)throw Error('录音时长不合适，请再读一次');
 const channels=Array.from({length:decoded.numberOfChannels},(_,i)=>decoded.getChannelData(i));
 const bytes=new ArrayBuffer(44+length*2),view=new DataView(bytes);
 const label=(offset,value)=>{for(let i=0;i<value.length;i++)view.setUint8(offset+i,value.charCodeAt(i));};
 label(0,'RIFF');view.setUint32(4,36+length*2,true);label(8,'WAVE');label(12,'fmt ');
 view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);
 view.setUint32(24,rate,true);view.setUint32(28,rate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);
 label(36,'data');view.setUint32(40,length*2,true);
 for(let i=0;i<length;i++){
  const source=i*decoded.sampleRate/rate,index=Math.floor(source),fraction=source-index;
  let sample=0;
  for(const channel of channels)sample+=(channel[index]||0)*(1-fraction)+(channel[Math.min(index+1,channel.length-1)]||0)*fraction;
  sample=Math.max(-1,Math.min(1,sample/channels.length));
  view.setInt16(44+i*2,Math.round(sample<0?sample*32768:sample*32767),true);
 }
 return new Blob([bytes],{type:'audio/wav'});
}

export async function evaluatePronunciation(endpoint,blob,text,token){
 if(!endpoint||!/^https:\/\//.test(endpoint))throw Error('评测服务尚未连接');
 if(!token)throw Error('请家长先在家长区设置评测口令');
 if(!navigator.onLine)throw Error('当前离线，联网后可以再录一次获取发音反馈');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),25000);
 try{
  const wav=await pronunciationWav(blob),bytes=new Uint8Array(await wav.arrayBuffer());
  let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
  const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({audio:btoa(binary),text}),signal:controller.signal,cache:'no-store'});
  if(!response.ok)throw Error('评测暂时不可用（'+response.status+'）');
  const result=await response.json();
  if(!result||typeof result.score!=='number'||typeof result.completion!=='number')throw Error('评测结果格式有误');
  return result;
 }finally{clearTimeout(timer);}
}
