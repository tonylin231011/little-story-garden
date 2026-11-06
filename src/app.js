import {STORAGE as LEGACY_STORAGE,eligible,validateLesson,normalizeProgress,freshProgress,escapeHtml as e,hitTarget,inside} from './core.js';
import {AudioAdapter,originalAudio} from './audio.js';
import {LocalRecorder,recordResult,latestResults,dueResults,resultLabel} from './learning.js';
import {BUILTIN_ID,storageFor,getEpisode,saveEpisode,resolveImages,revokeImages,publicationProblems,splitText,assetBlob} from './library.js';
import {LibraryView} from './library-ui.js';
import {generateEpisode,aiStatus} from './generation.js';
import {siteAsset} from './paths.js';
import {evaluatePronunciation,pronunciationFeedback} from './pronunciation.js';
let activeId=BUILTIN_ID,STORAGE=LEGACY_STORAGE,libraryOpen=false,activeRecord=null,imageSources=new Map(),aiBusy=false;
const root=document.querySelector('#app');
async function optionalJson(url,fallback){try{const r=await fetch(siteAsset(url));return r.ok?await r.json():fallback;}catch{return fallback;}}
const [base,manifest,voiceConfig,voicePreviews]=await Promise.all([fetch(siteAsset('/lesson.json')).then(r=>r.json()),fetch(siteAsset('/audio/manifest.json')).then(r=>r.json()),optionalJson('/audio/voices.json',{default:'',voices:[]}),optionalJson('/audio/previews.json',[])]);
const pronunciationConfig=await optionalJson('/pronunciation.json',{endpoint:''});
let assessmentToken='';try{assessmentToken=localStorage.getItem('story-garden-assessment-token')||'';}catch{}
let selectedVoice=voiceConfig.default,voiceLoadToken=0;
try{const storedVoice=localStorage.getItem(STORAGE+'-voice');if(voiceConfig.voices.some(v=>v.id===storedVoice))selectedVoice=storedVoice;}catch{}
const initialVoice=voiceConfig.voices.find(v=>v.id===selectedVoice);
const initialManifest=initialVoice?await optionalJson(initialVoice.manifest,manifest):manifest;
let notice='',lesson=base;
function stored(key){try{return JSON.parse(localStorage.getItem(key)||'null');}catch{notice='本机记录无法读取，已打开内置课程。';return null;}}
const saved=stored(STORAGE+'-lesson');if(saved&&validateLesson(saved).length===0)lesson=saved;
let progress=normalizeProgress(stored(STORAGE+'-progress'),lesson),feedback='',attempts=0,solved=false,hint=false,parent=false,draft=null,ep=0,ea=0,eh=0,drag=null;
const audio=new AudioAdapter(initialManifest,text=>{const el=document.querySelector('#audio-status');if(el)el.textContent=text;});
audio.voiceName=initialVoice?.name||'';
let history=stored(STORAGE+'-learning')||[];if(!Array.isArray(history))history=[];
let repeatMode=false,repeatIndex=0,repeatCue=false;
const pronunciation=new Map(),recordTargets=new Map();
progress.practiceIds=Array.isArray(progress.practiceIds)?progress.practiceIds.filter(id=>activityIndex().some(x=>x.q.activity_id===id)):[];
const recorder=new LocalRecorder(()=>{if(!parent)render();},async(key,blob)=>{
 const text=recordTargets.get(key);if(!text)return;
 const ticket=Symbol();pronunciation.set(key,{state:'checking',ticket});render();
 try{
  const result=await evaluatePronunciation(pronunciationConfig.endpoint,blob,text,assessmentToken);
  if(pronunciation.get(key)?.ticket===ticket){pronunciation.set(key,{state:'ready',...pronunciationFeedback(result),score:result.score,completion:result.completion});render();}
 }catch(error){if(pronunciation.get(key)?.ticket===ticket){pronunciation.set(key,{state:'unavailable',message:error.message});render();}}
});
const shelf=new LibraryView(()=>{if(libraryOpen)render();},openEpisode);
root.addEventListener('pointerdown',()=>audio.unlock(),{capture:true});
root.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' ')audio.unlock();},{capture:true});
window.addEventListener('pagehide',()=>{recorder.cancel();audio.stop();});
function saveHistory(){try{localStorage.setItem(STORAGE+'-learning',JSON.stringify(history));}catch{notice='练习记录暂时无法保存，可在家长区导出。';}}
function bookTitle(){return lesson.book?.title||'我的绘本';}
function lastPage(){return lesson.pages.length-1;}
function courseAudio(key,blob){return originalAudio((activeId===BUILTIN_ID?'':activeId+':')+key,blob);}
function activityIndex(){return [...lesson.pages.flatMap((p,i)=>eligible(p.activities,'all').map(q=>({q,page:i}))),...eligible(lesson.review,'all').map(q=>({q,page:lastPage()}))];}
function dueQuestions(){const valid=new Set(activityIndex().map(x=>x.q.activity_id));return dueResults(history).filter(x=>valid.has(x.id));}
function logResult(q,options={}){history=recordResult(history,{id:q.activity_id,pageId:page().page_id,prompt:q.prompt,type:q.type,attempts,assisted:hint,...options});saveHistory();}
function startReview(){
 const ids=dueQuestions().slice(0,5).map(x=>x.id);if(!ids.length){notice='暂时没有到期的题目，继续读故事就好。';render();return;}
 change(()=>{progress.practiceIds=ids;progress.stage='review';progress.mode='play';progress.index=0;progress.filter='all';});
}
function persist(){try{localStorage.setItem(STORAGE+'-progress',JSON.stringify(progress));}catch{notice='浏览器无法保存进度，请勿关闭本页。';}}
function page(){return lesson.pages[progress.page];}
function questions(){
 if(progress.stage==='review'&&progress.practiceIds?.length){const lookup=activityIndex();return progress.practiceIds.map(id=>lookup.find(x=>x.q.activity_id===id)?.q).filter(Boolean);}
 return eligible(progress.stage==='review'?lesson.review:page().activities,progress.filter);
}
function current(){const q=questions();progress.index=Math.min(progress.index,Math.max(0,q.length-1));const item=q[progress.index];if(progress.stage==='review'&&progress.practiceIds?.length&&item){const match=activityIndex().find(x=>x.q.activity_id===item.activity_id);if(match)progress.page=match.page;}return item;}
function resetQuestion(){audio.stop();recorder.cancel();repeatMode=false;repeatIndex=0;repeatCue=false;feedback='';attempts=0;solved=false;hint=false;}
function change(fn){resetQuestion();fn();if(progress.stage==='book')progress.practiceIds=[];persist();render();if(progress.mode==='play'&&progress.stage!=='complete'&&current())speak(current().tts||current().prompt);}
function btn(label,action,attrs=''){return '<button type="button" data-action="'+action+'" '+attrs+'>'+label+'</button>';}
function markRead(){const id=page().page_id;if(!progress.read.includes(id))progress.read.push(id);persist();render();}
function speak(text){if(recorder.state!=='idle'){recorder.cancel();render();}audio.speak(text);}
function finishAnswer(assisted=false){const q=current();if(!q)return;solved=true;const usedHelp=assisted||hint||attempts>=2;logResult(q,{assisted:usedHelp});hint=usedHelp;if(!progress.done.includes(q.activity_id))progress.done.push(q.activity_id);feedback=q.feedback?.correct||q.feedback?.complete||'Well done!';persist();render();speak(feedback);}
function answer(ok){if(solved)return;if(ok)finishAnswer();else{attempts++;logResult(current(),{failed:true});feedback=current().feedback?.retry||"Let's look again.";hint=attempts>=2;render();speak(feedback);}}
function endBook(){progress.mode='play';progress.filter='all';progress.index=0;if(eligible(lesson.review).length)progress.stage='review';else{progress.stage='complete';progress.finished=true;}}
function listenToPage(){
 const p=page(),id=p.page_id;
 if(!p.read_aloud.segments.length){audio.statusText('这一页没有正文，和孩子一起看看图吧。');return;}
 audio.play(p.read_aloud.segments,{pageId:id,onComplete:()=>{
  if(parent||libraryOpen||progress.stage!=='book'||progress.mode!=='read'||page().page_id!==id)return;
  if(!progress.read.includes(id))progress.read.push(id);
  repeatMode=true;repeatIndex=0;repeatCue=true;persist();render();
  if(window.innerWidth<=640)document.querySelector('.activity-panel')?.scrollIntoView({behavior:'smooth',block:'start'});
 }});
}
function nextPage(){const oldId=page().page_id;change(()=>{if(progress.page<lastPage()){progress.page++;progress.mode='read';progress.index=0;progress.filter='all';}else endBook();});if(progress.stage==='book'&&page().page_id!==oldId)listenToPage();}
function nextQuestion(){const oldId=page().page_id;change(()=>{if(progress.index<questions().length-1)progress.index++;else if(progress.stage==='review'){progress.stage='complete';progress.finished=true;}else if(progress.filter!=='all'){progress.filter='all';progress.mode='read';progress.index=0;}else if(progress.page<lastPage()){progress.page++;progress.mode='read';progress.index=0;}else endBook();});if(progress.stage==='book'&&page().page_id!==oldId)listenToPage();}
function imageUrl(p){const source=Object.values((parent?draft:lesson).assets.images).find(a=>a.asset_id===p.image_asset).source;return imageSources.get(source)||siteAsset(source);}
function boxStyle(b){return 'left:'+b[0]*100+'%;top:'+b[1]*100+'%;width:'+b[2]*100+'%;height:'+b[3]*100+'%';}
function picture(p,editing=false){
 const q=parent?null:current();
 return '<div class="picture-stage"><div class="image-wrap '+(editing?'editable':'')+'" id="'+(editing?'editor-picture':'picture')+'"><img draggable="false" src="'+e(imageUrl(p))+'" alt="'+e(bookTitle()+' · '+p.page_id)+'">'+p.hotspots.map((h,i)=>'<button type="button" class="hotspot '+(editing?'box':hint&&q?.target_hotspots?.includes(h.id)?'reveal':'')+' '+(editing&&eh===i?'selected':'')+'" data-hotspot="'+i+'" style="'+boxStyle(h.bbox)+'" aria-label="'+e(h.label)+'">'+(editing?'<span>'+e(h.label)+'</span>':'')+'</button>').join('')+'<div id="draw-box"></div></div></div>';
}
function header(){return '<header><a class="brand" href="'+siteAsset('/')+'" aria-label="Story Garden 首页"><span class="brand-icon">✿</span><span>little story garden<small>A little story. A big adventure.</small></span></a>'+'<div class="header-actions">'+btn('📚 书架','library','class="quiet"')+btn('♫ 开启声音','enable-audio','class="quiet"')+btn(parent?'← 回到绘本':'⚙ 家长区','parent','class="quiet"')+'</div>'+'</header>';}
function render(){
 root.innerHTML=header()+(libraryOpen?shelf.render():parent?editor():child())+'<div id="audio-status" class="audio-status" role="status" aria-live="polite"></div>'+(notice?'<div class="notice" role="status">'+e(notice)+'</div>':'');
 if(libraryOpen){shelf.bind(root);root.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>dispatch(b.dataset.action,b).catch(err=>{notice='操作未完成：'+err.message;render();}));return;}bind();const status=document.querySelector('#audio-status');if(status)status.textContent=audio.status;if(parent)bindEditor();
}
function child(){
 if(progress.stage==='complete')return '<main class="completion"><div class="star">★</div><p class="eyebrow">A STORY TO REMEMBER</p><h1>You did it!</h1><p>You earned a story star.</p><div class="summary"><span>📖 '+progress.read.length+' / '+lesson.pages.length+' pages read</span><span>🌱 '+progress.done.length+' activities explored</span></div><p class="muted">和爸爸妈妈聊聊，你最喜欢哪一页？</p>'+btn('↻ Read again','restart','class="primary"')+btn('Browse the story','browse','class="quiet"')+practiceSummary(false)+'</main>';
 const q=current();const p=page();const play=progress.mode==='play'||progress.stage==='review';
 return '<main><div class="title-row"><div><p class="eyebrow">'+e(activeId===BUILTIN_ID?'OXFORD READING TREE · LEVEL 1+':'OUR FAMILY STORY')+'</p><h1>'+e(bookTitle())+'<span class="leaf"> ✿</span></h1></div><div class="progress-info"><span>🌱 '+progress.read.length+' / '+lesson.pages.length+' read</span><div class="progress-track"><div style="width:'+progress.read.length/lesson.pages.length*100+'%"></div></div></div></div>'+
 learningPath(play)+'<div class="reader"><section class="book-panel"><div class="page-heading"><span>'+e(progress.stage==='review'?'Our story':progress.page===0?'The beginning':'Page '+(activeId===BUILTIN_ID?progress.page:progress.page+1)+' of '+(activeId===BUILTIN_ID?lastPage():lesson.pages.length))+'</span><span>LOOK · LISTEN · DISCOVER</span></div>'+picture(p)+'<nav class="page-nav" aria-label="翻页">'+btn('←','previous','aria-label="上一页" '+(progress.page===0&&progress.stage==='book'?'disabled':''))+'<div class="page-dots">'+lesson.pages.map((p,i)=>btn('<span class="sr-only">'+(activeId===BUILTIN_ID?(i===0?'封面':'第 '+i+' 页'):'第 '+(i+1)+' 页')+'</span>', 'page','data-page="'+i+'" class="dot '+(i===progress.page?'active':'')+' '+(progress.read.includes(p.page_id)?'read':'')+'" aria-current="'+(i===progress.page?'page':'false')+'"')).join('')+'</div>'+btn('→','next-page','aria-label="下一页或故事复习"')+'</nav></section>'+
 '<aside class="activity-panel"><div class="mode-tabs" role="group" aria-label="阅读模式">'+btn('♫ Read','read','class="'+(!play?'active':'')+'"')+btn('✦ Play','play','class="'+(play?'active':'')+'"')+'</div>'+
 (play?questionCard(q):repeatMode?repeatCard(p):readCard(p))+'</aside></div><footer><span>Made for little explorers · 一起读，慢慢来</span><span>'+(activeId===BUILTIN_ID?'原图与语音已内置 · 播放不消耗云额度':'页面保存在本机 · 可在家长区导入音频')+'</span></footer></main>';
}
function learningPath(play){
 const q=current(),step=repeatMode?1:play?(q?.type==='parent_discussion'||q?.type==='parent_guided'?3:2):0;
 return '<div class="learning-path" aria-label="阅读小路线">'+['听故事','跟着说','找一找','聊一聊'].map((label,i)=>'<span class="'+(i===step?'current':'')+'">'+(i+1)+' '+label+'</span>').join('<i>→</i>')+(dueQuestions().length?btn('🌱 再练 '+Math.min(dueQuestions().length,5)+' 题','practice-review','class="review-link"'):'')+'</div>';
}
function coachNote(){
 if(activeId!==BUILTIN_ID)return '<details class="parent-hint"><summary>给大人的带读提示</summary><p>'+e(page().parent_guide||'一起观察画面，孩子可以用中文、手势或英语回应。')+'</p></details>';
 const tips=['先看封面，猜猜大家准备玩什么。中文回答也可以，再一起听书名。','先听一句，停一下，让孩子指图。不要求马上把整句话说完整。','同一句再听一次，家长做动作，请孩子指一指；愿意跟一个词就很好。','先让孩子自己找，等几秒再帮忙。答错时回到图片里找线索。','把书里的问句当成游戏：家长遮住脸，再问一遍，孩子可以用动作回答。','读完玩一次真实的捉迷藏，把书里的英语带进生活。'];
 return '<details class="parent-hint coach-note"><summary>给大人的带读提示</summary><p>'+tips[progress.page]+'</p><p>每次读 1–2 页也很好；孩子想停时就停，下次会保留进度。</p></details>';
}
function repeatKey(){return 'repeat:'+page().page_id+':'+repeatIndex;}
function recorderBox(key,text){
 const active=recorder.key===key,recording=active&&recorder.state==='recording',asking=active&&recorder.state==='asking',clip=recorder.clips.get(key),rating=pronunciation.get(key);
 return '<div class="recorder"><p class="small">'+(recording?'🔴 正在录音 · 最长 15 秒':asking?'请允许使用麦克风…':clip?'🌱 录好了，听听自己的声音':'愿意的话，录一句自己的声音')+'</p>'+
 (clip?'<div class="pronunciation-result '+e(rating?.level||'')+'" role="status"><strong>'+e(rating?.state==='ready'?rating.title:'Good job!')+'</strong><span>'+e(rating?.state==='ready'?rating.message:rating?.state==='checking'?'正在听你的发音…':rating?.state==='unavailable'?rating.message:'勇敢开口就是进步！')+'</span></div>':'')+
 (recording?btn('■ 说好了','record-stop','class="primary wide"'):btn(asking?'等待麦克风…':clip?'🎙 再录一次':'🎙 我来试试','record-start','data-key="'+e(key)+'" data-text="'+e(text)+'" class="secondary wide" '+(asking?'disabled':'')))+
 (clip?'<div class="audio-options">'+btn('▶ 听听我','record-play','data-key="'+e(key)+'" class="quiet" '+(recording||asking?'disabled':''))+btn('删除录音','record-clear','data-key="'+e(key)+'" class="quiet small"')+'</div>':'')+
 (active&&recorder.error?'<p class="record-error" role="status">'+e(recorder.error)+'</p>':'')+
 '<p class="small muted">录音只在本页临时保存。联网且评测服务可用时，会发送录音和这句英文给腾讯云口语评测；结果仅供练习参考。</p></div>';
}
function repeatCard(p){
 repeatIndex=Math.min(repeatIndex,p.read_aloud.segments.length-1);const segment=p.read_aloud.segments[repeatIndex];
 return '<div class="card-content"><p class="eyebrow">MY LITTLE VOICE · '+(repeatIndex+1)+' / '+p.read_aloud.segments.length+'</p><h2>Say it with me</h2><p class="muted small">听一句，跟着试一句。</p><div class="sentences"><p>'+e(segment.text)+'</p></div>'+
 (repeatCue?'<p class="repeat-cue" role="status">🌟 听完啦，轮到你！点下面的麦克风，跟着说一句。</p>':'')+
 btn('♫ 先听一遍','repeat-model','class="primary wide"')+recorderBox(repeatKey(),segment.text)+
 btn(repeatIndex<p.read_aloud.segments.length-1?'试过了，下一句 →':'试过了，去找一找 →','repeat-next','class="secondary wide"')+btn('回到听故事','repeat-back','class="quiet small"')+coachNote()+'</div>';
}
function practiceSummary(isParent){
 const latest=latestResults(history),due=dueQuestions();
 const counts={};for(const x of latest)counts[x.result]=(counts[x.result]||0)+1;
 const next=latest.filter(x=>x.dueAt>Date.now()).sort((a,b)=>a.dueAt-b.dueAt)[0];
 return '<section class="learning-summary"><h3>这一程的小脚印</h3><div class="learning-metrics"><span><b>'+ (counts.independent||0)+'</b>独立完成</span><span><b>'+((counts.retried||0)+(counts.together||0))+'</b>重试 / 一起完成</span><span><b>'+(counts.participated||0)+'</b>跟读 / 讨论</span></div><p class="small muted">这里记录参与情况，不代表词汇掌握或发音成绩。</p>'+
 (due.length?btn('🌱 再练 '+Math.min(due.length,5)+' 题','practice-review','class="secondary"'):'<p class="small">现在不用赶着练更多。'+(next?'下次复习：'+new Date(next.dueAt).toLocaleDateString('zh-CN'):'下次回来继续故事。')+'</p>')+
 (isParent?'<p class="small muted">客观题独立完成后，按 1、3、7 天安排再次见面；需要提示的题目优先再练。每轮最多 5 题。</p><ul class="learning-list">'+latest.slice(-8).reverse().map(x=>'<li><span>'+e(x.prompt)+'</span><small>'+e(resultLabel(x.result))+'</small></li>').join('')+'</ul>'+btn('导出学习记录','learning-export','class="quiet"'):'')+'</section>';
}
function soundPanel(){
 return '<details class="sound-panel"><summary>声音测试与排查</summary><p class="small muted">先测试书名。听不到时，检查标签页是否静音、系统音量和输出设备。播放完成只代表浏览器已处理音频，不能检测扬声器是否出声。</p>'+btn('♫ 测试声音','sound-test','class="secondary"')+btn('查看诊断','sound-details','class="quiet"')+btn('导出诊断','sound-export','class="quiet"')+'<pre id="sound-details">点击测试声音后查看结果。</pre></details>';
}
function assessmentPanel(){
 return '<details class="sound-panel"><summary>孩子跟读反馈</summary><p class="small muted">联网时，录音和当前英文句子会送到腾讯云口语评测。口令只保存在这台设备，不写入绘本或导出文件。断网时仍可录音和听回放。</p><p class="small">'+(pronunciationConfig.endpoint?'评测服务已接入':'评测服务正在配置')+'</p><label>家长评测口令<input id="assessment-token" type="password" autocomplete="off" value="'+e(assessmentToken)+'" placeholder="在此设备上设置口令"></label>'+btn('保存口令','save-assessment-token','class="secondary"')+'<p id="assessment-message" class="small" role="status"></p></details>';
}
function updateSoundDetails(){const el=document.querySelector('#sound-details');if(el)el.textContent=JSON.stringify(audio.diagnostics(),null,2);}

