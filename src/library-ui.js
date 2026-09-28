import {BUILTIN_ID,listEpisodes,makeDraft,saveEpisode,assetBlob} from './library.js';
import {importFiles} from './importer.js';
import {escapeHtml as e} from './core.js';
const button=(label,action,attrs='')=>'<button type="button" data-lib="'+action+'" '+attrs+'>'+label+'</button>';
export class LibraryView{
 constructor(redraw,open){this.redraw=redraw;this.open=open;this.entries=[];this.items=[];this.urls=new Map();this.thumbs=new Map();this.mode='shelf';this.title='';this.message='';this.busy=false;this.ticket=0;}
 async refresh(){
  try{this.entries=await listEpisodes();for(const entry of this.entries){const source=Object.values(entry.lesson.assets.images)[0]?.source;if(source&&!this.thumbs.has(source)){const blob=await assetBlob(source);if(blob)this.thumbs.set(source,URL.createObjectURL(blob));}}}
  catch{this.message='此浏览器暂时不能读取本机书架。请使用普通浏览窗口。';}
  this.redraw();
 }
 reset(){this.ticket++;for(const url of this.urls.values())URL.revokeObjectURL(url);this.urls.clear();this.items=[];this.title='';this.busy=false;this.message='';}
 preview(item){if(!this.urls.has(item.id))this.urls.set(item.id,URL.createObjectURL(item.blob));return this.urls.get(item.id);}
 render(){
  if(this.mode==='import')return '<main class="library-main"><div class="title-row"><div><p class="eyebrow">A NEW LITTLE ADVENTURE</p><h1>制作新的一集</h1><p class="muted">导入页面 → 整理顺序 → 生成草稿 → 家长审核</p></div>'+button('回到书架','back','class="quiet"')+'</div><div class="import-panel"><label>这一集的名字<input id="episode-title" maxlength="100" value="'+e(this.title)+'" placeholder="例如：The Lost Teddy" '+(this.busy?'disabled':'')+'></label><label class="file-label">选择一个 PDF 或一组截图<input id="episode-files" type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp" '+(this.busy?'disabled':'')+'></label><p class="small muted">最多 40 页，共 80 MB。先在本机拆页，不会因选择文件就发送给云端。</p><div class="import-message" role="status">'+e(this.message)+'</div>'+
  (this.items.length?'<p class="small">已导入 '+this.items.length+' 页。用箭头调整顺序，删除不需要的封面、空白或版权页。</p><div class="import-pages">'+this.items.map((item,i)=>'<article class="import-page"><img src="'+this.preview(item)+'" alt="第 '+(i+1)+' 页预览"><div><b>第 '+(i+1)+' 页</b><p class="small muted">'+e(item.name)+'</p><div class="import-controls">'+button('↑','up','data-index="'+i+'" aria-label="第 '+(i+1)+' 页前移" '+(i===0?'disabled':''))+button('↓','down','data-index="'+i+'" aria-label="第 '+(i+1)+' 页后移" '+(i===this.items.length-1?'disabled':''))+button('移除','remove','data-index="'+i+'" class="quiet"')+'</div><label>正文草稿<textarea data-page-text="'+i+'" rows="3" placeholder="'+(item.source==='screenshot'?'截图正文待识别；也可以先填写。':'未提取到文本时，可能是扫描页。')+'">'+e(item.text)+'</textarea></label></div></article>').join('')+'</div>'+button('生成课程草稿 →','create','class="primary" '+(this.busy?'disabled':'')):'')+
  '<p class="small muted">这一步整理页面和可提取正文；AI 看图识字、出题与热点生成需单独配置服务。草稿不会直接发布给孩子。</p></div></main>';
  const builtin={id:BUILTIN_ID,title:'Hide and Seek',status:'published',lesson:{pages:Array(6),assets:{images:{cover:{source:'/images/cover.png'}}}}};
  return '<main class="library-main"><div class="title-row"><div><p class="eyebrow">OUR LITTLE BOOKSHELF</p><h1>每本书，都是新的一集</h1><p class="muted">图片、问题、音频和学习进度，按每一集保存。</p></div>'+button('+ 制作新的一集','new','class="primary"')+'</div><p role="status">'+e(this.message)+'</p><div class="bookshelf">'+[builtin,...this.entries].map(entry=>{const source=Object.values(entry.lesson.assets.images)[0]?.source,cover=entry.id===BUILTIN_ID?source:this.thumbs.get(source);return '<article class="episode-card">'+(cover?'<img src="'+e(cover)+'" alt="'+e(entry.title)+' 封面">':'<div class="book-placeholder">📖</div>')+'<div><p class="eyebrow">'+(entry.status==='published'?'READY TO READ':'PARENT DRAFT')+'</p><h2>'+e(entry.title)+'</h2><p class="small muted">'+entry.lesson.pages.length+' 页 · '+(entry.status==='published'?'可以开始阅读':'等待家长审核')+'</p>'+button(entry.status==='published'?'继续阅读 →':'编辑 / 审核 →','open','data-id="'+e(entry.id)+'" class="secondary wide"')+'</div></article>';}).join('')+'</div><p class="small muted">书架保存在这个浏览器里。清理浏览器数据会移除导入的内容，请保留原始 PDF / 截图及课程备份。</p></main>';
 }
 bind(root){
  root.querySelectorAll('[data-lib]').forEach(el=>el.onclick=async()=>{
   const action=el.dataset.lib,index=Number(el.dataset.index);
   try{
    if(action==='open'){await this.open(el.dataset.id);return;}
    if(action==='new'){this.reset();this.mode='import';}
    if(action==='back'){this.reset();this.mode='shelf';await this.refresh();return;}
    if(this.busy)return;
    if(action==='up'||action==='down'){const other=index+(action==='up'?-1:1);if(other>=0&&other<this.items.length)[this.items[index],this.items[other]]=[this.items[other],this.items[index]];}
    if(action==='remove'){const [item]=this.items.splice(index,1);URL.revokeObjectURL(this.urls.get(item.id));this.urls.delete(item.id);}
    if(action==='create'){this.busy=true;this.message='正在保存这一集…';this.redraw();const {record,assets}=makeDraft(this.title,this.items);await saveEpisode(record,assets);this.reset();this.mode='shelf';await this.open(record.id);return;}
   }catch(error){this.busy=false;this.message=error.message;}
   this.redraw();
  });
  root.querySelector('#episode-title')?.addEventListener('input',event=>{this.title=event.target.value;});
  root.querySelectorAll('[data-page-text]').forEach(el=>el.oninput=()=>{this.items[Number(el.dataset.pageText)].text=el.value;});
  root.querySelector('#episode-files')?.addEventListener('change',async event=>{
   const files=Array.from(event.target.files);if(!files.length)return;
   if(!this.title)this.title=files.length===1?files[0].name.replace(/\.[^.]+$/,''):'我的新绘本';
   const ticket=++this.ticket;this.busy=true;this.message='正在读取文件…';this.redraw();
   try{
    const items=await importFiles(files,text=>{if(ticket===this.ticket){this.message=text;this.redraw();}},()=>ticket!==this.ticket);
    if(ticket!==this.ticket)return;
    for(const url of this.urls.values())URL.revokeObjectURL(url);this.urls.clear();this.items=items;this.message='页面已准备好。请检查顺序和正文。';
   }catch(error){if(ticket===this.ticket)this.message='导入未完成：'+error.message;}
   finally{if(ticket===this.ticket){this.busy=false;this.redraw();}}
  });
 }
}

