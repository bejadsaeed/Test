"""End-to-end test: plays full matches in a mobile-size headless Chromium."""
import sys, pathlib, json, subprocess, time
from playwright.sync_api import sync_playwright
R = pathlib.Path(sys.argv[1]); SHOT = R/"tests/shots"; SHOT.mkdir(exist_ok=True)
errs = []; checks = []
def ok(name, cond, extra=""):
    checks.append((name, bool(cond))); print(("PASS " if cond else "FAIL ")+name, extra)
def A(pg, a, v=None):
    sel = f'[data-a="{a}"]' + (f'[data-v="{v}"]' if v is not None else "")
    pg.locator(sel).first.click(force=True)
def scr(pg): return pg.evaluate("__ytm.screen()")
def M(pg, expr): return pg.evaluate(f"(()=>{{const M=__ytm.match();return {expr}}})()")
def play_round(pg, bids, outcome, shot=None):
    A(pg, "reveal"); assert scr(pg) == "bidding"
    ids = pg.evaluate("__ytm.state.players.map(p=>p.id)")
    for who, n in bids:
        A(pg, "selP", ids[who])
        while int(pg.inner_text("#bv")) < n: A(pg, "bidAdj", "1")
        A(pg, "bid")
    if shot: pg.screenshot(path=str(SHOT/f"{shot}-bidding.png"))
    A(pg, "lock"); pg.clock.run_for(1000)
    if shot: pg.screenshot(path=str(SHOT/f"{shot}-lock.png"))
    pg.clock.run_for(3000)
    if pg.locator(".ov.wasta").count():
        pg.clock.run_for(1200)
        if shot: pg.screenshot(path=str(SHOT/f"{shot}-wasta.png"))
        A(pg, "wastaGo")
    assert scr(pg) == "ready", scr(pg)
    if shot: pg.screenshot(path=str(SHOT/f"{shot}-ready.png"))
    A(pg, "go"); high = M(pg, "M.high")
    if outcome == "win":
        for i in range(high):
            if shot and i == high-1: pg.clock.run_for(9000); pg.screenshot(path=str(SHOT/f"{shot}-run.png"))
            A(pg, "hit")
    elif outcome == "timeout":
        A(pg, "hit"); A(pg, "hit"); A(pg, "undo")
        pg.clock.run_for(27000)
        if shot: pg.screenshot(path=str(SHOT/f"{shot}-run-warn.png"))
        pg.clock.run_for(5000)
    else: A(pg, "giveup")
    assert scr(pg) == "result", scr(pg)
    pg.clock.run_for(700)
    if shot: pg.screenshot(path=str(SHOT/f"{shot}-result.png"))

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width":390,"height":844}, device_scale_factor=2, has_touch=True, is_mobile=True, locale="ar-EG")
    pg = ctx.new_page(); pg.clock.install()
    pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.goto((R/"dist/single/index.html").as_uri()); pg.clock.run_for(600)
    ok("fonts loaded", pg.evaluate("document.fonts.check('20px Lalezar','يا') && document.fonts.check('20px \"Baloo Bhaijaan 2\"','يا')"))
    ok("rtl", pg.evaluate("getComputedStyle(document.body).direction") == "rtl")
    ok("question count >= 500", pg.evaluate("__ytm.total") >= 500, pg.evaluate("__ytm.total"))
    pg.screenshot(path=str(SHOT/"01-home.png"))
    A(pg, "howto"); pg.clock.run_for(500); pg.screenshot(path=str(SHOT/"02-howto.png"))
    A(pg, "howNext"); A(pg, "howNext"); A(pg, "howNext"); A(pg, "closeOv")
    A(pg, "play"); ok("next disabled <2 players", pg.locator('[data-a="toSettings"]').is_disabled())
    for i, nm in enumerate(["بيجاد", "منة", "كريم", "سلمى"]):
        A(pg, "add"); A(pg, "pickAv", str((i*3+1) % 16)); pg.fill("#pname", nm)
        if i == 0: pg.clock.run_for(500); pg.screenshot(path=str(SHOT/"03-editor.png"))
        A(pg, "saveP")
    ok("4 players added", pg.evaluate("__ytm.state.players.length") == 4)
    A(pg, "edit", pg.evaluate("__ytm.state.players[3].id")); pg.fill("#pname", "سلمى ٢"); A(pg, "saveP")
    A(pg, "del", pg.evaluate("__ytm.state.players[3].id"))
    ok("edit+delete player", pg.evaluate("__ytm.state.players.length") == 3)
    pg.clock.run_for(500); pg.screenshot(path=str(SHOT/"04-players.png"))
    A(pg, "toSettings"); A(pg, "rounds", "1"); A(pg, "rounds", "-1"); A(pg, "timer", "45"); A(pg, "timer", "30")
    A(pg, "cat", "names"); A(pg, "cat", "names")
    ok("defaults: 5 rounds / 30s / 8 cats", pg.evaluate("JSON.stringify(__ytm.state.settings.rounds+'-'+__ytm.state.settings.timer+'-'+__ytm.state.settings.cats.length)") == '"5-30-8"')
    pg.clock.run_for(500); pg.screenshot(path=str(SHOT/"05-settings.png"))
    pg.evaluate("window.__forceWasta=false"); A(pg, "start"); ok("match started", scr(pg) == "intro"); pg.clock.run_for(500); pg.screenshot(path=str(SHOT/"06-intro.png"))
    ids = pg.evaluate("__ytm.state.players.map(p=>p.id)")
    # R1: p0 bids 3, p1 bids 5 and succeeds -> +500
    play_round(pg, [(0,3),(1,5)], "win", "r1")
    ok("R1 win = +500", M(pg, "M.scores")[ids[1]] == 500, M(pg, "M.scores"))
    A(pg, "next")
    # R2: test skip + cancel lock, p0 bids 4, timeout -> -500
    A(pg, "reveal"); q1 = M(pg, "M.q.id"); A(pg, "skip"); ok("skip changes question", M(pg, "M.q.id") != q1)
    A(pg, "bid"); ok("bid needs a selected player", M(pg, "M.high") == 0)
    A(pg, "selP", ids[0]); A(pg, "bid"); A(pg, "lock"); pg.clock.run_for(500); A(pg, "cancelLock"); pg.clock.run_for(4000)
    ok("lock can be cancelled", scr(pg) == "bidding")
    pg.evaluate("__ytm.screen()"); A(pg, "exit"); A(pg, "closeOv")
    # finish R2 manually
    A(pg, "selP", ids[0]); A(pg, "bidAdj", "1"); A(pg, "bidAdj", "1"); A(pg, "bid"); ok("raise works", M(pg, "M.high") == 4, M(pg, "M.high"))
    A(pg, "lock"); pg.clock.run_for(4000); A(pg, "go"); A(pg, "hit"); A(pg, "hit"); A(pg, "undo")
    ok("undo", M(pg, "M.got") == 1)
    pg.clock.run_for(27000); pg.screenshot(path=str(SHOT/"r2-run-warn.png")); pg.clock.run_for(5000)
    ok("timeout => fail screen", scr(pg) == "result" and M(pg, "M.last.ok") is False)
    ok("R2 fail = -500", M(pg, "M.scores")[ids[0]] == -500)
    pg.clock.run_for(700); pg.screenshot(path=str(SHOT/"r2-result.png")); A(pg, "next")
    # R3: forced wasta, p2 bids 6 and wins -> +1200
    pg.evaluate("window.__forceWasta=true")
    play_round(pg, [(2,6)], "win", "r3")
    ok("wasta win x2 = +1200", M(pg, "M.scores")[ids[2]] == 1200, M(pg, "M.scores"))
    A(pg, "next")
    # R4: wasta still forced but must NOT trigger twice; p1 gives up -> 500-500 = 0
    play_round(pg, [(1,2)], "giveup")
    ok("wasta max once per match", M(pg, "M.wasta") is False and M(pg, "M.scores")[ids[1]] == 0, M(pg, "M.scores"))
    pg.evaluate("window.__forceWasta=false"); A(pg, "next")
    play_round(pg, [(0,1),(1,2),(0,7)], "win")
    ok("R5 = -500+700", M(pg, "M.scores")[ids[0]] == 200)
    used1 = M(pg, "M.used"); ok("no repeats inside a match", len(set(used1)) == len(used1) == 6, len(used1))
    A(pg, "next"); ok("final screen after 5 rounds", scr(pg) == "final"); pg.clock.run_for(1500); pg.screenshot(path=str(SHOT/"09-final.png"))
    ok("winner shown = كريم", "كريم" in pg.inner_text(".screen .gold"))
    # match 2..4: history avoidance + different order
    orders = [used1]
    for m in range(3):
        A(pg, "again")
        for r in range(5):
            play_round(pg, [(r % 3, 1)], "win"); 
            if r < 4: A(pg, "next")
        orders.append(M(pg, "M.used")); A(pg, "next")
    flat = [q for o in orders for q in o]
    ok("no question repeated across 4 consecutive matches", len(set(flat)) == len(flat), len(flat))
    hist = pg.evaluate("JSON.parse(localStorage.getItem('ytm_hist'))")
    ok("history keeps last 3 matches", len(hist) == 3)
    # persistence + back handler
    pg.reload(); pg.clock.run_for(500)
    ok("players persist after reload", pg.evaluate("__ytm.state.players.length") == 3)
    ok("back on home not handled (app exits)", pg.evaluate("__back()") is False)
    A(pg, "play"); ok("back from players -> home", pg.evaluate("__back()") is True and scr(pg) == "home")
    # 12 players layout
    pg.evaluate("for(let i=3;i<12;i++)__ytm.state.players.push({id:'x'+i,name:'لاعب '+(i+1),av:i});")
    A(pg, "play"); ok("add hidden at 12", pg.locator('[data-a="add"]').count() == 0)
    A(pg, "toSettings"); A(pg, "start"); A(pg, "reveal"); A(pg, "selP", "x7"); A(pg, "bid"); pg.clock.run_for(500)
    pg.screenshot(path=str(SHOT/"10-bidding-12p.png"))
    fits = pg.evaluate("[...document.querySelectorAll('.screen>*')].every(e=>{const r=e.getBoundingClientRect();return r.bottom<=innerHeight+1&&r.left>=-1&&r.right<=innerWidth+1})")
    ok("12-player bidding fits screen", fits)
    # small phone
    pg.set_viewport_size({"width":320,"height":568}); pg.clock.run_for(300); pg.screenshot(path=str(SHOT/"11-small-phone.png"))
    ok("fits 320x568", pg.evaluate("[...document.querySelectorAll('.screen>*')].every(e=>{const r=e.getBoundingClientRect();return r.bottom<=innerHeight+1})"))
    ctx.close()

    # offline PWA test over http
    srv = subprocess.Popen([sys.executable, "-m", "http.server", "8765", "--bind", "127.0.0.1", "-d", str(R/"dist/web")], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1)
    try:
        ctx = b.new_context(viewport={"width":390,"height":844}); pg = ctx.new_page()
        pg.goto("http://127.0.0.1:8765/"); pg.evaluate("navigator.serviceWorker.ready.then(()=>1)"); time.sleep(1.5)
        ctx.set_offline(True); srv.terminate(); srv.wait()
        pg.reload(); time.sleep(.5)
        ok("PWA loads offline after first visit", pg.evaluate("typeof __ytm==='object' && __ytm.screen()") == "home")
        pg.locator("[data-a=\"play\"]").first.click(force=True); ok("PWA playable offline", pg.evaluate("__ytm.screen()") == "players")
    finally:
        srv.poll() is None and srv.terminate()
    b.close()
ok("no JS/console errors", not errs, errs[:5])
bad = [n for n, c in checks if not c]
print(f"\n{len(checks)-len(bad)}/{len(checks)} checks passed"); sys.exit(1 if bad else 0)
