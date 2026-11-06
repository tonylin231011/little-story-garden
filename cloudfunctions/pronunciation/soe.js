const {createHmac,randomUUID,randomInt}=require('node:crypto');

function signedUrl({appid,secretId,secretKey,text,now=Math.floor(Date.now()/1000),nonce=randomInt(1,1000000000),voiceId=randomUUID()}){
 const path=`soe.cloud.tencent.com/soe/api/${appid}`;
 const params={eval_mode:1,expired:now+60,nonce,rec_mode:1,ref_text:text,score_coeff:'1.0',secretid:secretId,server_engine_type:'16k_en',timestamp:now,voice_format:1,voice_id:voiceId};
 const entries=Object.entries(params).sort(([a],[b])=>a<b?-1:a>b?1:0);
 const original=path+'?'+entries.map(([key,value])=>key+'='+value).join('&');
 const signature=createHmac('sha1',secretKey).update(original).digest('base64');
 return 'wss://'+path+'?'+entries.map(([key,value])=>encodeURIComponent(key)+'='+encodeURIComponent(value)).join('&')+'&signature='+encodeURIComponent(signature);
}

function evaluate(wav,text,credentials,WebSocketClass){
 return new Promise((resolve,reject)=>{
  const socket=new WebSocketClass(signedUrl({...credentials,text}));let started=false,latest=null,settled=false;
  const timer=setTimeout(()=>finish(Error('评测等待超时')),25000);
  function finish(error,result){if(settled)return;settled=true;clearTimeout(timer);if(socket.readyState===WebSocketClass.OPEN)socket.close();else if(socket.readyState===WebSocketClass.CONNECTING)socket.terminate();error?reject(error):resolve(result);}
  socket.on('message',raw=>{
   let message;try{message=JSON.parse(String(raw));}catch{return finish(Error('评测返回了无效数据'));}
   if(message.code!==0){
    const descriptions={4003:'腾讯云口语评测（新版）尚未开通',4004:'腾讯云口语评测额度已用完'};
    const error=Error(descriptions[message.code]||'腾讯云口语评测暂时不可用（'+message.code+'）');
    error.soeCode=message.code;
    return finish(error);
   }
   if(!started){started=true;socket.send(wav);socket.send(JSON.stringify({type:'end'}));return;}
   if(message.result&&typeof message.result==='object')latest=message.result;
   if(message.final===1){
    if(!latest)return finish(Error('评测没有返回有效结果'));
    finish(null,{score:latest.SuggestedScore,accuracy:latest.PronAccuracy,fluency:latest.PronFluency,completion:latest.PronCompletion});
   }
  });
  socket.on('error',()=>finish(Error('无法连接腾讯云口语评测')));
  socket.on('close',()=>{if(!settled)finish(Error('评测连接提前关闭'));});
 });
}

module.exports={signedUrl,evaluate};
