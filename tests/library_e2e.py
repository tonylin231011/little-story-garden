import json
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1]
BASE='http://127.0.0.1:4173'
results=[]
def passed(s): results.append(s);print('PASS '+s,flush=True)
def action(page,name):page.locator('[data-action="'+name+'"]').first.click()
def lib(page,name):page.locator('[data-lib="'+name+'"]').first.click()
def pdf_fixture():
 objects=[
  b'<< /Type /Catalog /Pages 2 0 R >>',
  b'<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>',
  b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 360 480] /Resources << /Font << /F1 7 0 R >> >> /Contents 4 0 R >>',
  None,
  b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 360 480] /Resources << /Font << /F1 7 0 R >> >> /Contents 6 0 R >>',
  None,b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>']
 for index,text,color in [(3,'A blue ball.','0.2 0.4 0.9'),(5,'A red box.','0.9 0.3 0.2')]:
  data=('BT /F1 24 Tf 32 400 Td ('+text+') Tj ET\n'+color+' rg 60 80 200 250 re f').encode()
  objects[index]=b'<< /Length '+str(len(data)).encode()+b' >>\nstream\n'+data+b'\nendstream'
 output=bytearray(b'%PDF-1.4\n');offsets=[0]
 for i,obj in enumerate(objects,1):offsets.append(len(output));output.extend(str(i).encode()+b' 0 obj\n'+obj+b'\nendobj\n')
 start=len(output);output.extend(b'xref\n0 8\n0000000000 65535 f \n')
 for offset in offsets[1:]:output.extend(('%010d 00000 n \n'%offset).encode())
 output.extend(('trailer\n<< /Size 8 /Root 1 0 R >>\nstartxref\n'+str(start)+'\n%%EOF').encode())
 return bytes(output)
