const http=require('node:http');
const {timingSafeEqual}=require('node:crypto');
const WebSocket=require('ws');
const {evaluate}=require('./soe');

const allowed=new Set(['https://tonylin231011.github.io','http://127.0.0.1:4173']);
function respond(res,status,value,origin){
 res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Access-Control-Allow-Origin':origin,'Vary':'Origin','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization','X-Content-Type-Options':'nosniff'});
 res.end(JSON.stringify(value));
}
const server=http.createServer(async(req,res)=>{
 const origin=req.headers.origin;
 if(!allowed.has(origin)){res.writeHead(403).end();return;}
 if(req.method==='OPTIONS'){respond(res,200,{ok:true},origin);return;}
 if(req.method!=='POST'){respond(res,405,{error:'Method not allowed'},origin);return;}
 const expected=Buffer.from(process.env.STORY_ASSESS_TOKEN||''),given=Buffer.from((req.headers.authorization||'').replace(/^Bearer /,'').slice(0,256));
 if(!expected.length||!given.length||given.length!==expected.length||!timingSafeEqual(given,expected)){respond(res,401,{error:'家长评测口令未设置或不正确'},origin);return;}
 const credentials={appid:process.env.TENCENT_APP_ID,secretId:process.env.TENCENT_SECRET_ID,secretKey:process.env.TENCENT_SECRET_KEY};
 if(Object.values(credentials).some(value=>!value)){respond(res,503,{error:'评测服务尚未配置'},origin);return;}
 let body='';
 try{
  for await(const chunk of req){body+=chunk;if(body.length>800000)throw Error('录音过大');}
  const input=JSON.parse(body),text=String(input.text||'').trim(),wav=Buffer.from(String(input.audio||''),'base64');
  if(!/^[A-Za-z ,.?!'-]{1,180}$/.test(text)||text.split(/\s+/).length>30)throw Error('英文句子格式不正确');
  if(wav.length<8044||wav.length>520000||wav.toString('ascii',0,4)!=='RIFF'||wav.toString('ascii',8,12)!=='WAVE')throw Error('录音格式不正确');
  const result=await evaluate(wav,text,credentials,WebSocket);
  respond(res,200,result,origin);
 }catch(error){respond(res,400,{error:error.message},origin);}
});
server.listen(9000,'0.0.0.0');
