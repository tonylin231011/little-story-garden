import {mkdir,copyFile,cp} from 'node:fs/promises';
const to='public/vendor/pdfjs';
await mkdir(to,{recursive:true});
for(const name of ['pdf.mjs','pdf.worker.mjs'])await copyFile('node_modules/pdfjs-dist/build/'+name,to+'/'+name);
for(const name of ['cmaps','standard_fonts','wasm','iccs'])await cp('node_modules/pdfjs-dist/'+name,to+'/'+name,{recursive:true});
await copyFile('node_modules/pdfjs-dist/LICENSE',to+'/LICENSE');
console.log('Local PDF.js assets ready; importing PDFs requires no network.');

