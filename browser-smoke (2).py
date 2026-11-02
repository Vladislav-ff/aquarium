"""Local smoke tests. --real3d requires a vendored site and tests the actual scene.
Default mode deliberately blocks external libraries and tests the shell/failure UX.
Requires playwright==1.51.0 and an installed Chromium.
"""
import argparse, asyncio, functools, http.server, json, threading, urllib.parse
from pathlib import Path
from playwright.async_api import async_playwright
class Handler(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        p = urllib.parse.urlsplit(path).path
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
    if args.real3d and not json.loads((site/'asset-manifest.json').read_text())['localThree']:
        raise SystemExit('--real3d requires a vendored build')
    output = Path(args.output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    server = http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(site)))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    base='http://127.0.0.1:'+str(server.server_address[1]); results=[]
    def check(name, ok, detail=None):
        results.append({'name':name,'passed':bool(ok),'detail':detail})
        print(('PASS ' if ok else 'FAIL ')+name,flush=True)
        if not ok:
            raise AssertionError(name)
    try:
        async with async_playwright() as pw:
            flags=['--no-sandbox']+(['--use-angle=swiftshader','--enable-unsafe-swiftshader'] if args.real3d else [])
            b=await pw.chromium.launch(headless=True,args=flags)
            try:
                for prefix in ['/', '/repository-name/']:
                    p=await b.new_page(viewport={'width':1280,'height':800})
                    errors=[]; missing=[]
                    p.on('pageerror',lambda e:errors.append(str(e)))
                    p.on('response',lambda r:missing.append([r.url,r.status]) if r.url.startswith(base) and r.status>=400 else None)
                    await p.route('https://**/*',lambda r:r.abort())
                    await p.goto(base+prefix+('?quality=low' if args.real3d else ''),timeout=15000)
                    if args.real3d:
                        await p.wait_for_function('window.aquariumReady===true',timeout=60000)
                        await p.wait_for_timeout(1000)
                        audit=await p.evaluate('NACRE.audit()')
                        check(prefix+' real scene advances',audit['activeFish']>0 and audit['simulationTime']>.1,audit)
                        await p.click('#settingsBtn'); await p.click('#pause')
                        t=await p.evaluate('NACRE.audit().simulationTime'); await p.wait_for_timeout(400)
                        check(prefix+' paused clock',t==await p.evaluate('NACRE.audit().simulationTime'))
                        await p.click('#pause');await p.wait_for_timeout(300)
                        check(prefix+' resume',await p.evaluate('NACRE.audit().simulationTime')>t)
                    else:
                        await p.wait_for_function("!document.getElementById('startupActions').hidden",timeout=10000)
                        check(prefix+' readable dependency failure','Не удалось загрузить 3D' in await p.locator('#loadingText').inner_text())
                        async with p.expect_navigation(timeout=10000):
                            await p.click('#retryLow')
                        check(prefix+' retry retains prefix',urllib.parse.urlsplit(p.url).path==prefix and 'quality=low' in p.url)
                    check(prefix+' local resources present',not missing,missing)
                    check(prefix+' no unhandled JS exception',not errors,errors)
                    await p.close()
                if not args.real3d:
                    p=await b.new_page(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
                    stub="window.aquariumReady=true;document.getElementById('loader').style.display='none';window.dispatchEvent(new Event('nacre:ready'));"
                    await p.route('**/aquarium.*.mjs',lambda r:r.fulfill(status=200,content_type='text/javascript',body=stub))
                    await p.goto(base+'/repository-name/');await p.wait_for_function('window.aquariumReady===true')
                    check('mobile shell with scene stub',await p.evaluate('document.documentElement.scrollWidth<=innerWidth'))
                    await p.close()
            finally:
                await b.close()
    except Exception as e:
        if not results or results[-1]['passed']:
            results.append({'name':'browser execution','passed':False,'detail':str(e)})
        raise
    finally:
        server.shutdown()
        output.write_text(json.dumps({'real3d':args.real3d,'checks':results,'passed':sum(x['passed'] for x in results),'failed':sum(not x['passed'] for x in results)},ensure_ascii=False,indent=2),encoding='utf-8')
if __name__=='__main__':
    asyncio.run(main())
