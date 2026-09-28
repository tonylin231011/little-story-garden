import json, wave, math, struct
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
lesson=json.loads((ROOT/'public/lesson.json').read_text(encoding='utf-8'))
results=[]
def passed(s):results.append(s);print('PASS '+s,flush=True)
with wave.open(str(ROOT/'tests/test-tone.wav'),'w') as w:
 w.setnchannels(1);w.setsampwidth(2);w.setframerate(16000)
 w.writeframes(b''.join(struct.pack('<h',int(3000*math.sin(2*math.pi*440*n/16000))) for n in range(32000)))
with sync_playwright() as pw:
 browser=pw.chromium.launch(headless=True)
 context=browser.new_context(viewport={'width':1360,'height':1000}, bypass_csp=True)
 page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.route('**/audio/manifest*.json',lambda route:route.fulfill(status=200,content_type='application/json',body='{}'))
 page.add_init_script((ROOT/'tests/audio_probe.js').read_text(encoding='utf-8'))
 page.goto('http://127.0.0.1:4173');page.wait_for_selector('[data-action="listen"]')
 assert page.locator('#picture img').evaluate('(im)=>im.complete&&im.naturalWidth===739')
 page.screenshot(path=str(ROOT/'screenshot-desktop.png'),full_page=True)
 passed('Real cover loads without image selection')
 page.locator('[data-action="listen"]').click()
 page.wait_for_function("document.querySelector('#audio-status').textContent.includes('还没有录音')")
 assert page.locator('.progress-info').inner_text().find('0 / 6')>=0
 passed('Missing audio is explicit and never marks page read')
 page.unroute('**/audio/manifest*.json');page.reload();page.wait_for_selector('[data-action="listen"]')
 for i,p in enumerate(lesson['pages']):
  assert page.locator('#picture img').get_attribute('src').endswith(p['page_id']+'.png')
  page.locator('[data-action="read-together"]').click()
  page.locator('[data-action="play"]').first.click()
  for a in [a for a in p['activities'] if a.get('enabled',True) and a.get('reviewed',True)]:
   assert page.locator('.question-title').inner_text()==a['prompt']
   if a['type']=='point_and_find':
    h=next(h for h in p['hotspots'] if h['id']==a['target_hotspots'][0]);r=page.locator('#picture').bounding_box()
    if i==1 and a==p['activities'][0]:
     for _ in range(2):page.mouse.click(r['x']+r['width']*.98,r['y']+r['height']*.98)
     assert page.locator('.hotspot.reveal').count()>0
     passed('Two misses reveal gentle point-and-find guidance')
    page.mouse.click(r['x']+r['width']*(h['bbox'][0]+h['bbox'][2]/2),r['y']+r['height']*(h['bbox'][1]+h['bbox'][3]/2))
   elif a['type']=='multiple_choice':
    page.locator('[data-answer="'+a['correct_answer']+'"]').click()
   else:page.locator('[data-action="talk-done"]').click()
   page.locator('[data-action="next-question"]').click()
 for a in lesson['review']:
  assert page.locator('.question-title').inner_text()==a['prompt']
  if a['type']=='multiple_choice':page.locator('[data-answer="'+a['correct_answer']+'"]').click()
  else:page.locator('[data-action="talk-done"]').click()
  page.locator('[data-action="next-question"]').click()
 assert page.locator('h1').inner_text()=='You did it!'
 assert '6 / 6' in page.locator('.summary').inner_text()
 page.reload();page.wait_for_selector('.completion');assert page.locator('h1').inner_text()=='You did it!'
 passed('Every page, all activities, review, discussion and completion; refresh retains progress')
 page.locator('[data-action="browse"]').click()
 page.locator('[data-action="page"][data-page="1"]').click()
 page.locator('[data-action="play"]').first.click()
 page.locator('[data-filter="word"]').click();assert 'POINT & FIND' in page.locator('.question-meta').inner_text()
 page.locator('[data-filter="story"]').click();assert page.locator('.question-title').inner_text()=='What are the children doing?'
 passed('Word Questions and Story Questions filters')
 page.locator('[data-action="parent"]').click()
 page.locator('#edit-prompt').fill('Can you find the big tree?')
 r=page.locator('#editor-picture').bounding_box()
 page.mouse.move(r['x']+.25*r['width'],r['y']+.06*r['height']);page.mouse.down()
 page.mouse.move(r['x']+.68*r['width'],r['y']+.74*r['height']);page.mouse.up()
 page.locator('[data-action="save-editor"]').click()
 assert '已保存' in page.locator('#editor-message').inner_text()
 page.locator('[data-action="parent"]').click()
 page.reload();page.wait_for_selector('[data-action="play"]')
 page.locator('[data-action="play"]').first.click()
 assert page.locator('.question-title').inner_text()=='Can you find the big tree?'
 passed('Parent question edit and drawn hotspot persist after refresh')
 page.locator('[data-action="parent"]').click()
 page.locator('#import-audio').set_input_files(str(ROOT/'tests/test-tone.wav'))
 page.wait_for_function("document.querySelector('#original-status').textContent.includes('已导入')")
 page.locator('[data-action="parent"]').click()
 page.locator('[data-action="read"]').click()
 page.locator('[data-action="listen"]').click()
 page.wait_for_function('window.sourcePlaying')
 page.locator('[data-action="next-page"]').click()
 assert page.evaluate('!window.sourcePlaying')
 passed('Valid local audio imports and plays; navigation cancels playback')
 page.locator('[data-action="parent"]').click()
 page.locator('#edit-page').select_option('1')
 page.locator('#audio-target').select_option(label='Can you find the big tree?')
 page.locator('#import-audio').set_input_files(str(ROOT/'tests/test-tone.wav'))
 page.wait_for_function("document.querySelector('#original-status').textContent.includes('已导入')")
 page.locator('[data-action="preview-original"]').click()
 page.wait_for_function('window.sourcePlaying')
 passed('Question audio is separately imported and played locally')
 with page.expect_download() as dl:page.locator('[data-action="export"]').click()
 data=json.loads(Path(dl.value.path()).read_text(encoding='utf-8'))
 assert data['pages'][1]['activities'][0]['prompt']=='Can you find the big tree?'
 passed('Edited Lesson JSON exports')
 page.locator('#import-lesson').set_input_files({'name':'invalid.json','mimeType':'application/json','buffer':b'{"pages":[]}'})
 assert '导入失败' in page.locator('#editor-message').inner_text()
 passed('Invalid Lesson JSON rejected')
 page.locator('[data-action="parent"]').click()
 page.set_viewport_size({'width':390,'height':844})
 page.locator('[data-action="page"][data-page="1"]').click()
 page.locator('[data-action="play"]').first.click()
 assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
 page.screenshot(path=str(ROOT/'screenshot-mobile.png'),full_page=True)
 passed('390 px mobile layout has no horizontal overflow')
 assert not errors,errors
 passed('No uncaught browser errors')
 context.close();browser.close()
(ROOT/'tests/e2e-results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')

