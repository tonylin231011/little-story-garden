import json
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1]
BASE='http://127.0.0.1:4173'
lesson=json.loads((ROOT/'public/lesson.json').read_text(encoding='utf-8'))
checks=[]
def passed(s): checks.append(s); print('PASS '+s,flush=True)
def click(page,action): page.locator('[data-action="'+action+'"]').first.click()
def sounding(page): page.wait_for_function('window.sourcePlaying && window.lastContext.state === "running"')
def fresh(browser,**options):
 context=browser.new_context(viewport={'width':1360,'height':1000},bypass_csp=True,**options)
 context.add_init_script((ROOT/'tests/audio_probe.js').read_text(encoding='utf-8'))
 page=context.new_page()
 page.goto(BASE);page.wait_for_selector('[data-action="listen"]')
 return context,page
with sync_playwright() as pw:
 browser=pw.chromium.launch(headless=True,args=['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream'])
 context,page=fresh(browser,permissions=['microphone'])
 errors=[];external=[];requests=[]
 page.on('pageerror',lambda error:errors.append(str(error)))
 page.on('request',lambda r:requests.append(r.url))
 page.on('request',lambda r:external.append(r.url) if not r.url.startswith((BASE,'blob:')) else None)
 click(page,'listen');sounding(page)
 assert 'AI' in page.locator('#audio-status').inner_text()
 page.wait_for_function("document.querySelector('.progress-info').textContent.includes('1 / 6')")
 assert any(url.endswith('.wav') for url in requests)
 passed('Bundled PCM cover plays and marks read only after completion')
 index=next(i for i,p in enumerate(lesson['pages']) if len(p['read_aloud']['segments'])>1)
 page.locator('[data-action="page"][data-page="'+str(index)+'"]').click()
 before=page.evaluate('window.soundSources.length')
 click(page,'listen');sounding(page)
 page.wait_for_function("JSON.parse(localStorage.getItem('hide-and-seek-v1-progress')).read.includes('"+lesson['pages'][index]['page_id']+"')")
 assert page.evaluate('window.soundSources.length')-before==len(lesson['pages'][index]['read_aloud']['segments'])
 passed('Every sentence on a multi-segment page plays before read completion')
 page.locator('[data-action="page"][data-page="0"]').click()
 click(page,'parent')
 page.locator('#voice-pack').select_option('winny')
 page.wait_for_function("document.querySelector('#editor-message').textContent.includes('WeWinny')")
 click(page,'parent');page.reload();page.wait_for_selector('[data-action="listen"]')
 click(page,'listen');sounding(page)
 manifest=json.loads((ROOT/'public/audio/manifest-winny.json').read_text(encoding='utf-8'))
 expected=BASE+manifest['narrator|Hide and Seek.'].replace('.mp3','.wav')
 assert expected in requests
 click(page,'slow');assert abs(page.evaluate('window.lastSource.playbackRate.value')-.82)<.01
 click(page,'stop');assert not page.evaluate('window.sourcePlaying')
 passed('Selected voice persists; Slow and Stop control actual PCM playback')
 click(page,'play');sounding(page)
 assert BASE+manifest['narrator|What game do you think they will play?'].replace('.mp3','.wav') in requests
 page.locator('[data-answer="a"]').click();sounding(page)
 assert BASE+manifest['narrator|Yes! Hide and seek!'].replace('.mp3','.wav') in requests
 passed('Questions and feedback auto-read with selected voice')
 click(page,'parent')
 for i in range(3):
  page.locator('[data-action="voice-preview"][data-preview="'+str(i)+'"]').click()
  sounding(page);click(page,'stop')
 passed('Three voice samples use local compatible audio')
 decoded=page.evaluate("""async()=>{
  const {pcmWav}=await import('/src/wav.js');
  const config=await fetch('/audio/voices.json').then(r=>r.json());
  const samples=await fetch('/audio/previews.json').then(r=>r.json());
  const urls=new Set(samples.map(x=>x.src));
  for(const voice of config.voices){const m=await fetch(voice.manifest).then(r=>r.json());Object.values(m).forEach(x=>urls.add(x));}
  const results=[];
  for(const source of urls){
   const url=source.replace('.mp3','.wav'),r=await fetch(url);if(!r.ok)throw Error(url);
   const pcm=pcmWav(await r.arrayBuffer());
   if(pcm.length/pcm.sampleRate<.1||!pcm.channels[0].some(v=>Math.abs(v)>.001))throw Error('Empty speech '+url);
   results.push({url,duration:pcm.length/pcm.sampleRate,sampleRate:pcm.sampleRate});
  }return results;
 }""")
 assert len(decoded)==203
 (ROOT/'tests/audio-decode-results.json').write_text(json.dumps(decoded,indent=2),encoding='utf-8')
 passed('All 203 PCM files contain decodable non-silent speech')
 page.locator('.sound-panel summary').click();click(page,'sound-test')
 page.wait_for_function("document.querySelector('#sound-details').textContent.includes('ended')")
 assert 'Web Audio' in page.locator('#sound-details').inner_text()
 with page.expect_download() as download:click(page,'sound-export')
 diagnostic=json.loads(Path(download.value.path()).read_text(encoding="utf-8"))
 assert diagnostic['state']=='ended' and diagnostic['version']=='1.2.0'
 passed('Sound test and downloadable diagnostics describe actual playback backend')
 click(page,'parent');click(page,'read');click(page,'repeat-start')
 assert page.locator('.recorder').count()==1
 click(page,'repeat-model');sounding(page)
 click(page,'record-start');page.wait_for_selector('[data-action="record-stop"]')
 page.wait_for_timeout(750);click(page,'record-stop')
 page.wait_for_selector('[data-action="record-play"]')
 click(page,'record-play');sounding(page)
 assert '自己的声音' in page.locator('#audio-status').inner_text()
 click(page,'repeat-next');page.wait_for_selector('.question-title')
 assert any(x['type']=='listen_and_repeat' for x in page.evaluate("JSON.parse(localStorage.getItem('hide-and-seek-v1-learning'))"))
 passed('A real MediaRecorder captures fake test microphone, replays locally and records participation')
 # A missed point question joins review with its original image and hotspots.
 page.locator('[data-action="page"][data-page="1"]').click();click(page,'play')
 picture=page.locator('#picture').bounding_box()
 for _ in range(2):page.mouse.click(picture['x']+picture['width']*.98,picture['y']+picture['height']*.98)
 assert page.locator('.hotspot.reveal').count()>0
 click(page,'help-done')
 history=page.evaluate("JSON.parse(localStorage.getItem('hide-and-seek-v1-learning'))")
 assert history[-1]['result']=='together'
 click(page,'practice-review')
 assert page.locator('.practice-tag').count()==1
 assert page.locator('#picture img').get_attribute('src').endswith('page_01.png')
 assert page.locator('.question-title').inner_text()==lesson['pages'][1]['activities'][0]['prompt']
 lesson=json.loads((ROOT/'public/lesson.json').read_text(encoding="utf-8"))
 activity=lesson['pages'][1]['activities'][0]
 target=next(h for h in lesson['pages'][1]['hotspots'] if h['id']==activity['target_hotspots'][0])
 picture=page.locator('#picture').bounding_box();x,y,w,h=target['bbox']
 page.mouse.click(picture['x']+picture['width']*(x+w/2),picture['y']+picture['height']*(y+h/2))
 assert page.locator('[data-action="next-question"]').count()==1
 click(page,'next-question');page.wait_for_selector('.completion')
 assert page.locator('.learning-summary').count()==1
 passed('Assisted question reappears alone with correct image; independent review updates schedule')
 click(page,'browse')
 # Stored corrupt recording must fall back, rather than masking bundled speech.
 page.evaluate("""async()=>{const {originalAudio}=await import('/src/audio.js');await originalAudio('cover',new Blob(['invalid audio'],{type:'audio/wav'}));}""")
 click(page,'listen');sounding(page)
 assert '改用内置语音' in page.locator('#audio-status').inner_text()
 passed('Corrupt imported page recording falls back to the bundled voice')
 click(page,'stop')
 assert not external,external;assert not errors,errors
 page.set_viewport_size({'width':390,'height':844});click(page,'repeat-start')
 assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
 page.screenshot(path=str(ROOT/'screenshot-repeat-mobile.png'),full_page=True)
 click(page,'parent');page.set_viewport_size({'width':1360,'height':1000})
 page.screenshot(path=str(ROOT/'screenshot-learning-studio.png'),full_page=True)
 passed('No external requests or script errors; new practice UI fits 390px screens')
 context.close()
 # Explicitly disable codec decoding: packaged speech must not depend on MP3 support.
 c,p=fresh(browser)
 # The wrapper returns native contexts, so replace the native prototype as well.
 p.evaluate("()=>{Object.getPrototypeOf(new AudioContext()).decodeAudioData=()=>Promise.reject(new DOMException('Codec unavailable','NotSupportedError'));}")
 click(p,'listen');sounding(p)
 click(p,'stop')
 assert '0 / 6' in p.locator('.progress-info').inner_text()
 passed('Bundled speech works without native codec decoding; cancellation does not mark read')
 click(p,'listen');sounding(p);p.evaluate('window.lastContext.suspend()')
 p.wait_for_function("document.querySelector('#audio-status').textContent.includes('浏览器暂停')")
 assert '0 / 6' in p.locator('.progress-info').inner_text()
 passed('Interrupted audio context reports a retry action and does not mark read')
 c.close()
 # Microphone denial leaves the reading path usable.
 c,p=fresh(browser)
 p.evaluate("()=>{navigator.mediaDevices.getUserMedia=()=>Promise.reject(new DOMException('Denied','NotAllowedError'));}")
 click(p,'repeat-start');click(p,'record-start')
 p.wait_for_selector('.record-error')
 assert '没有开启麦克风' in p.locator('.record-error').inner_text()
 click(p,'repeat-next');p.wait_for_selector('.question-title')
 passed('Microphone denial is explained; children can continue without recording')
 c.close()
 # No Web Audio available, browser rejects autoplay.
 c=browser.new_context(bypass_csp=True)
 c.add_init_script("window.AudioContext=undefined;window.webkitAudioContext=undefined;HTMLMediaElement.prototype.play=()=>Promise.reject(new DOMException('Blocked','NotAllowedError'));")
 p=c.new_page();p.goto(BASE);p.wait_for_selector('[data-action="listen"]');click(p,'listen')
 p.wait_for_function("document.querySelector('#audio-status').textContent.includes('开启声音')")
 assert '0 / 6' in p.locator('.progress-info').inner_text()
 passed('Autoplay rejection displays an actionable message without false completion')
 c.close()
 # Supported HTML audio fallback (no Web Audio) really plays the WAV.
 c=browser.new_context(bypass_csp=True)
 c.add_init_script("window.AudioContext=undefined;window.webkitAudioContext=undefined;const NativeAudio=window.Audio;window.Audio=function(...a){const x=new NativeAudio(...a);window.lastAudio=x;return x;};")
 p=c.new_page();p.goto(BASE);p.wait_for_selector('[data-action="listen"]');click(p,'listen')
 p.wait_for_function('window.lastAudio && !window.lastAudio.paused')
 assert p.evaluate('window.lastAudio.currentSrc').endswith('.wav')
 p.wait_for_function("document.querySelector('.progress-info').textContent.includes('1 / 6')")
 passed('HTML WAV fallback plays to completion when Web Audio is unavailable')
 c.close()
 # Smoke check with production CSP enforced (locator assertions avoid test eval).
 c=browser.new_context()
 p=c.new_page();p.goto(BASE);click(p,'listen')
 expect(p.locator('#audio-status')).to_contain_text('正在播放')
 expect(p.locator('.progress-info')).to_contain_text('1 / 6',timeout=15000)
 passed('Actual playback also completes with the production CSP enforced')
 c.close();browser.close()
# Range support is required for native media browsers.
url=BASE+decoded[0]['url']
with urlopen(Request(url,headers={'Range':'bytes=0-43'})) as response:
 assert response.status==206 and len(response.read())==44
 assert response.headers['Content-Type']=='audio/wav'
try:urlopen(Request(url,headers={'Range':'bytes=999999999-'}));raise AssertionError('Invalid range accepted')
except HTTPError as error:assert error.code==416
passed('Local server provides valid audio MIME and byte ranges')
(ROOT/'tests/audio-e2e-results.json').write_text(json.dumps(checks,indent=2),encoding='utf-8')

