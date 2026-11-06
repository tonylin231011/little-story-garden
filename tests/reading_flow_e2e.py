from playwright.sync_api import sync_playwright

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(
        headless=True,
        args=['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
    )
    context = browser.new_context(viewport={'width': 390, 'height': 844}, permissions=['microphone'])
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto('http://127.0.0.1:4173/')
    page.locator('[data-action="next-page"]').click()
    page.wait_for_selector('.repeat-cue', timeout=20000)
    assert page.locator('.sentences').inner_text() == 'Can you see us?'
    assert '轮到你' in page.locator('.repeat-cue').inner_text()
    assert page.locator('.progress-info').inner_text().startswith('🌱 1 / 6')
    page.locator('[data-action="record-start"]').click()
    page.locator('[data-action="record-stop"]').click()
    page.wait_for_selector('.pronunciation-result', timeout=10000)
    assert 'Good job!' in page.locator('.pronunciation-result').inner_text()
    assert '评测服务尚未连接' in page.locator('.pronunciation-result').inner_text()
    page.locator('[data-action="next-page"]').click()
    page.wait_for_selector('.repeat-cue', timeout=20000)
    assert page.locator('.sentences').inner_text().startswith('Can you see me?')
    page.locator('[data-action="parent"]').click()
    page.locator('details.sound-panel').filter(has_text='孩子跟读反馈').locator('summary').click()
    page.locator('#assessment-token').fill('temporary-test-token')
    page.locator('[data-action="save-assessment-token"]').click()
    assert '已保存在这台设备' in page.locator('#assessment-message').inner_text()
    assert page.evaluate("localStorage.getItem('story-garden-assessment-token')") == 'temporary-test-token'
    assert not errors, errors
    browser.close()
    print('PASS: next page auto narration, repeat prompt, honest recording feedback, next page transition')
