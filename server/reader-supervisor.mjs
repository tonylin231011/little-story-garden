import {spawn} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const port=Number(process.env.PORT)||4173;
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid local reader port');
const runtime=path.join(root,'.runtime','reader-'+port);
fs.mkdirSync(runtime,{recursive:true});
const logPath=path.join(runtime,'events.log');
function log(event,detail={}){
 try{
  if(fs.existsSync(logPath)&&fs.statSync(logPath).size>1024*1024){
   for(let i=2;i>=0;i--){const from=i?logPath+'.'+i:logPath,to=logPath+'.'+(i+1);if(fs.existsSync(from)){if(fs.existsSync(to))fs.unlinkSync(to);fs.renameSync(from,to);}}
  }
  fs.appendFileSync(logPath,JSON.stringify({at:new Date().toISOString(),event,...detail})+'\n');
 }catch(error){process.stderr.write('Reader log unavailable: '+error.code+'\n');}
}
const identity=createHash('sha256').update(root+'|'+port).digest('hex').slice(0,20);
const pipe=process.platform==='win32'?'\\\\.\\pipe\\story-garden-'+identity:path.join(os.tmpdir(),'story-garden-'+identity+'.sock');
const lock=net.createServer(socket=>socket.end());
lock.on('error',error=>{if(error.code==='EADDRINUSE')process.exit(0);log('lock-error',{code:error.code});process.exit(1);});
lock.listen(pipe,()=>start());

function probe(){return new Promise(resolve=>{
 let finished=false;const done=value=>{if(!finished){finished=true;resolve(value);}};
 const req=http.get({hostname:'127.0.0.1',port,path:'/api/health',timeout:1500},res=>{
  let data='';res.on('data',chunk=>{data+=chunk;if(data.length>8192){req.destroy();done({kind:'foreign'});}});
  res.on('error',()=>done({kind:'unresponsive'}));res.on('end',()=>{try{const value=JSON.parse(data);done(res.statusCode===200&&value.service==='little-story-garden'?{kind:'ready',...value}:{kind:'foreign'});}catch{done({kind:'foreign'});}});
 });
 req.on('timeout',()=>{req.destroy();done({kind:'unresponsive'});});req.on('error',error=>done({kind:error.code==='ECONNREFUSED'?'absent':'unresponsive'}));
});}

function start(){
 const startedAt=new Date().toISOString();let child=null,instance='',launchAt=0,nextStart=0,failures=0,unhealthy=0,launches=0,state='',timer,checking=false,closing=false;
 log('supervisor-start',{supervisorPid:process.pid,port});
 const writeStatus=(next,health)=>{
  if(next!==state){log('state',{from:state,to:next});state=next;}
  const value={service:'little-story-garden',supervisorPid:process.pid,serverPid:child?.pid||null,observedPid:health?.pid||null,owned:!!child,port,state,launches,startedAt,checkedAt:new Date().toISOString(),nextAttemptAt:nextStart?new Date(nextStart).toISOString():null};
  try{const temp=path.join(runtime,'status.tmp');fs.writeFileSync(temp,JSON.stringify(value,null,2));fs.renameSync(temp,path.join(runtime,'status.json'));}catch(error){log('status-write-error',{code:error.code});}
 };
 function launch(){
  instance=randomUUID();launchAt=Date.now();unhealthy=0;launches++;
  const current=spawn(process.execPath,[path.join(root,'server.mjs')],{cwd:root,env:{...process.env,PORT:String(port),READER_INSTANCE_ID:instance},windowsHide:true,stdio:['ignore','pipe','pipe','ipc']});
  child=current;log('reader-start',{pid:current.pid,launches});
  current.stdout.on('data',chunk=>log('reader-output',{message:String(chunk).trim().slice(0,2000)}));
  current.stderr.on('data',chunk=>log('reader-error',{message:String(chunk).trim().slice(0,2000)}));
  let ended=false;
  const onExit=(code,signal)=>{
   if(ended)return;ended=true;log('reader-exit',{pid:current.pid,code,signal});
   if(child===current){child=null;failures++;nextStart=Date.now()+Math.min(30000,1000*2**Math.min(failures-1,5));}
  };
  current.on('error',error=>{log('reader-spawn-error',{code:error.code});onExit(-1,null);});current.on('exit',onExit);
 }
 async function tick(){
  if(checking||closing)return;checking=true;
  try{
   const health=await probe();if(closing)return;
   if(health.kind==='ready'){
    if(child&&health.instance===instance&&health.pid===child.pid){unhealthy=0;if(Date.now()-launchAt>30000)failures=0;writeStatus('ready',health);}
    else writeStatus('existing-reader',health);
    return;
   }
   if(child){
    if(Date.now()-launchAt<15000){writeStatus('starting');return;}
    unhealthy++;writeStatus('unresponsive');
    if(unhealthy>=3){log('reader-health-restart',{pid:child.pid});child.kill();}
    return;
   }
   if(health.kind!=='absent'){writeStatus('port-conflict');return;}
   if(Date.now()<nextStart){writeStatus('retry-wait');return;}
   launch();writeStatus('starting');
  }catch(error){log('supervisor-check-error',{message:error.message});}
  finally{checking=false;}
 }
 const stop=()=>{if(closing)return;closing=true;clearInterval(timer);log('supervisor-stop');if(child)child.kill();writeStatus('stopped');lock.close();setTimeout(()=>process.exit(0),250).unref();};
 process.on('SIGTERM',stop);process.on('SIGINT',stop);
 process.on('uncaughtException',error=>{log('supervisor-fatal',{message:error.message});if(child)child.kill();process.exit(1);});
 process.on('unhandledRejection',error=>{log('supervisor-fatal',{message:String(error)});if(child)child.kill();process.exit(1);});
 timer=setInterval(tick,2500);tick();
}
