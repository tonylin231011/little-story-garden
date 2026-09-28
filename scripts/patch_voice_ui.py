from pathlib import Path
p=Path('src/app.js');s=p.read_text(encoding='utf-8')
old="const [base,manifest]=await Promise.all([fetch('/lesson.json').then(r=>r.json()),fetch('/audio/manifest.json').then(r=>r.json())]);"
new="""async function optionalJson(url,fallback){try{const r=await fetch(url);return r.ok?await r.json():fallback;}catch{return fallback;}}
const [base,manifest,voiceConfig,voicePreviews]=await Promise.all([fetch('/lesson.json').then(r=>r.json()),fetch('/audio/manifest.json').then(r=>r.json()),optionalJson('/audio/voices.json',{default:'',voices:[]}),optionalJson('/audio/previews.json',[])]);
let selectedVoice=voiceConfig.default,voiceLoadToken=0;
try{const storedVoice=localStorage.getItem(STORAGE+'-voice');if(voiceConfig.voices.some(v=>v.id===storedVoice))selectedVoice=storedVoice;}catch{}
const initialVoice=voiceConfig.voices.find(v=>v.id===selectedVoice);
const initialManifest=initialVoice?await optionalJson(initialVoice.manifest,manifest):manifest;"""
assert old in s;s=s.replace(old,new)
s=s.replace("new AudioAdapter(manifest,text=>","new AudioAdapter(initialManifest,text=>")
s=s.replace("function persist(){","audio.voiceName=initialVoice?.name||'';\nfunction persist(){")
s=s.replace("persist();render();}\nfunction btn", "persist();render();if(progress.mode==='play'&&progress.stage!=='complete'&&current())speak(current().tts||current().prompt);}\nfunction btn")
s=s.replace("可播放家长导入的本页原版音频","腾讯云 AI 合成语音 · 原版录音可优先替换")
s=s.replace("原图已内置 · 音频仅在本机导入","原图与语音已内置 · 播放不消耗云额度")
s=s.replace("<h3>本机音频</h3>","'+voiceStudio()+'<h3>导入原版录音</h3>")
s=s.replace("function audioKey(){", """function voiceStudio(){
 return '<h3>选择讲故事的声音</h3><p class="small muted">AI 合成声音，非出版社原版录音。切换和反复试听只播放本地文件，不调用云服务。</p>'+
 (voiceConfig.voices.length?'<label>全书声音<select id="voice-pack">'+voiceConfig.voices.map(v=>'<option value="'+e(v.id)+'" '+(v.id===selectedVoice?'selected':'')+'>'+e(v.name)+'</option>').join('')+'</select></label>':'<p class="small muted">完整语音包正在准备，先听下面的样本。</p>')+
 '<div class="voice-previews">'+voicePreviews.map((v,i)=>btn('♫ '+e(v.name),'voice-preview','data-preview="'+i+'" class="secondary"')).join('')+btn('■ 停止试听','stop','class="quiet"')+'</div><p class="small muted">试听内容：Can you see me? Can you find the box? You found me!</p><div class="divider"></div>';
}
async function selectVoice(id){
 const config=voiceConfig.voices.find(v=>v.id===id);if(!config)return;
 const ticket=++voiceLoadToken;audio.stop();
 try{
  const response=await fetch(config.manifest);
  if(!response.ok)throw Error('语音包暂不可用');
  const mapping=await response.json();
  if(ticket!==voiceLoadToken)return;
  if(!Object.keys(mapping).length||Object.values(mapping).some(v=>typeof v!=='string'||!v.startsWith('/audio/')))throw Error('语音包格式无效');
  audio.setVoice(mapping,config.name);selectedVoice=id;
  try{localStorage.setItem(STORAGE+'-voice',id);}catch{editorMessage('声音已切换，但浏览器无法保存该选择。');return;}
  editorMessage('已切换为 '+config.name+'，已保存。可返回绘本点击 Listen。');
 }catch(err){if(ticket===voiceLoadToken){const select=document.querySelector('#voice-pack');if(select)select.value=selectedVoice;editorMessage(err.message);}}
}
function audioKey(){""")
s=s.replace("switch(action){","switch(action){\n case 'voice-preview':{const v=voicePreviews[Number(b.dataset.preview)];if(v)audio.play([],{urls:[v.src]});break;}")
s=s.replace("on('edit-page','change'","on('voice-pack','change',ev=>selectVoice(ev.target.value));\n on('edit-page','change'")
p.write_text(s,encoding='utf-8')