function readCard(p){
 return '<div class="card-content"><p class="eyebrow">LET’S READ TOGETHER</p><h2>'+(progress.page===0?'Ready for<br>a new story?':'Look. Listen.<br>Read with me.')+'</h2><div class="sentences">'+p.read_aloud.segments.map(s=>'<p>'+e(s.text)+'</p>').join('')+'</div>'+btn('▶ Listen','listen','class="primary wide"')+'<div class="audio-options">'+btn('■ Stop','stop','class="quiet small"')+btn(audio.slow?'🐢 Slow ✓':'🐢 Slow','slow','class="quiet small" aria-pressed="'+audio.slow+'"')+'</div><p class="audio-note">'+(activeId===BUILTIN_ID?'腾讯云 AI 合成语音 · 原版录音可优先替换':'新书需配对应音频；也可以先由家长带读。')+'</p>'+btn('✓ We read together','read-together','class="secondary wide"')+'<div class="divider"></div><p class="muted small">读完了？找一找画面里的小秘密。</p>'+btn('跟着说一句 →','repeat-start','class="secondary wide" '+(!p.read_aloud.segments.length?'disabled':''))+btn('Let’s play →','play','class="text-button"')+coachNote(p)+'</div>';
}
function questionCard(q){
 if(!q)return '<div class="card-content"><h2>All explored!</h2><p>这一组暂时没有已审核的题目。</p>'+btn('Next page →','next-page','class="primary"')+'</div>';
 const all=questions();const point=q.type==='point_and_find',choice=q.type==='multiple_choice',talk=!point&&!choice;
 let answers='';
 if(choice)answers='<div class="choices">'+q.choices.map(c=>'<div class="choice-row">'+btn('<span class="choice-emoji">'+e(c.emoji||({'Yes':'🙌','No':'🙈','Happy':'😊','Sad':'😔','Sleepy':'😴','A box':'📦','A boat':'⛵','A bed':'🛏️','Dad':'👨','A cat':'🐱','Hide and seek':'🙈','Football':'⚽','Drawing':'🎨','Hiding':'🙈','Eating':'🍎','Sleeping':'💤'}[c.text])||'◯')+'</span><span>'+e(c.text)+'</span>','answer','data-answer="'+e(c.id)+'" class="choice '+(hint&&q.correct_answer===c.id?'suggested':'')+'" '+(solved?'disabled':''))+btn('♫','choice-audio','data-text="'+e(c.text)+'" aria-label="听选项 '+e(c.text)+'" class="choice-listen"')+'</div>').join('')+'</div>';
 if(point)answers='<div class="tap-hint"><span>☝</span><p>Point to the picture</p><small>点一点，找到它</small></div>';
 if(talk)answers='<div class="talk-icon">'+(q.type==='listen_and_repeat'?'🗣️':'💬')+'</div><p class="muted">'+(q.type==='listen_and_repeat'?'听一听，愿意的话跟着说。':'和爸爸妈妈聊一聊，用中文也可以。')+'</p>'+(q.type==='listen_and_repeat'?recorderBox(q.activity_id,q.tts||q.prompt):'');
 return (progress.practiceIds?.length?'<div class="practice-tag">🌱 再见一次 · 最多 5 题</div>':'<div class="question-filters">'+btn('All','filter','data-filter="all" class="'+(progress.filter==='all'?'selected':'')+'"')+btn('Word Questions','filter','data-filter="word" class="'+(progress.filter==='word'?'selected':'')+'"')+btn('Story Questions','filter','data-filter="story" class="'+(progress.filter==='story'?'selected':'')+'"')+'</div>')+'<div class="card-content"><div class="question-meta"><span>'+(progress.stage==='review'?'STORY REVIEW':point?'POINT & FIND':talk?'TALK TOGETHER':q.category==='word'?'WORD PLAY':'STORY TIME')+'</span><span>'+ (progress.index+1)+' / '+all.length+'</span></div><h2 class="question-title">'+e(q.prompt)+'</h2>'+btn('♫ Listen again','question-audio','class="listen-question"')+answers+'<div class="feedback '+(solved?'success':'')+'" role="status" aria-live="polite">'+e(feedback)+'</div>'+(solved?btn('Next →','next-question','class="primary wide"'):talk?btn(q.type==='listen_and_repeat'?'We tried it ✓':'We talked about it ✓','talk-done','class="primary wide"'):hint?btn('Let’s do it together ✓','help-done','class="secondary wide"'):'')+'<details class="parent-hint"><summary>给家长的小提示</summary><p>'+e(q.parent_note||'先听一遍，再指一指。')+'</p></details></div>';
}
let aiPreview=null,aiController=null;
async function openEpisode(id){
 const record=id===BUILTIN_ID?null:await getEpisode(id);if(id!==BUILTIN_ID&&!record)throw Error('这一集不存在。');
 const nextStorage=storageFor(id),overrides=stored(nextStorage+'-lesson');
 const candidate=overrides&&validateLesson(overrides,{draft:record?.status==='draft'}).length===0?overrides:(record?.lesson||base);
 const errors=validateLesson(candidate,{draft:record?.status==='draft'});if(errors.length)throw Error(errors.join('；'));
 const sources=await resolveImages(candidate);
 audio.stop();recorder.cancel();if(id!==activeId){recorder.clips.clear();recorder.key='';recorder.error='';}revokeImages(imageSources);
 activeId=id;STORAGE=nextStorage;activeRecord=record;lesson=structuredClone(candidate);imageSources=sources;audio.scope=id===BUILTIN_ID?'':id+':';
 progress=normalizeProgress(stored(STORAGE+'-progress'),lesson);history=stored(STORAGE+'-learning')||[];if(!Array.isArray(history))history=[];
 feedback='';attempts=0;solved=false;hint=false;repeatMode=false;repeatIndex=0;libraryOpen=false;parent=record?.status==='draft';draft=parent?structuredClone(lesson):null;ep=ea=eh=0;aiPreview=null;
 try{localStorage.setItem('story-garden-active',JSON.stringify(id));}catch{notice='浏览器无法保存当前书架位置。';}
 render();
}
async function saveCurrentDraft(){
 if(!activeRecord)return;
 const errors=validateLesson(draft,{draft:true});if(errors.length)throw Error(errors.join('；'));
 const changed=JSON.stringify(draft)!==JSON.stringify(lesson);
 const nextRecord={...activeRecord,title:draft.book.title,lesson:structuredClone(draft),status:changed?'draft':activeRecord.status};
 await saveEpisode(nextRecord);activeRecord=nextRecord;localStorage.setItem(STORAGE+'-lesson',JSON.stringify(draft));lesson=structuredClone(draft);editorMessage('草稿已保存到书架，可以下次继续。');
}
function pageTextEditor(p){
 return '<h3>本页正文</h3><label>每句一行<textarea id="page-body" rows="4" placeholder="填写图片中的英文正文">'+e(p.read_aloud.segments.map(x=>x.text).join('\n'))+'</textarea></label><label><input id="page-silent" type="checkbox" '+(p.read_aloud.silent?'checked':'')+'>这一页没有正文，只看图和聊天</label><label>给家长的带读提示<textarea id="page-guide" rows="2">'+e(p.parent_guide||'')+'</textarea></label>'+(p.generation_notes?.length?'<p class="notice">AI 提醒：'+p.generation_notes.map(e).join('；')+'</p>':'')+'<div class="divider"></div>';
}
function episodeControls(){
 return '<section class="episode-settings"><label>本集名称<input id="episode-name" value="'+e(draft.book?.title||'')+'" maxlength="100"></label><div class="editor-toolbar">'+(activeRecord?btn('保存草稿','save-draft','class="secondary"'):'')+btn('AI 生成正文、问题与热点','ai-preview','class="secondary"')+'</div><p class="small muted">AI 生成内容全部待审核；新的正文需导入对应音频或后续生成语音，不会自动使用别的书的整页录音。</p><div id="ai-panel">'+(aiBusy?'<p role="status">正在生成，完成前不能修改课程。</p>'+btn('取消生成','ai-cancel','class="quiet"'):'')+'</div></section>';
}
async function showAiPreview(){
 audio.stop();recorder.cancel();
 try{
  aiPreview=await aiStatus();const panel=document.querySelector('#ai-panel');
  if(!aiPreview.configured){panel.innerHTML='<p class="notice">尚未配置视觉 AI 服务。可以先导入、保存和编辑草稿，选好服务后再生成。</p>';return;}
  panel.innerHTML='<div class="ai-confirm"><p><b>确认本次发送</b></p><p>服务：'+e(aiPreview.provider)+'<br>地址：'+e(aiPreview.baseUrl)+'<br>模型：'+e(aiPreview.model)+'</p><p>本集「'+e(draft.book.title)+'」全部 '+draft.pages.length+' 页图片、提取的正文、书名及教学要求。不会发送孩子录音或学习记录。</p><p class="small muted">每页一次请求，最多输出 4096 tokens。按所选服务计费；不会自动重试，取消不撤销已经发生的调用费用。生成失败时保留原草稿。</p><label><input id="ai-consent" type="checkbox">我已确认服务与发送范围</label>'+btn('确认并生成 '+draft.pages.length+' 页','ai-generate','class="primary"')+'</div>';
  panel.querySelector('[data-action="ai-generate"]').onclick=()=>runAiGeneration();
 }catch(error){editorMessage(error.message);}
}
async function runAiGeneration(){
 if(aiBusy||!aiPreview?.configured)return;
 if(!document.querySelector('#ai-consent')?.checked){editorMessage('请先勾选确认服务与发送范围。');return;}
 aiBusy=true;aiController=new AbortController();const request=structuredClone(draft);render();
 root.querySelectorAll('input,select,textarea,button').forEach(el=>{if(el.dataset.action!=='ai-cancel')el.disabled=true;});
 try{
  const generated=await generateEpisode(request,aiPreview,text=>editorMessage(text),aiController.signal);
  draft=generated;ea=eh=0;if(activeRecord)await saveCurrentDraft();aiBusy=false;render();editorMessage('AI 草稿已生成。请逐页核对正文、热点和问题，勾选审核后再发布。');
 }catch(error){aiBusy=false;render();editorMessage(error.name==='AbortError'?'已取消，原草稿保留；已经发生的服务调用可能计费。':error.message);}
 finally{aiBusy=false;aiController=null;}
}

