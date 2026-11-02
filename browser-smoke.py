"""Browser checks. Requires: pip install playwright==1.51.0; playwright install chromium.
Default mode blocks the external network and checks the loader and project paths.
--real3d requires a vendored build, denies all non-local traffic, and tests the real scene.
"""
import argparse, asyncio, functools, http.server, json, threading, urllib.parse
from pathlib import Path
from playwright.async_api import async_playwright

class Handler(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        url = urllib.parse.urlsplit(path)
        p = url.path
        if p.startswith('/repository-name/'):
            p = p[len('/repository-name'):]
        return super().translate_path(p)
    def log_message(self, *args):
        pass
    def copyfile(self, source, output):
        try:
            super().copyfile(source, output)
        except (BrokenPipeError, ConnectionResetError):
            pass

async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--site', default='.')
    parser.add_argument('--real3d', action='store_true')
    parser.add_argument('--output', default='reports/browser-results.json')
    args = parser.parse_args()
    site = Path(args.site).resolve()
    if not (site / 'index.html').is_file():
        raise SystemExit('Missing index.html')
    if args.real3d and not json.loads((site / 'asset-manifest.json').read_text())['localThree']:
        raise SystemExit('--real3d requires npm run vendor && npm run build && npm run stage')
    output = Path(args.output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Handler, directory=str(site)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = 'http://127.0.0.1:' + str(server.server_address[1])
    results = []
    def check(name, ok, detail=None):
        results.append({'name': name, 'passed': bool(ok), 'detail': detail})
        if not ok:
            raise AssertionError(name)
    try:
        async with async_playwright() as pw:
            browser = await pw.chromium.launch(headless=True, args=['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
            try:
                for prefix in ['/', '/repository-name/']:
                    page = await browser.new_page(viewport={'width': 1280, 'height': 800})
                    errors, missing = [], []
                    page.on('pageerror', lambda error: errors.append(str(error)))
                    page.on('response', lambda response: missing.append([response.url, response.status]) if response.url.startswith(base) and response.status >= 400 else None)
                    await page.route('https://**/*', lambda route: route.abort())
                    await page.goto(base + prefix + '?quality=low')
                    if args.real3d:
                        await page.wait_for_function('window.aquariumReady === true', timeout=60000)
                        await page.wait_for_timeout(1000)
                        audit = await page.evaluate('NACRE.audit()')
                        check(prefix + ' actual 3D scene advances', audit['activeFish'] > 0 and audit['simulationTime'] > .1, audit)
                        await page.click('#settingsBtn')
                        await page.click('#pause')
                        before = await page.evaluate('NACRE.audit().simulationTime')
                        await page.wait_for_timeout(400)
                        after = await page.evaluate('NACRE.audit().simulationTime')
                        check(prefix + ' pause freezes model time', before == after)
                        await page.click('#pause')
                        await page.wait_for_timeout(300)
                        check(prefix + ' resume works', await page.evaluate('NACRE.audit().simulationTime') > after)
                    else:
                        await page.wait_for_function("!document.getElementById('startupActions').hidden", timeout=10000)
                        check(prefix + ' dependency error is readable', 'Не удалось загрузить 3D' in await page.locator('#loadingText').inner_text())
                        await page.click('#retryLow')
                        await page.wait_for_url('**quality=low')
                        check(prefix + ' retry preserves project prefix', urllib.parse.urlsplit(page.url).path == prefix)
                    check(prefix + ' no missing local resources', not missing, missing)
                    check(prefix + ' no unhandled JS error', not errors, errors)
                    await page.close()
                if not args.real3d:
                    page = await browser.new_page(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
                    stub = "window.aquariumReady=true;document.getElementById('loader').style.display='none';window.dispatchEvent(new Event('nacre:ready'));"
                    await page.route('**/aquarium.*.mjs', lambda route: route.fulfill(status=200, content_type='text/javascript', body=stub))
                    await page.goto(base + '/repository-name/')
                    await page.wait_for_function('window.aquariumReady === true')
                    check('mobile bootstrap (renderer stub)', await page.evaluate('document.documentElement.scrollWidth <= innerWidth'))
                    await page.close()
            finally:
                await browser.close()
    except Exception as error:
        if not results or results[-1]['passed']:
            results.append({'name': 'browser test execution', 'passed': False, 'detail': str(error)})
        raise
    finally:
        server.shutdown()
        output.write_text(json.dumps({'real3d': args.real3d, 'checks': results, 'passed': sum(x['passed'] for x in results), 'failed': sum(not x['passed'] for x in results)}, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'passed': len(results), 'real3d': args.real3d}))

if __name__ == '__main__':
    asyncio.run(main())
