export const STORAGE='hide-and-seek-v1';
export function inside(point,bbox){return point.x>=bbox[0]&&point.y>=bbox[1]&&point.x<=bbox[0]+bbox[2]&&point.y<=bbox[1]+bbox[3];}
export function hitTarget(page,activity,point){return (activity.target_hotspots||[]).some(id=>{const h=page.hotspots.find(h=>h.id===id);return h&&inside(point,h.bbox);});}
export function eligible(list,filter='all'){return list.filter(a=>a.enabled!==false&&a.reviewed!==false&&(filter==='all'||(filter==='word'?a.category==='word':a.category!=='word')));}
export function validateLesson(l,{draft=false}={}){
 const errors=[],ids=new Set(),activityIds=new Set();
 if(!l||!Array.isArray(l.pages)||l.pages.length<1||l.pages.length>40)return ['课程需要 1–40 个页面。'];
 if(!Array.isArray(l.review))errors.push('缺少复习题。');
 for(const p of l.pages){
  if(!p||typeof p.page_id!=='string'||ids.has(p.page_id)){errors.push('页面 ID 缺失或重复');if(!p)continue;}ids.add(p.page_id);
  const segments=p.read_aloud?.segments;
  if(!Array.isArray(segments)||segments.some(s=>!s||typeof s.text!=='string'||!s.text.trim())||(!draft&&!segments.length&&!p.read_aloud.silent))errors.push('填写朗读正文，或确认页面无正文');
  const image=Object.values(l.assets?.images||{}).find(i=>i?.asset_id===p.image_asset);
  if(!image||typeof image.source!=='string'||!(/^\/images\/[a-z0-9_]+\.png$/.test(image.source)||/^local:[a-z0-9-]{8,64}:[a-z0-9-]{8,64}$/i.test(image.source)))errors.push('页面图片必须来自内置或本机导入素材');
  const hs=new Set();
  if(!Array.isArray(p.hotspots)||!Array.isArray(p.activities)){errors.push('缺少热点或题目');continue;}
  for(const h of p.hotspots){
   if(!h||typeof h.id!=='string'||hs.has(h.id)||typeof h.label!=='string'){errors.push('热点 ID 或名称无效');if(!h)continue;}hs.add(h.id);
   if(!Array.isArray(h.bbox)||h.bbox.length!==4||h.bbox.some(n=>!Number.isFinite(n)||n<0||n>1)||h.bbox[2]<=0||h.bbox[3]<=0||h.bbox[0]+h.bbox[2]>1.001||h.bbox[1]+h.bbox[3]>1.001)errors.push('热点必须位于图片内，且有宽高');
  }
  for(const a of p.activities)check(a,hs);
 }
 for(const a of Array.isArray(l.review)?l.review:[])check(a,new Set());
 function check(a,hs){
  if(!a||typeof a.activity_id!=='string'||activityIds.has(a.activity_id)){errors.push('题目 ID 重复或缺失');if(!a)return;}activityIds.add(a.activity_id);
  if(typeof a.prompt!=='string'||!a.prompt.trim())errors.push('问题不能为空');
  if(!['point_and_find','multiple_choice','listen_and_repeat','parent_guided','prediction','parent_discussion'].includes(a.type))errors.push('不支持的题型');
  if(a.type==='point_and_find'&&(!Array.isArray(a.target_hotspots)||!a.target_hotspots.length||a.target_hotspots.some(id=>!hs.has(id))))errors.push('指图题必须关联有效热点');
  if(a.type==='multiple_choice'&&(!Array.isArray(a.choices)||a.choices.length<2||a.choices.length>3||a.choices.some(c=>!c||typeof c.id!=='string'||typeof c.text!=='string'||!c.text.trim())||new Set(a.choices.map(c=>c.id)).size!==a.choices.length||!a.choices.some(c=>c.id===a.correct_answer)))errors.push('选择题需要 2–3 个不同选项及有效正确答案');
 }
 return [...new Set(errors)];
}
export function freshProgress(){return {page:0,mode:'read',filter:'all',index:0,stage:'book',done:[],read:[],finished:false,practiceIds:[]};}
export function normalizeProgress(value,lesson){
 const p={...freshProgress(),...value};
 p.page=Number.isInteger(p.page)?Math.max(0,Math.min(lesson.pages.length-1,p.page)):0;
 p.mode=['read','play'].includes(p.mode)?p.mode:'read';p.filter=['all','word','story'].includes(p.filter)?p.filter:'all';
 p.stage=['book','review','complete'].includes(p.stage)?p.stage:'book';p.index=Number.isInteger(p.index)&&p.index>=0?p.index:0;
 const valid=new Set([...lesson.pages.flatMap(p=>p.activities),...lesson.review].map(a=>a.activity_id));
 p.done=Array.isArray(p.done)?[...new Set(p.done.filter(id=>valid.has(id)))]:[];
 p.practiceIds=Array.isArray(p.practiceIds)?[...new Set(p.practiceIds.filter(id=>valid.has(id)))]:[];
 p.read=Array.isArray(p.read)?[...new Set(p.read.filter(id=>lesson.pages.some(p=>p.page_id===id)))]:[];
 p.finished=p.finished===true;return p;
}
export function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