function editorPage(){return ep===draft.pages.length?draft.pages.at(-1):draft.pages[ep];}
function editorActivities(){return ep===draft.pages.length?draft.review:editorPage().activities;}
function editor(){
 const p=editorPage(),list=editorActivities();ea=Math.min(ea,Math.max(0,list.length-1));eh=Math.min(eh,Math.max(0,p.hotspots.length-1));const a=list[ea],h=p.hotspots[eh];
 return '<main class="parent-main"><div class="title-row"><div><p class="eyebrow">PARENT STUDIO</p><h1>陪孩子，读得刚刚好</h1><p class="muted">审核问题、校准热点、导入声音。修改保存在这台设备上。</p></div>'+btn(activeId===BUILTIN_ID?'保存并应用':'审核后发布这一集','save-editor','class="primary"')+'</div>'+episodeControls()+'<div id="editor-message" role="status"></div><div class="editor-toolbar"><label>编辑页面 <select id="edit-page">'+draft.pages.map((p,i)=>'<option value="'+i+'" '+(i===ep?'selected':'')+'>'+e(activeId===BUILTIN_ID?(i===0?'封面':'故事第 '+i+' 页'):'第 '+(i+1)+' 页')+'</option>').join('')+'<option value="'+draft.pages.length+'" '+(ep===draft.pages.length?'selected':'')+'>全书复习 / 亲子讨论</option></select></label>'+btn('导出 Lesson JSON','export','class="secondary"')+'<label class="file-label">导入 Lesson JSON<input type="file" id="import-lesson" accept=".json,application/json"></label></div><div class="editor-grid"><section class="book-panel">'+picture(p,true)+'<div class="editor-padding"><p>选择热点后，在图上拖出新矩形即可校准。坐标按整张原图归一化。</p><label>热点 <select id="edit-hotspot">'+p.hotspots.map((h,i)=>'<option value="'+i+'" '+(i===eh?'selected':'')+'>'+e(h.label)+'</option>').join('')+'</select></label>'+ (h?'<label>名称<input id="hotspot-label" value="'+e(h.label)+'"></label><div class="coordinates">'+h.bbox.map((n,i)=>'<label>'+['X','Y','宽','高'][i]+'<input type="number" min="0" max="1" step="0.01" data-coordinate="'+i+'" value="'+n+'"></label>').join('')+'</div>':'')+btn('+ 添加热点','add-hotspot','class="secondary"')+'<div class="divider"></div>'+voiceStudio()+soundPanel()+assessmentPanel()+'<h3>导入原版录音</h3>'+audioSelect(a,p)+'<p class="small muted">支持 MP3 / WAV / M4A / OGG，最大 30 MB。只存入本机浏览器，不上传。整页朗读优先使用这个文件。</p><label class="file-label">选择音频文件<input id="import-audio" type="file" accept="audio/*,.mp3,.wav,.m4a,.ogg"></label><p id="original-status" class="small"></p>'+btn('试听所选音频','preview-original','class="secondary"')+btn('移除所选音频','remove-original','class="quiet"')+'</div></section><section class="editor-form">'+pageTextEditor(p)+'<label>问题 <select id="edit-activity">'+list.map((a,i)=>'<option value="'+i+'" '+(i===ea?'selected':'')+'>'+e((a.reviewed===false?'待审核 · ':'')+a.prompt)+'</option>').join('')+'</select></label>'+ (a?'<label>英文问题<input id="edit-prompt" value="'+e(a.prompt)+'"></label><label>给家长的中文提示<textarea id="edit-note" rows="3">'+e(a.parent_note||'')+'</textarea></label><div class="checks"><label><input type="checkbox" id="edit-enabled" '+(a.enabled!==false?'checked':'')+'> 保留 / 启用</label><label><input type="checkbox" id="edit-reviewed" '+(a.reviewed!==false?'checked':'')+'> 已审核，儿童可见</label></div><p class="small muted">题型：'+e(a.type)+'</p>'+(a.type==='multiple_choice'?'<fieldset><legend>选项与正确答案</legend>'+a.choices.map((c,i)=>'<label class="option-edit"><input type="radio" name="correct" data-correct="'+i+'" '+(a.correct_answer===c.id?'checked':'')+'><input data-choice="'+i+'" value="'+e(c.text)+'"></label>').join('')+'</fieldset>':'')+(a.type==='point_and_find'?'<label>正确热点<select id="edit-target">'+p.hotspots.map(h=>'<option value="'+e(h.id)+'" '+(a.target_hotspots.includes(h.id)?'selected':'')+'>'+e(h.label)+'</option>').join('')+'</select></label>':'')+btn('删除这道题','delete-activity','class="quiet"'):'<p>本页暂无问题，可以新增。</p>')+'<div class="divider"></div><label>新增题型<select id="new-type"><option value="multiple_choice">选择题</option><option value="point_and_find">Point & Find</option><option value="parent_discussion">亲子讨论</option></select></label>'+btn('+ 新增待审核问题','add-activity','class="secondary"')+'<div class="divider"></div><p class="small muted">编辑会即时更新草稿；点击页面顶部的保存 / 发布按钮后进入儿童课程。新增题目需勾选「已审核」。退出时可选择保存或放弃。</p><p class="small muted">原版音频单独保存在浏览器，不包含在导出的 JSON 中。课程和进度可导出备份，清理浏览器数据会删除本机记录。</p>'+btn('导出进度','export-progress','class="quiet"')+practiceSummary(true)+'</section></div></main>';
}
function voiceStudio(){
 return '<h3>选择讲故事的声音</h3><p class="small muted">内置声音包适用于 Hide and Seek 的已有文本，新增正文需另配音频。AI 合成声音，非出版社原版录音；试听不调用云服务。</p>'+
 (voiceConfig.voices.length?'<label>全书声音<select id="voice-pack">'+voiceConfig.voices.map(v=>'<option value="'+e(v.id)+'" '+(v.id===selectedVoice?'selected':'')+'>'+e(v.name)+'</option>').join('')+'</select></label>':'<p class="small muted">完整语音包正在准备，先听下面的样本。</p>')+
 '<div class="voice-previews">'+voicePreviews.map((v,i)=>btn('♫ '+e(v.name),'voice-preview','data-preview="'+i+'" class="secondary"')).join('')+btn('■ 停止试听','stop','class="quiet"')+'</div><p class="small muted">试听内容：Can you see me? Can you find the box? You found me!</p><div class="divider"></div>';
}
async function selectVoice(id){
 const config=voiceConfig.voices.find(v=>v.id===id);if(!config)return;
 const ticket=++voiceLoadToken;audio.stop();
 try{
  const response=await fetch(siteAsset(config.manifest));
  if(!response.ok)throw Error('语音包暂不可用');
  const mapping=await response.json();
  if(ticket!==voiceLoadToken)return;
  if(!Object.keys(mapping).length||Object.values(mapping).some(v=>typeof v!=='string'||!v.startsWith('/audio/')))throw Error('语音包格式无效');
  audio.setVoice(mapping,config.name);selectedVoice=id;
  try{localStorage.setItem(STORAGE+'-voice',id);}catch{editorMessage('声音已切换，但浏览器无法保存该选择。');return;}
  editorMessage('已切换为 '+config.name+'，已保存。可返回绘本点击 Listen。');
 }catch(err){if(ticket===voiceLoadToken){const select=document.querySelector('#voice-pack');if(select)select.value=selectedVoice;editorMessage(err.message);}}
}
function audioKey(){return document.querySelector('#audio-target')?.value||editorPage().page_id;}
function audioSelect(a,p){
 const texts=[...(a?[a.tts||a.prompt,...(a.choices||[]).map(c=>c.text),...Object.values(a.feedback||{})]:[]),...p.hotspots.map(h=>h.label)];
 return '<label>音频用途<select id="audio-target"><option value="'+e(p.page_id)+'">本页完整朗读（优先播放）</option>'+[...new Set(texts)].map(t=>'<option value="'+e('speech:narrator|'+t)+'">'+e(t)+'</option>').join('')+'</select></label>';
}
function exportJson(value,name){const u=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
function editorMessage(t){const el=document.querySelector('#editor-message');if(el)el.textContent=t;}
async function dispatch(action,b){
 if(aiBusy&&action!=='ai-cancel')return;
 switch(action){
 case 'library':audio.stop();recorder.cancel();if(parent&&activeRecord&&draft)await saveCurrentDraft();if(parent&&!activeRecord&&draft&&JSON.stringify(draft)!==JSON.stringify(lesson)){editorMessage('请先保存并应用修改，再返回书架。');return;}libraryOpen=true;render();await shelf.refresh();break;
 case 'save-draft':await saveCurrentDraft();break;
 case 'ai-preview':await showAiPreview();break;
 case 'ai-generate':await runAiGeneration();break;
 case 'ai-cancel':aiController?.abort();break;
 case 'enable-audio':{audio.stop();const ok=await audio.unlock();audio.statusText(ok?'声音已开启，点 Listen 听故事。如果仍听不到，请检查标签页静音和系统音量。':'请再点 Listen；若仍无声，请在家长区测试声音。');break;}
 case 'sound-test':await audio.play(page().read_aloud.segments);updateSoundDetails();break;
 case 'sound-details':updateSoundDetails();break;
 case 'sound-export':exportJson(audio.diagnostics(),'sound-diagnostics.json');break;
 case 'save-assessment-token':{
  assessmentToken=document.querySelector('#assessment-token')?.value.trim()||'';
  try{if(assessmentToken)localStorage.setItem('story-garden-assessment-token',assessmentToken);else localStorage.removeItem('story-garden-assessment-token');document.querySelector('#assessment-message').textContent=assessmentToken?'已保存在这台设备。':'已清除口令。';}
  catch{document.querySelector('#assessment-message').textContent='这台设备未能保存口令。';}
  break;
 }
 case 'repeat-start':if(!page().read_aloud.segments.length)return;audio.stop();repeatMode=true;repeatIndex=0;repeatCue=false;render();break;
 case 'repeat-model':if(recorder.state!=='idle'){recorder.cancel();render();}audio.play([page().read_aloud.segments[repeatIndex]],{onComplete:()=>{if(repeatMode&&!parent&&!libraryOpen){repeatCue=true;render();}}});break;
 case 'repeat-back':recorder.cancel();audio.stop();repeatMode=false;render();break;
 case 'repeat-next':{
  logResult({activity_id:repeatKey(),prompt:page().read_aloud.segments[repeatIndex].text,type:'listen_and_repeat'},{attempts:0,assisted:false});
  recorder.cancel();audio.stop();
  if(repeatIndex<page().read_aloud.segments.length-1){repeatIndex++;repeatCue=false;render();audio.play([page().read_aloud.segments[repeatIndex]],{onComplete:()=>{if(repeatMode&&!parent&&!libraryOpen){repeatCue=true;render();}}});}
  else change(()=>{progress.mode='play';progress.index=0;progress.filter='all';});
  break;
 }
 case 'record-start':audio.stop();recordTargets.set(b.dataset.key,b.dataset.text);pronunciation.delete(b.dataset.key);await recorder.start(b.dataset.key);break;
 case 'record-stop':recorder.stop();break;
 case 'record-play':{const clip=recorder.clips.get(b.dataset.key);if(clip)audio.play([],{urls:[clip],localRecording:true});break;}
 case 'record-clear':audio.stop();pronunciation.delete(b.dataset.key);recorder.clear(b.dataset.key);break;
 case 'practice-review':if(parent){if(JSON.stringify(draft)!==JSON.stringify(lesson)){editorMessage('请先保存编辑，再进入复习。');break;}parent=false;draft=null;}startReview();break;
 case 'learning-export':exportJson({generatedAt:new Date().toISOString(),progress,history,notice:'本机练习记录，不是语言能力或发音评测。'},'hide-and-seek.learning.json');break;

 case 'voice-preview':{const v=voicePreviews[Number(b.dataset.preview)];if(v)audio.play([],{urls:[v.src],label:v.name});break;}
 case 'parent':audio.stop();recorder.cancel();if(libraryOpen)libraryOpen=false;if(activeRecord?.status==='draft'&&parent){editorMessage('草稿需先审核发布，或点击书架返回。');return;}if(parent){if(JSON.stringify(draft)!==JSON.stringify(lesson)&&!confirm('放弃尚未保存的问题与热点修改？音频导入已单独保存。'))return;const sources=await resolveImages(lesson);revokeImages(imageSources);imageSources=sources;parent=false;draft=null;}else{parent=true;draft=structuredClone(lesson);ep=progress.page;ea=0;eh=0;}render();break;
 case 'page':change(()=>{progress.page=Number(b.dataset.page);progress.stage='book';progress.mode='read';progress.index=0;progress.filter='all';});break;
 case 'previous':change(()=>{progress.page=Math.max(0,progress.page-1);progress.stage='book';progress.mode='read';progress.index=0;});break;
 case 'next-page':nextPage();break;
 case 'read':change(()=>{progress.mode='read';progress.stage='book';});break;
 case 'play':change(()=>{progress.mode='play';progress.index=0;progress.filter='all';});break;
 case 'filter':change(()=>{progress.filter=b.dataset.filter;progress.index=0;});break;
 case 'listen':listenToPage();break;
 case 'stop':audio.stop();break;
 case 'slow':audio.slow=!audio.slow;if(audio.audio)audio.audio.playbackRate=audio.slow?.82:1;b.setAttribute('aria-pressed',String(audio.slow));b.textContent=audio.slow?'🐢 Slow ✓':'🐢 Slow';break;
 case 'read-together':markRead();break;
 case 'question-audio':speak(current().tts||current().prompt);break;
 case 'choice-audio':speak(b.dataset.text);break;
 case 'answer':answer(b.dataset.answer===current().correct_answer);break;
 case 'talk-done':case 'help-done':recorder.cancel();finishAnswer(action==='help-done');break;
 case 'next-question':nextQuestion();break;
 case 'restart':change(()=>{progress=freshProgress();});break;
 case 'browse':change(()=>{progress.stage='book';progress.mode='read';progress.page=0;});break;
 case 'save-editor':{
  const errors=[...(!draft.book?.title?.trim()?['请填写本集名称。']:[]),...publicationProblems(draft),...validateLesson(draft)];if(errors.length){editorMessage(errors.join('；'));return;}
  try{if(activeRecord){const nextRecord={...activeRecord,lesson:structuredClone(draft),title:draft.book.title,status:'published'};await saveEpisode(nextRecord);activeRecord=nextRecord;}localStorage.setItem(STORAGE+'-lesson',JSON.stringify(draft));lesson=structuredClone(draft);progress=normalizeProgress(progress,lesson);persist();editorMessage('已保存并发布。只有已审核且启用的问题会出现在儿童课程中。');}catch{editorMessage('无法保存，可能空间不足。请先导出 JSON 备份。');}break;
 }
 case 'export':exportJson(draft,'hide-and-seek.lesson.json');break;
 case 'export-progress':exportJson({progress,history},'hide-and-seek.progress.json');break;
 case 'delete-activity':editorActivities().splice(ea,1);ea=0;render();break;
 case 'add-activity':{
  const type=document.querySelector('#new-type').value,p=editorPage();if(type==='point_and_find'&&(ep===draft.pages.length||!p.hotspots.length)){editorMessage('请先在故事页添加热点；全书复习支持选择题或亲子讨论。');return;}
  const a={activity_id:'custom_'+Date.now(),category:type==='point_and_find'?'word':'story',type,prompt:'Can you see it?',tts:'Can you see it?',enabled:true,reviewed:false,parent_note:'',feedback:{correct:'Well done!',retry:"Let's look again."}};
  if(type==='multiple_choice'){a.choices=[{id:'a',text:'Yes',emoji:'🙌'},{id:'b',text:'No',emoji:'🙈'}];a.correct_answer='a';}
  if(type==='point_and_find')a.target_hotspots=[p.hotspots[0].id];
  editorActivities().push(a);ea=editorActivities().length-1;render();break;
 }
 case 'add-hotspot':editorPage().hotspots.push({id:'spot_'+Date.now(),label:'new object',bbox:[.3,.3,.2,.2]});eh=editorPage().hotspots.length-1;render();break;
 case 'preview-original':{const key=audioKey();if(key.startsWith('speech:'))speak(key.slice('speech:narrator|'.length));else audio.play(editorPage().read_aloud.segments,{pageId:key});break;}
 case 'remove-original':audio.stop();await courseAudio(audioKey(),null);await showOriginal();break;
 }
}
function bind(){
 root.querySelectorAll('[data-action]').forEach(b=>b.addEventListener('click',()=>dispatch(b.dataset.action,b).catch(err=>{notice='操作未完成：'+err.message;render();})));
 const pic=document.querySelector('#picture');if(pic)pic.addEventListener('click',event=>{
  if(progress.stage!=='book'&&!progress.practiceIds?.length)return;
  const r=pic.getBoundingClientRect();let pt={x:(event.clientX-r.left)/r.width,y:(event.clientY-r.top)/r.height};
  const hotspot=event.target.closest('[data-hotspot]');if(event.detail===0&&hotspot){const h=page().hotspots[Number(hotspot.dataset.hotspot)];pt={x:h.bbox[0]+h.bbox[2]/2,y:h.bbox[1]+h.bbox[3]/2};}
  if(progress.mode==='play'&&current()?.type==='point_and_find')answer(hitTarget(page(),current(),pt));
  else if(progress.mode==='read'){const h=page().hotspots.filter(h=>inside(pt,h.bbox)).sort((a,b)=>a.bbox[2]*a.bbox[3]-b.bbox[2]*b.bbox[3])[0];if(h)speak(h.label);}
 });
}
async function showOriginal(){const el=document.querySelector('#original-status');if(!el)return;try{const blob=await courseAudio(audioKey());if(el.isConnected)el.textContent=blob?'已导入 · '+(blob.name||'本页音频')+' · '+Math.round(blob.size/1024)+' KB':'尚未导入所选音频';}catch{el.textContent='此浏览器无法保存音频，请使用普通浏览窗口。';}}
function bindEditor(){
 const on=(id,type,fn)=>document.getElementById(id)?.addEventListener(type,fn);
 on('episode-name','input',ev=>{draft.book.title=ev.target.value;});
 on('page-body','input',ev=>{editorPage().read_aloud.segments=splitText(ev.target.value);});
 on('page-silent','change',ev=>{editorPage().read_aloud.silent=ev.target.checked;});
 on('page-guide','input',ev=>{editorPage().parent_guide=ev.target.value;});
 on('voice-pack','change',ev=>selectVoice(ev.target.value));
 on('edit-page','change',ev=>{audio.stop();ep=Number(ev.target.value);ea=eh=0;render();});
 on('edit-activity','change',ev=>{ea=Number(ev.target.value);render();});
 on('edit-hotspot','change',ev=>{eh=Number(ev.target.value);render();});
 on('edit-prompt','input',ev=>{const a=editorActivities()[ea];a.prompt=a.tts=ev.target.value;});
 on('edit-note','input',ev=>editorActivities()[ea].parent_note=ev.target.value);
 on('edit-enabled','change',ev=>editorActivities()[ea].enabled=ev.target.checked);
 on('edit-reviewed','change',ev=>editorActivities()[ea].reviewed=ev.target.checked);
 on('edit-target','change',ev=>editorActivities()[ea].target_hotspots=[ev.target.value]);
 root.querySelectorAll('[data-choice]').forEach(el=>el.oninput=()=>editorActivities()[ea].choices[Number(el.dataset.choice)].text=el.value);
 root.querySelectorAll('[data-correct]').forEach(el=>el.onchange=()=>editorActivities()[ea].correct_answer=editorActivities()[ea].choices[Number(el.dataset.correct)].id);
 on('hotspot-label','input',ev=>editorPage().hotspots[eh].label=ev.target.value);
 root.querySelectorAll('[data-coordinate]').forEach(el=>el.onchange=()=>{editorPage().hotspots[eh].bbox[Number(el.dataset.coordinate)]=Number(el.value);render();});
 on('import-lesson','change',async ev=>{try{const file=ev.target.files[0];if(!file)return;if(file.size>4e6)throw Error('JSON 文件过大');const value=JSON.parse(await file.text());const errors=validateLesson(value,{draft:!!activeRecord});if(errors.length)throw Error(errors.join('；'));const sources=await resolveImages(value);revokeImages(imageSources);imageSources=sources;draft=value;ep=ea=eh=0;render();editorMessage('已导入草稿，请检查后保存。');}catch(err){editorMessage('导入失败：'+err.message);}});
 on('audio-target','change',()=>{audio.stop();showOriginal();});
 on('import-audio','change',async ev=>{
  const file=ev.target.files[0];if(!file)return;const id=audioKey();
  if(file.size>30*1024*1024){editorMessage('音频不能超过 30 MB。');return;}
  const url=URL.createObjectURL(file),probe=new Audio();probe.preload='metadata';probe.src=url;
  try{await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('无法读取音频')),10000);probe.onloadedmetadata=()=>{clearTimeout(timer);resolve();};probe.onerror=()=>{clearTimeout(timer);reject(Error('浏览器不支持或文件不是有效音频'));};});await courseAudio(id,file);await showOriginal();editorMessage('音频已保存在本机，可点击试听。');}catch(err){editorMessage('音频导入失败：'+err.message);}finally{probe.src='';URL.revokeObjectURL(url);}
 });
 const pic=document.querySelector('#editor-picture');
 const coords=ev=>{const r=pic.getBoundingClientRect();return {x:Math.max(0,Math.min(1,(ev.clientX-r.left)/r.width)),y:Math.max(0,Math.min(1,(ev.clientY-r.top)/r.height))};};
 pic.onpointerdown=ev=>{if(!editorPage().hotspots.length)return;drag={...coords(ev),id:ev.pointerId};pic.setPointerCapture(ev.pointerId);ev.preventDefault();};
 pic.onpointermove=ev=>{if(!drag)return;const end=coords(ev);const b=[Math.min(drag.x,end.x),Math.min(drag.y,end.y),Math.abs(end.x-drag.x),Math.abs(end.y-drag.y)];document.querySelector('#draw-box').style.cssText=boxStyle(b)+'display:block';};
 pic.onpointerup=ev=>{if(!drag)return;const end=coords(ev);const b=[Math.min(drag.x,end.x),Math.min(drag.y,end.y),Math.abs(end.x-drag.x),Math.abs(end.y-drag.y)];drag=null;if(b[2]>.01&&b[3]>.01)editorPage().hotspots[eh].bbox=b.map(n=>Number(n.toFixed(4)));render();};
 pic.onpointercancel=()=>{drag=null;document.querySelector('#draw-box').style.display='none';};
 showOriginal();
}
const remembered=stored('story-garden-active');if(typeof remembered==='string'&&remembered!==BUILTIN_ID){try{await openEpisode(remembered);}catch{notice='上次的课程无法打开，已返回示例绘本。';}}
render();
if(document.querySelector('meta[name="story-static"]')&&'serviceWorker' in navigator){
 navigator.serviceWorker.register(siteAsset('/sw.js'),{scope:siteAsset('/'),updateViaCache:'none'}).catch(()=>{});
}




