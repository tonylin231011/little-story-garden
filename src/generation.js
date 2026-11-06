import {assetBlob} from './library.js';
import {validateLesson} from './core.js';
export async function aiStatus(){
 if(document.querySelector('meta[name="story-static"]'))throw Error('在线网站暂不提供云端 AI 生成；可以手动制作新课程。');
 const response=await fetch('/api/ai/status');
 if(!response.ok)throw Error('AI 接口尚不可用，请重新启动新版阅读器。');
 return response.json();
}
function dataUrl(blob){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(Error('图片读取失败'));r.readAsDataURL(blob);});}
export async function generateEpisode(lesson,status,onProgress=()=>{},signal){
 if(!status.configured)throw Error('请先配置视觉 AI 服务。');
 const output=structuredClone(lesson);
 for(const [index,page] of output.pages.entries()){
  if(signal?.aborted)throw new DOMException('已取消','AbortError');
  onProgress('AI 正在处理第 '+(index+1)+' / '+output.pages.length+' 页…');
  const source=Object.values(output.assets.images).find(x=>x.asset_id===page.image_asset).source;
  let blob;if(source.startsWith('local:'))blob=await assetBlob(source);else{const r=await fetch(source,{signal});if(!r.ok)throw Error('读取页面图片失败');blob=await r.blob();}
  if(!blob)throw Error('页面图片缺失');
  const response=await fetch('/api/ai/page',{method:'POST',headers:{'Content-Type':'application/json','X-Story-Request':'1'},signal,body:JSON.stringify({confirmed:true,fingerprint:status.fingerprint,title:output.book.title,pageNumber:index+1,totalPages:output.pages.length,image:await dataUrl(blob),text:page.read_aloud.segments.map(x=>x.text).join('\n')})});
  const value=await response.json();if(!response.ok)throw Error('第 '+(index+1)+' 页生成未完成：'+(value.error||'服务错误')+'。不会自动重试。');
  page.read_aloud=value.page.read_aloud;page.hotspots=value.page.hotspots;
  page.activities=value.page.activities.map((q,i)=>({...q,activity_id:page.page_id+'_ai_'+i,reviewed:false,enabled:true}));
  page.parent_guide=value.page.parent_guide;page.generation_notes=value.page.warnings;
 }
 const errors=validateLesson(output,{draft:true});if(errors.length)throw Error('AI 结果需要修正：'+errors.join('；'));
 output.generation={provider:status.provider,model:status.model,createdAt:new Date().toISOString(),reviewed:false};
 return output;
}

