import http from 'node:http';
import {readFileSync} from 'node:fs';
import {handleAI} from './server/ai.mjs';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
try{
 const env=readFileSync(path.join(root,'.env.local'),'utf8');
 for(const line of env.split(/\r?\n/)){const match=/^(STORY_AI_[A-Z_]+)\s*=\s*(.*)$/.exec(line.trim());if(match&&!process.env[match[1]])process.env[match[1]]=match[2].replace(/^(['"])(.*)\1$/,'$2');}
}catch(error){if(error.code!=='ENOENT')throw Error('无法读取本机 AI 配置。');}
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.wasm':'application/wasm','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.mp3':'audio/mpeg','.wav':'audio/wav','.svg':'image/svg+xml'};
const server=http.createServer(async(req,res)=>{
 try{
  if(new URL(req.url,'http://localhost').pathname==='/api/health'&&req.method==='GET'){
   res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
   res.end(JSON.stringify({service:'little-story-garden',version:'2.0.0',pid:process.pid,instance:process.env.READER_INSTANCE_ID||null}));return;
  }
  if(await handleAI(req,res))return;
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405).end();return;}
  const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  let base=name.startsWith('/src/')?root:path.join(root,'public');if(name==='/')base=root;
  const file=path.resolve(base,name==='/'?'index.html':name.slice(1));
  if(!file.startsWith(base+path.sep)){res.writeHead(403).end();return;}
  const info=await stat(file);if(!info.isFile())throw Error('not a file');
  const headers={'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache','Accept-Ranges':'bytes','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; font-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; img-src 'self' blob:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'"};
  let start=0,end=info.size-1,code=200;
  if(req.headers.range&&req.method==='GET'){
   const match=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
   if(!match||(!match[1]&&!match[2])){res.writeHead(416,{'Content-Range':'bytes */'+info.size}).end();return;}
   if(!match[1])start=Math.max(0,info.size-Number(match[2]));
   else{start=Number(match[1]);if(match[2])end=Math.min(end,Number(match[2]));}
   if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=info.size){res.writeHead(416,{'Content-Range':'bytes */'+info.size}).end();return;}
   code=206;headers['Content-Range']='bytes '+start+'-'+end+'/'+info.size;
  }
  headers['Content-Length']=end-start+1;res.writeHead(code,headers);
  res.end(req.method==='HEAD'?undefined:(await readFile(file)).subarray(start,end+1));
 }catch{if(!res.headersSent)res.writeHead(404,{'Content-Type':'text/plain'});res.end('Not found');}
});
// Managed children close when their supervisor disappears; no orphan can retain the port.
if(process.send)process.on('disconnect',()=>{
 server.close();setTimeout(()=>process.exit(0),1500).unref();
});
server.listen(Number(process.env.PORT)||4173,'127.0.0.1',()=>console.log('Hide and Seek: http://127.0.0.1:'+server.address().port));