with sync_playwright() as pw:
 browser=pw.chromium.launch(headless=True)
 context=browser.new_context(viewport={'width':1360,'height':1000},bypass_csp=True)
 context.add_init_script((ROOT/'tests/audio_probe.js').read_text(encoding='utf-8'))
 page=context.new_page();errors=[];external=[]
 page.on('pageerror',lambda error:errors.append(str(error)))
 page.on('request',lambda request:external.append(request.url) if not request.url.startswith((BASE,'blob:','data:')) else None)
 page.goto(BASE);page.wait_for_selector('[data-action="listen"]');action(page,'read-together')
 action(page,'library');lib(page,'new')
 page.locator('#episode-title').fill('The New Adventure')
 page.locator('#episode-files').set_input_files([str(ROOT/'public/images/page_01.png'),str(ROOT/'public/images/cover.png')])
 page.wait_for_selector('[data-lib="create"]')
 expect(page.locator('.import-page')).to_have_count(2)
 assert 'cover.png' in page.locator('.import-page').first.inner_text()
 page.locator('[data-lib="down"][data-index="0"]').click()
 assert 'page_01.png' in page.locator('.import-page').first.inner_text()
 page.locator('[data-page-text="0"]').fill('A new adventure.')
 page.locator('[data-page-text="1"]').fill('We can play.')
 lib(page,'create');page.wait_for_selector('#page-body')
 expect(page.locator('#episode-name')).to_have_value('The New Adventure')
 action(page,'ai-preview');expect(page.locator('#ai-panel')).to_contain_text('尚未配置')
 assert not external,external
 passed('Screenshots import, natural sort, reorder and text editing create a draft without external requests')
 action(page,'save-draft');action(page,'library')
 expect(page.locator('.episode-card')).to_have_count(2)
 new_card=page.locator('.episode-card').filter(has_text='The New Adventure')
 expect(new_card).to_contain_text('等待家长审核')
 new_card.locator('[data-lib="open"]').click()
 action(page,'save-editor');expect(page.locator('#editor-message')).to_contain_text('已保存并发布')
 action(page,'parent');expect(page.locator('h1')).to_contain_text('The New Adventure')
 expect(page.locator('.progress-info')).to_contain_text('0 / 2')
 assert page.locator('#picture img').evaluate('(image)=>image.complete&&image.naturalWidth>0')
 action(page,'read-together');action(page,'next-page');action(page,'read-together');action(page,'next-page')
 page.wait_for_selector('.completion');expect(page.locator('.summary')).to_contain_text('2 / 2')
 passed('Two-page episode publishes, renders actual images and completes with dynamic page count')
 page.reload();page.wait_for_selector('.completion')
 action(page,'library')
 page.locator('.episode-card').filter(has_text='Hide and Seek').locator('[data-lib="open"]').click()
 expect(page.locator('.progress-info')).to_contain_text('1 / 6')
 passed('New-episode completion survives refresh and legacy progress stays independent')
 # Text PDF, then a mock provider: no real service or credentials.
 action(page,'library');lib(page,'new');page.locator('#episode-title').fill('Colors PDF')
 page.locator('#episode-files').set_input_files({'name':'colors.pdf','mimeType':'application/pdf','buffer':pdf_fixture()})
 page.wait_for_selector('[data-lib="create"]',timeout=30000)
 expect(page.locator('.import-page')).to_have_count(2)
 assert 'A blue ball.' in page.locator('[data-page-text="0"]').input_value()
 assert 'A red box.' in page.locator('[data-page-text="1"]').input_value()
 page.screenshot(path=str(ROOT/'screenshot-pdf-import.png'),full_page=True)
 lib(page,'create');page.wait_for_selector('#page-body')
 passed('Real two-page PDF renders locally and preserves its extracted English')
 status={'configured':True,'provider':'Local test fixture','baseUrl':'https://mock.invalid/v1','model':'fixture-vision','fingerprint':'fixture','maxPages':40}
 calls=[]
 page.route('**/api/ai/status',lambda route:route.fulfill(content_type='application/json',body=json.dumps(status)))
 def generate(route):
  data=route.request.post_data_json;calls.append(data)
  assert data['confirmed'] is True and data['fingerprint']=='fixture'
  assert data['image'].startswith('data:image/jpeg;base64,')
  assert set(data)=={'confirmed','fingerprint','title','pageNumber','totalPages','image','text'}
  result={'read_aloud':{'segments':[{'text':'A blue ball.','voice':'narrator'}],'silent':False},'hotspots':[{'id':'h1','label':'ball','bbox':[.15,.15,.5,.6]}],'activities':[{'type':'point_and_find','category':'word','prompt':'Can you find the ball?','tts':'Can you find the ball?','target_hotspots':['h1'],'parent_note':'找一找。','feedback':{'correct':'Well done!','retry':"Let's look again."}}],'parent_guide':'一起看图。','warnings':[]}
  route.fulfill(content_type='application/json',body=json.dumps({'page':result}))
 page.route('**/api/ai/page',generate)
 action(page,'ai-preview');expect(page.locator('#ai-panel')).to_contain_text('全部 2 页')
 action(page,'ai-generate');assert len(calls)==0
 page.locator('#ai-consent').check();action(page,'ai-generate')
 page.wait_for_function("document.querySelector('#editor-message').textContent.includes('AI 草稿已生成')")
 assert len(calls)==2
 assert not page.locator('#edit-reviewed').is_checked()
 page.locator('#edit-reviewed').check();action(page,'save-editor');action(page,'parent');action(page,'play')
 expect(page.locator('.question-title')).to_have_text('Can you find the ball?')
 assert page.locator('#picture [data-hotspot]').count()==1
 passed('Pluggable AI flow shows exact destination/pages, requires confirmation, and keeps generated questions pending review')
 # An upstream failure must preserve the existing draft.
 action(page,'parent')
 before=page.locator('#page-body').input_value()
 page.unroute('**/api/ai/page')
 page.route('**/api/ai/page',lambda route:route.fulfill(status=502,content_type='application/json',body='{"error":"fixture failure"}'))
 action(page,'ai-preview');page.locator('#ai-consent').check();action(page,'ai-generate')
 page.wait_for_function("document.querySelector('#editor-message').textContent.includes('fixture failure')")
 assert page.locator('#page-body').input_value()==before
 passed('Generation failure preserves previous content without automatic retry')
 action(page,'library');page.set_viewport_size({'width':390,'height':844})
 assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
 page.screenshot(path=str(ROOT/'screenshot-bookshelf-mobile.png'),full_page=True)
 assert not errors,errors;assert not external,external
 passed('Three-book shelf fits mobile; no script errors or real cloud requests')
 context.close()
 # PDF worker and fonts must also work with the real production CSP.
 production=browser.new_context(viewport={'width':1280,'height':900})
 strict=production.new_page();strict.goto(BASE);strict.wait_for_selector('[data-action="listen"]')
 action(strict,'library');lib(strict,'new')
 strict.locator('#episode-files').set_input_files({'name':'colors.pdf','mimeType':'application/pdf','buffer':pdf_fixture()})
 strict.wait_for_selector('[data-lib="create"]',timeout=30000)
 expect(strict.locator('.import-page')).to_have_count(2)
 assert 'A blue ball.' in strict.locator('[data-page-text="0"]').input_value()
 passed('PDF rendering and text extraction work with the production CSP enforced')
 production.close();browser.close()
(ROOT/'tests/library-e2e-results.json').write_text(json.dumps(results,indent=2),encoding='utf-8')

