window.soundSources=[];window.sourcePlaying=false;
const NativeContext=window.AudioContext;
window.AudioContext=function(...args){
 const ctx=new NativeContext(...args);window.lastContext=ctx;const create=ctx.createBufferSource.bind(ctx);
 ctx.createBufferSource=()=>{
  const source=create(),start=source.start.bind(source),stop=source.stop.bind(source);
  source.start=(...a)=>{window.lastSource=source;window.sourcePlaying=true;window.soundSources.push(source);source.addEventListener('ended',()=>{if(window.lastSource===source)window.sourcePlaying=false;});return start(...a);};
  source.stop=(...a)=>{if(window.lastSource===source)window.sourcePlaying=false;return stop(...a);};
  return source;
 };return ctx;
};
