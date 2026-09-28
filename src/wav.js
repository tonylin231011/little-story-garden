// Decode PCM directly so packaged speech does not depend on an MP3 codec.
export function pcmWav(bytes) {
 const v=new DataView(bytes), tag=(p)=>String.fromCharCode(...new Uint8Array(bytes,p,4));
 if(bytes.byteLength<44||tag(0)!=='RIFF'||tag(8)!=='WAVE')throw Error('Not a WAV file');
 let format,body;
 for(let p=12;p+8<=v.byteLength;){
  const size=v.getUint32(p+4,true),start=p+8;
  if(start+size>v.byteLength)throw Error('Truncated WAV');
  if(tag(p)==='fmt '){if(size<16)throw Error('Invalid WAV format');format={codec:v.getUint16(start,true),channels:v.getUint16(start+2,true),sampleRate:v.getUint32(start+4,true),align:v.getUint16(start+12,true),bits:v.getUint16(start+14,true)};}
  if(tag(p)==='data')body={start,size};
  p=start+size+(size%2);
 }
 if(!format||!body||format.codec!==1||format.bits!==16||format.channels<1||format.channels>2||format.align!==format.channels*2||format.sampleRate<8000||format.sampleRate>192000)throw Error('Expected 16-bit PCM WAV');
 if(!body.size||body.size%format.align)throw Error('Invalid WAV samples');
 const length=body.size/format.align;
 const channels=Array.from({length:format.channels},()=>new Float32Array(length));
 for(let i=0;i<length;i++)for(let c=0;c<format.channels;c++)channels[c][i]=v.getInt16(body.start+i*format.align+c*2,true)/32768;
 return {channels,sampleRate:format.sampleRate,length};
}
