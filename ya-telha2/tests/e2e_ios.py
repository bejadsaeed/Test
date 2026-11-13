"""iPhone-profile checks of the hosted PWA build (dist/web) over HTTP.
NOTE: runs in Chromium with an iPhone device profile + iOS user agent (real touch events). It is NOT Safari/WebKit."""
import sys, pathlib, json, subprocess, time
from playwright.sync_api import sync_playwright
R = pathlib.Path(sys.argv[1]); SHOT = R/"tests/shots"; SHOT.mkdir(exist_ok=True)
errs = []; checks = []
def ok(name, cond, extra=""):
    checks.append((name, bool(cond))); print(("PASS " if cond else "FAIL ")+name, "" if cond and extra == "" else extra)
def T(pg, a, v=None):   # real touch tap
    pg.locator(f'[data-a="{a}"]' + (f'[data-v="{v}"]' if v is not None else "")).first.tap(force=True)
def scr(pg): return pg.evaluate("__ytm.screen()")
def fits(pg): return pg.evaluate("[...document.querySelectorAll('.screen>*')].every(e=>{const r=e.getBoundingClientRect();return r.bottom<=innerHeight+1&&r.left>=-1&&r.right<=innerWidth+1})")
URL = "http://127.0.0.1:8766/"
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8766", "--bind", "127.0.0.1", "-d", str(R/"dist/web")], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
try:
  with sync_playwright() as p:
    dev = dict(p.devices["iPhone 13"]); dev.pop("default_browser_type", None)
    b = p.chromium.launch()
    ctx = b.new_context(**dev, locale="ar-EG"); pg = ctx.new_page()
    pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.goto(URL); pg.wait_for_function("window.__ytm && __ytm.screen()==='home'")
    ok("detected as iPhone", pg.evaluate("__ytm.ios") is True and pg.evaluate("__ytm.standalone") is False)
    ok("3 games on home", pg.locator(".gcard2").count() == 3)
    ok("'Add to Home Screen' hint shown in the browser", pg.locator(".a2hs").count() == 1)
    head = pg.evaluate("document.head.innerHTML")
    ok("iOS web-app meta tags", all(k in head for k in ["apple-mobile-web-app-capable", "black-translucent", "apple-touch-icon", "viewport-fit=cover", 'rel="manifest"']))
    man = pg.evaluate("fetch('manifest.webmanifest').then(r=>r.json())")
    ok("manifest: standalone, portrait, icons", man["display"] == "standalone" and man["orientation"] == "portrait" and len(man["icons"]) == 3)
    ok("apple-touch-icon is 180x180", pg.evaluate("new Promise(r=>{const i=new Image();i.onload=()=>r(i.width+'x'+i.height);i.src='apple-touch-icon.png'})") == "180x180")
    pg.evaluate("navigator.serviceWorker.ready.then(()=>1)"); time.sleep(1.5)
    ok("service worker active", pg.evaluate("navigator.serviceWorker.controller!==null || navigator.serviceWorker.getRegistration().then(r=>!!r.active)"))
    ok("no audio before a tap", pg.evaluate("__ytm.audio.debug().state") == "none")
    pg.screenshot(path=str(SHOT/"50-ios-home.png"))
    T(pg, "a2hsHide"); ok("hint can be dismissed", pg.locator(".a2hs").count() == 0)
    ok("audio context running after first touch", pg.evaluate("__ytm.audio.debug()")["unlocked"] and pg.evaluate("__ytm.audio.debug().state") == "running")
    # players by touch + keyboard
    T(pg, "play", "bomb")
    for nm in ["بيجاد", "منة", "كريم"]:
        T(pg, "add"); pg.fill("#pname", nm); T(pg, "saveP")
    ok("players added by touch", pg.evaluate("__ytm.state.players.length") == 3)
    ok("input font >= 16px (no iOS focus zoom)", (T(pg, "add"), pg.evaluate("parseFloat(getComputedStyle(document.querySelector('#pname')).fontSize)") >= 16)[1]); T(pg, "closeOv")
    T(pg, "toSettings"); T(pg, "b_time", "20"); T(pg, "b_mode", "cinematic"); T(pg, "b_start"); T(pg, "b_go")
    pg.wait_for_function("__ytm.audio.debug().music==='cinematic' && __ytm.audio.debug().buffers.includes('tick')", timeout=10000)
    ok("bomb sounds + music decode and play (mp3)", True)
    T(pg, "b_done"); ok("touch passes the turn", scr(pg) == "b_live")
    pg.screenshot(path=str(SHOT/"51-ios-bomb.png"))
    pg.wait_for_function("__ytm.screen()==='b_boom'", timeout=25000); ok("bomb explodes in real time", True)
    T(pg, "exit"); T(pg, "exitYes")
    # IndexedDB backup
    time.sleep(.4); idb = pg.evaluate("new Promise(r=>{const q=indexedDB.open('ytm',1);q.onsuccess=()=>{const g=q.result.transaction('kv').objectStore('kv').get('state');g.onsuccess=()=>r(g.result)}})")
    ok("state mirrored to IndexedDB", idb and len(idb["players"]) == 3 and idb["bomb"]["time"] == 20)
    pg.evaluate("localStorage.removeItem('ytm_state')"); pg.reload(); pg.wait_for_function("window.__ytm && __ytm.state.players.length===3", timeout=5000)
    ok("players + settings restored from IndexedDB after localStorage loss", pg.evaluate("__ytm.state.bomb.time") == 20 and pg.evaluate("__ytm.state.bomb.mode") == "cinematic")
    # offline
    ctx.set_offline(True); srv.terminate(); srv.wait(); pg.reload(); pg.wait_for_function("window.__ytm && __ytm.screen()==='home'", timeout=8000)
    ok("opens offline from the service-worker cache", pg.locator(".gcard2").count() == 3)
    ok("fonts available offline", pg.evaluate("document.fonts.ready.then(()=>document.fonts.check('20px Lalezar','يا'))"))
    T(pg, "play", "village"); T(pg, "toSettings"); T(pg, "v_start")
    pg.wait_for_function("__ytm.audio.debug().music==='mystery'", timeout=10000); ok("village + music work offline", scr(pg) == "v_pass")
    T(pg, "v_show"); ok("role reveal by touch", scr(pg) == "v_role"); pg.screenshot(path=str(SHOT/"52-ios-role.png"))
    T(pg, "exit"); T(pg, "exitYes"); T(pg, "play", "auction"); T(pg, "toSettings"); T(pg, "start"); T(pg, "reveal"); ok("auction works offline", scr(pg) == "bidding")
    T(pg, "exit"); T(pg, "exitYes")
    # screen sizes: iPhone SE (Safari bars / installed), 13, Pro Max, landscape-ish small height, iPad
    pg.evaluate("(()=>{const s=__ytm.state;for(let i=3;i<12;i++)s.players.push({id:'x'+i,name:'لاعب '+(i+1),av:i})})()")
    bad = []
    for w, h in [(320, 568), (375, 548), (375, 667), (390, 664), (390, 844), (430, 932), (768, 1024)]:
        pg.set_viewport_size({"width": w, "height": h})
        T(pg, "home") if scr(pg) != "home" else None
        if not fits(pg): bad.append((w, h, "home"))
        T(pg, "play", "bomb"); T(pg, "toSettings"); T(pg, "b_start"); T(pg, "b_go"); time.sleep(.15)
        if not fits(pg): bad.append((w, h, "bomb"))
        T(pg, "exit"); T(pg, "exitYes"); T(pg, "play", "village"); T(pg, "toSettings"); T(pg, "v_start"); T(pg, "v_show")
        if not fits(pg): bad.append((w, h, "role"))
        T(pg, "exit"); T(pg, "exitYes"); T(pg, "play", "auction"); T(pg, "toSettings"); T(pg, "start"); T(pg, "reveal"); time.sleep(.1)
        if not fits(pg): bad.append((w, h, "auction"))
        T(pg, "exit"); T(pg, "exitYes")
    ok("layouts fit 7 iPhone/iPad screen sizes x 4 screens", not bad, bad)
    ctx.close()
    # installed (home-screen) mode: no hint
    ctx = b.new_context(**dev); ctx.add_init_script("Object.defineProperty(navigator,'standalone',{get:()=>true})"); ctx.set_offline(False)
    pg = ctx.new_page(); pg.goto((R/"dist/web/index.html").as_uri()); pg.wait_for_function("window.__ytm")
    ok("installed mode: detected, no install hint", pg.evaluate("__ytm.standalone") is True and pg.locator(".a2hs").count() == 0)
    b.close()
finally:
    srv.poll() is None and srv.terminate()
ok("no JS/console errors", not errs, errs[:5])
bad = [n for n, c in checks if not c]
print(f"\n{len(checks)-len(bad)}/{len(checks)} checks passed"); sys.exit(1 if bad else 0)
