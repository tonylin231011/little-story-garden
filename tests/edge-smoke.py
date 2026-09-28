"""Use the installed Microsoft Edge with isolated data and the production CSP."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
root=Path(__file__).resolve().parents[1]
with sync_playwright() as pw:
 browser=pw.chromium.launch(channel='msedge',headless=True)
 context=browser.new_context(viewport={'width':1360,'height':980})
 page=context.new_page();errors=[]
 page.on('pageerror',lambda error:errors.append(str(error)))
 response=page.goto('http://127.0.0.1:4173/')
 assert response.status==200
 expect(page.locator('h1')).to_contain_text('Hide and Seek')
 assert page.locator('#picture img').evaluate('(image)=>image.complete && image.naturalWidth>0')
 page.locator('[data-action="library"]').click()
 expect(page.locator('h1')).to_have_text('每本书，都是新的一集')
 page.locator('[data-lib="new"]').click()
 expect(page.locator('#episode-files')).to_be_visible()
 page.screenshot(path=str(root/'screenshot-edge-resident.png'),full_page=True)
 assert not errors,errors
 result={'browser':'Installed Microsoft Edge','version':browser.version,'url':'http://127.0.0.1:4173/','http':200,'checks':['Reader title and real image load','Bookshelf opens','New episode import entry opens'],'scriptErrors':errors}
 (root/'tests/edge-smoke-results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
 print('PASS Installed Edge: fixed local URL, book image, bookshelf and import entry; no script errors.')
 context.close();browser.close()
