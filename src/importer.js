import {MAX_PAGES} from './library.js';
import {siteAsset} from './paths.js';
const MAX_BYTES=80*1024*1024;
function canvasBlob(canvas){return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('图片转换失败')),'image/jpeg',.94));}
export async function importFiles(files,onProgress=()=>{},cancelled=()=>false){
 const list=Array.from(files);
 if(!list.length)return [];
 if(list.reduce((sum,f)=>sum+f.size,0)>MAX_BYTES)throw Error('本次文件总大小不能超过 80 MB。');
 const pdfs=list.filter(f=>f.type==='application/pdf'||/\.pdf$/i.test(f.name));
 if(pdfs.length&&(pdfs.length!==1||list.length!==1))throw Error('一次请选择一个 PDF，或一组截图。');
 if(!pdfs.length&&list.length>MAX_PAGES)throw Error('每集最多 '+MAX_PAGES+' 页。');
 const results=[];
 if(pdfs.length){
  const pdfjs=await import(siteAsset('/vendor/pdfjs/pdf.mjs'));
  pdfjs.GlobalWorkerOptions.workerSrc=siteAsset('/vendor/pdfjs/pdf.worker.mjs');
  const task=pdfjs.getDocument({data:new Uint8Array(await pdfs[0].arrayBuffer()),isEvalSupported:false,cMapUrl:siteAsset('/vendor/pdfjs/cmaps/'),cMapPacked:true,standardFontDataUrl:siteAsset('/vendor/pdfjs/standard_fonts/'),wasmUrl:siteAsset('/vendor/pdfjs/wasm/'),iccUrl:siteAsset('/vendor/pdfjs/iccs/')});
  task.onPassword=()=>task.destroy();
  try{
   const pdf=await task.promise;
   if(pdf.numPages>MAX_PAGES)throw Error('这份 PDF 有 '+pdf.numPages+' 页。请先拆分成每集最多 '+MAX_PAGES+' 页。');
   for(let i=1;i<=pdf.numPages;i++){
    if(cancelled())throw Error('已取消导入');
    onProgress('正在处理第 '+i+' / '+pdf.numPages+' 页…');
    const page=await pdf.getPage(i),initial=page.getViewport({scale:1}),viewport=page.getViewport({scale:Math.min(2,1600/Math.max(initial.width,initial.height))});
    const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
    await page.render({canvasContext:canvas.getContext('2d'),viewport,background:'white'}).promise;
    const content=await page.getTextContent();
    const text=content.items.map(item=>item.str+(item.hasEOL?'\n':' ')).join('').trim();
    results.push({id:crypto.randomUUID(),name:'第 '+i+' 页',blob:await canvasBlob(canvas),text,source:'pdf'});
    canvas.width=canvas.height=1;page.cleanup();
   }
  }catch(error){throw Error(error.name==='PasswordException'||error.message?.includes('destroyed')?'加密 PDF 暂不支持，请导出未加密的副本。':error.message||'PDF 读取失败');}
  finally{await task.destroy();}
 }else{
  list.sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}));
  for(const [i,file] of list.entries()){
   if(cancelled())throw Error('已取消导入');
   if(!/^image\/(png|jpeg|webp)$/.test(file.type)&&!/\.(png|jpe?g|webp)$/i.test(file.name))throw Error('截图支持 PNG、JPG、WEBP：'+file.name);
   onProgress('正在处理截图 '+(i+1)+' / '+list.length+'…');
   let bitmap;
   try{bitmap=await createImageBitmap(file);if(bitmap.width*bitmap.height>40000000)throw Error('图片尺寸过大');}
   catch{throw Error('无法读取图片：'+file.name);}
   const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
   const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
   results.push({id:crypto.randomUUID(),name:file.name,blob:await canvasBlob(canvas),text:'',source:'screenshot'});canvas.width=canvas.height=1;
  }
 }
 if(cancelled())throw Error('已取消导入');
 return results;
}

