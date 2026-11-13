"""End-to-end tests for the Bomb + Village games and the shared audio system (mobile-size headless Chromium)."""
import sys, pathlib, json
from playwright.sync_api import sync_playwright
R = pathlib.Path(sys.argv[1]); SHOT = R/"tests/shots"; SHOT.mkdir(exist_ok=True)
errs = []; checks = []
def ok(name, cond, extra=""):
    checks.append((name, bool(cond))); print(("PASS " if cond else "FAIL ")+name, extra if not cond or extra != "" else "")
def A(pg, a, v=None):
    pg.locator(f'[data-a="{a}"]' + (f'[data-v="{v}"]' if v is not None else "")).first.click(force=True)
def scr(pg): return pg.evaluate("__ytm.screen()")
def B(pg, e): return pg.evaluate(f"(()=>{{const B=__ytm.bomb();return {e}}})()")
def V(pg, e): return pg.evaluate(f"(()=>{{const V=__ytm.village();return {e}}})()")
def au(pg): return pg.evaluate("__ytm.audio.debug()")
def shot(pg, n, ms=600): pg.clock.run_for(ms); pg.screenshot(path=str(SHOT/f"{n}.png"))
def set_players(pg, n):
    pg.evaluate(f"(()=>{{const s=__ytm.state;s.players.length=0;const N=['بيجاد','منة','كريم','سلمى','عمر','نور','يوسف','هنا','علي','ليلى','زياد','فرح'];for(let i=0;i<{n};i++)s.players.push({{id:'p'+i,name:N[i],av:i}});}})()")
def fits(pg): return pg.evaluate("[...document.querySelectorAll('.screen>*')].every(e=>{const r=e.getBoundingClientRect();return r.bottom<=innerHeight+1&&r.left>=-1&&r.right<=innerWidth+1})")

def village_deal(pg):
    roles = V(pg, "V.roles"); seen = {}
    for i, pid in enumerate(V(pg, "V.order")):
        assert scr(pg) == "v_pass"; A(pg, "v_show"); assert scr(pg) == "v_role"
        txt = pg.inner_text(".rname"); seen[pid] = "t" if "الحرامي" in txt else "v"
        A(pg, "v_hide")
    return roles, seen
def village_vote(pg, choose):
    """choose(voter_id, alive) -> target id. Returns (alive_before, self_offered)."""
    A(pg, "v_vote"); alive = V(pg, "V.alive"); self_offered = False
    for voter in alive:
        assert scr(pg) == "v_vpass", scr(pg); A(pg, "v_ballot")
        opts = pg.evaluate("[...document.querySelectorAll('.pb.vote')].map(b=>b.dataset.v)")
        self_offered |= voter in opts or len(opts) != len(alive) - 1
        assert pg.locator('[data-a="v_confirm"]').is_disabled()
        A(pg, "v_pick", choose(voter, alive)); A(pg, "v_confirm")
    assert scr(pg) == "v_wait", scr(pg)
    return alive, self_offered

with sync_playwright() as p:
    b = p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
    ctx = b.new_context(viewport={"width":390,"height":844}, device_scale_factor=2, has_touch=True, is_mobile=True, locale="ar-EG")
    pg = ctx.new_page(); pg.clock.install()
    pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.goto((R/"dist/single/index.html").as_uri()); pg.clock.run_for(600)

    # ---------- home + audio ----------
    ok("home shows 3 game cards", pg.locator(".gcard2").count() == 3 and [pg.locator(".gcard2 b").nth(i).inner_text() for i in range(3)] == ["المزاد", "القنبلة", "أهل القرية"])
    ok("each card has play + info buttons", pg.locator('.gcard2 [data-a="play"]').count() == 3 and pg.locator('.gcard2 [data-a="howto"]').count() == 3)
    ok("no audio context before first tap", au(pg)["state"] == "none" and not au(pg)["unlocked"])
    shot(pg, "20-home")
    for g, n in (("auction", 4), ("bomb", 4), ("village", 4)):
        A(pg, "howto", g); k = 1
        while pg.locator('[data-a="howNext"]').count(): A(pg, "howNext"); k += 1
        if g == "village": shot(pg, "21-howto-village")
        A(pg, "closeOv"); ok(f"how-to for {g} has {n} pages", k == n, k)
    ok("audio unlocked by a tap", au(pg)["unlocked"])
    A(pg, "audio"); shot(pg, "22-audio-panel")
    pg.locator('[data-vol="music"]').fill("30"); pg.locator('[data-vol="sfx"]').fill("80"); pg.locator('[data-vol="master"]').fill("90")
    A(pg, "audioTg", "musicOn"); cfg = pg.evaluate("__ytm.audio.get()")
    ok("independent volumes + music toggle", abs(cfg["music"]-.3) < .01 and abs(cfg["sfx"]-.8) < .01 and abs(cfg["master"]-.9) < .01 and cfg["musicOn"] is False and cfg["sfxOn"] is True, cfg)
    A(pg, "audioTg", "musicOn"); A(pg, "mute", "panel"); ok("mute from panel", pg.evaluate("__ytm.audio.get().muted") is True)
    A(pg, "mute", "panel"); A(pg, "closeOv")
    ok("audio settings saved locally", json.loads(pg.evaluate("localStorage.getItem('ytm_audio')"))["music"] == 0.3)

    # ---------- BOMB ----------
    set_players(pg, 1); A(pg, "play", "bomb")
    ok("bomb needs 2 players", pg.locator('[data-a="toSettings"]').is_disabled())
    A(pg, "add"); pg.fill("#pname", "منة"); A(pg, "saveP"); A(pg, "add"); pg.fill("#pname", "كريم"); A(pg, "saveP")
    A(pg, "del", pg.evaluate("__ytm.state.players[2].id")); A(pg, "add"); pg.fill("#pname", "كريم"); A(pg, "saveP")
    ok("add/remove players from bomb flow", pg.evaluate("__ytm.state.players.length") == 3)
    ids = pg.evaluate("__ytm.state.players.map(p=>p.id)")
    A(pg, "toSettings"); ok("bomb settings screen", scr(pg) == "set_bomb")
    A(pg, "b_rounds", "-1"); A(pg, "b_rounds", "-1"); A(pg, "b_time", "30"); A(pg, "b_mode", "cinematic")
    A(pg, "b_cat", "names"); A(pg, "b_cat", "food"); cats6 = pg.evaluate("__ytm.state.bomb.cats.length")
    A(pg, "b_all"); A(pg, "b_shuffle"); A(pg, "b_shuffle")
    st = pg.evaluate("__ytm.state.bomb")
    ok("bomb settings: rounds/time/mode/cats/all/shuffle", st["rounds"] == 3 and st["time"] == 30 and st["mode"] == "cinematic" and cats6 == 6 and len(st["cats"]) == 8 and st["shuffle"] is True and st["random"] is True, st)
    shot(pg, "23-bomb-settings")
    A(pg, "b_start"); ok("bomb round ready", scr(pg) == "b_ready" and B(pg, "B.round") == 1)
    q0 = B(pg, "B.q.id"); A(pg, "b_skip"); ok("skip changes bomb question", B(pg, "B.q.id") != q0)
    shot(pg, "24-bomb-ready")
    pg.clock.run_for(60000); ok("fuse does not burn before 'بدأت اللعب'", scr(pg) == "b_ready")
    t0 = B(pg, "B.turn"); A(pg, "b_go"); dur = B(pg, "B.dur")
    ok("random fuse inside the chosen time", 0.35*30000 - 1 <= dur <= 30000, dur)
    pg.wait_for_function("__ytm.audio.debug().music==='cinematic' && __ytm.audio.debug().buffers.includes('tick')", timeout=8000)
    ok("cinematic mode: music + local mp3 decoded", True)
    A(pg, "b_done"); A(pg, "b_done"); ok("'تم' passes the turn round-robin", B(pg, "B.turn") == (t0 + 2) % 3)
    q1 = B(pg, "B.q.id"); A(pg, "b_skip"); ok("skip works while live", B(pg, "B.q.id") != q1 and scr(pg) == "b_live")
    pg.clock.run_for(3000); shot(pg, "25-bomb-live", 0)
    A(pg, "exit"); pg.clock.run_for(120000); ok("fuse paused while exit dialog is open", B(pg, "B.phase") == "live")
    A(pg, "closeOv"); el = B(pg, "B.elapsed"); pg.clock.run_for(dur - el - 400); ok("still ticking just before the fuse ends", scr(pg) == "b_live", scr(pg))
    cur_id = B(pg, "B.order[B.turn]"); pg.clock.run_for(600)
    ok("bomb explodes on time", scr(pg) == "b_boom")
    ok("player holding the turn loses", B(pg, "B.loser") == cur_id and B(pg, "B.strikes")[cur_id] == 1)
    ok("screen shake on explosion", pg.evaluate("document.body.classList.contains('quake')"))
    ok("music stops on explosion", au(pg)["music"] is None)
    pg.screenshot(path=str(SHOT/"26-bomb-boom-flash.png")); shot(pg, "26-bomb-boom", 1600)
    A(pg, "b_next"); ok("next round starts after the loser", B(pg, "B.round") == 2 and B(pg, "B.order[B.turn]") == ids[(ids.index(cur_id)+1) % 3])
    A(pg, "b_go"); l2 = B(pg, "B.order[B.turn]"); pg.clock.run_for(31000); ok("round 2 explodes", scr(pg) == "b_boom")
    A(pg, "b_next"); A(pg, "b_go"); pg.clock.run_for(31000); l3 = B(pg, "B.loser"); A(pg, "b_next")
    ok("bomb final screen after 3 rounds", scr(pg) == "b_end")
    strikes = B(pg, "B.strikes"); best = min(strikes.values()); names = pg.inner_text(".screen .gold")
    winners = [pg.evaluate(f"__ytm.state.players.find(p=>p.id==='{i}').name") for i in ids if strikes[i] == best]
    ok("bomb winner = fewest explosions", all(w in names for w in winners) and sum(strikes.values()) == 3, (strikes, names))
    shot(pg, "27-bomb-end", 1200)
    used = B(pg, "B.used"); A(pg, "b_again"); ok("bomb replay resets", B(pg, "B.round") == 1 and sum(B(pg, "B.strikes").values()) == 0)
    ok("bomb replay avoids last match questions", B(pg, "B.q.id") not in used)
    # fixed time + normal mode + exit
    A(pg, "exit"); A(pg, "exitYes"); ok("exit bomb -> home, game cleared", scr(pg) == "home" and B(pg, "B") is None)
    A(pg, "play", "bomb"); A(pg, "toSettings"); A(pg, "b_random"); A(pg, "b_mode", "normal"); A(pg, "b_time", "20"); A(pg, "b_start"); A(pg, "b_go")
    ok("fixed fuse = exactly the chosen time", B(pg, "B.dur") == 20000 and au(pg)["music"] is None, B(pg, "B.dur"))
    pg.clock.run_for(19500); ok("fixed: alive at 19.5s", scr(pg) == "b_live"); pg.clock.run_for(700); ok("fixed: boom at 20s", scr(pg) == "b_boom")
    ok("android back during a bomb match asks to exit", pg.evaluate("__back()") is True and pg.locator(".ov .modal").count() == 1)
    A(pg, "exitYes"); ok("no sound left playing after leaving", au(pg)["music"] is None and au(pg)["live"] == 0)
    A(pg, "play", "bomb"); A(pg, "toSettings"); A(pg, "b_random"); A(pg, "b_mode", "tension"); A(pg, "b_start"); A(pg, "mute")
    ok("quick mute inside a game", pg.evaluate("__ytm.audio.get().muted") is True and pg.locator("[data-mute]").first.inner_text() == "🔇")
    A(pg, "b_go"); pg.clock.run_for(31000); ok("bomb still works with sound muted", scr(pg) == "b_boom")
    A(pg, "mute"); A(pg, "exit"); A(pg, "exitYes")

    # ---------- VILLAGE ----------
    set_players(pg, 2); A(pg, "play", "village")
    ok("village needs 3 players", pg.locator('[data-a="toSettings"]').is_disabled() and "3 لاعيبة" in pg.inner_text(".screen"))
    A(pg, "home"); set_players(pg, 4); A(pg, "play", "village"); A(pg, "toSettings"); ok("village settings", scr(pg) == "set_village")
    A(pg, "v_thieves", "2"); ok("2 thieves rejected for 4 players", pg.evaluate("__ytm.state.village.thieves") == 1)
    ok("distribution shown: 3 + 1", pg.inner_text("#vdv") == "3" and pg.inner_text("#vdt") == "1")
    A(pg, "toPlayers"); set_players(pg, 7); A(pg, "toSettings"); A(pg, "v_thieves", "3"); ok("3 thieves allowed for 7 players", pg.evaluate("__ytm.state.village.thieves") == 3 and pg.inner_text("#vdv") == "4")
    A(pg, "toPlayers"); set_players(pg, 5); A(pg, "toSettings")
    ok("thieves auto-clamped when players drop to 5", pg.evaluate("__ytm.state.village.thieves") == 2 and pg.inner_text("#vdv") == "3")
    shot(pg, "30-village-settings")
    A(pg, "v_start"); shot(pg, "31-village-pass")
    pg.wait_for_function("__ytm.audio.debug().music==='mystery'", timeout=8000); ok("mystery music starts", True)
    A(pg, "v_show"); shot(pg, "32-village-role"); A(pg, "exit"); A(pg, "exitYes")
    A(pg, "play", "village"); A(pg, "toSettings"); A(pg, "v_start")
    roles, seen = village_deal(pg)
    ok("every player saw exactly his own role", roles == seen and list(roles.values()).count("t") == 2, (roles, seen))
    ok("discussion starts after dealing", scr(pg) == "v_talk")
    thieves = [k for k, v in roles.items() if v == "t"]; vill = [k for k, v in roles.items() if v == "v"]
    A(pg, "v_more"); A(pg, "v_more"); ok("'لفة نقاش كمان' counts laps", V(pg, "V.talk") == 3 and scr(pg) == "v_talk")
    shot(pg, "33-village-talk")
    # tie: thieves vote vill[0], villagers split so that vill[0] and thieves[0] both get 2
    def tie(v, alive):
        if v in thieves: return vill[0]
        return thieves[0] if v in vill[:2] else vill[1] if v != vill[1] else vill[2]
    alive, self_off = village_vote(pg, tie)
    ok("cannot vote for yourself", not self_off)
    names = pg.evaluate("__ytm.state.players.map(p=>p.name)"); wt = pg.inner_text(".screen")
    ok("no vote is shown before the reveal", not any(n in wt for n in names), wt)
    shot(pg, "34-village-wait"); A(pg, "v_reveal")
    ok("suspense overlay cannot be dismissed with back", pg.evaluate("__back()") is True and pg.locator(".ov.block").count() == 1)
    pg.clock.run_for(2600); ok("tie => nobody eliminated", scr(pg) == "v_result" and V(pg, "V.last.tie") is True and len(V(pg, "V.alive")) == 5)
    shot(pg, "35-village-tie"); A(pg, "v_after"); ok("tie => new discussion round", scr(pg) == "v_talk" and V(pg, "V.round") == 2 and V(pg, "V.talk") == 1)
    # eliminate a villager (role must stay hidden) -> 2 thieves vs 2 villagers => thieves win
    village_vote(pg, lambda v, alive: vill[0] if v != vill[0] else thieves[0]); A(pg, "v_reveal"); pg.clock.run_for(2600)
    txt = pg.inner_text(".screen")
    ok("most voted player is eliminated", V(pg, "V.out") == [vill[0]] and vill[0] not in V(pg, "V.alive"))
    ok("eliminated role is NOT revealed", "🦹" not in txt and "🏡" not in txt and "حرامي" not in txt and "أهل القرية" not in txt, txt)
    shot(pg, "36-village-out")
    ok("thieves win when thieves >= villagers", V(pg, "V.winner") == "t")
    A(pg, "v_after"); ok("end screen", scr(pg) == "v_end"); txt = pg.inner_text(".screen")
    ok("end: thieves win + all roles revealed", "الحرامية كسبوا" in txt and txt.count("🦹 حرامي") == 2 and txt.count("🏡 أهل القرية") == 3, txt)
    shot(pg, "37-village-end-thieves", 1200); ok("music stops at the end", au(pg)["music"] is None)
    # replay: reshuffled roles; villagers win path with 1 thief out of 4; eliminated player does not vote
    seen_sets = set()
    A(pg, "v_again")
    for _ in range(8):
        A(pg, "exit"); A(pg, "exitYes"); A(pg, "play", "village"); A(pg, "toSettings"); A(pg, "v_start"); seen_sets.add(tuple(sorted(k for k, v in V(pg, "V.roles").items() if v == "t")))
    ok("'العب تاني' redistributes roles randomly", len(seen_sets) > 1 and V(pg, "V.phase") == "deal" and len(V(pg, "V.alive")) == 5, len(seen_sets))
    roles, _ = village_deal(pg); thieves = [k for k, v in roles.items() if v == "t"]; vill = [k for k, v in roles.items() if v == "v"]
    village_vote(pg, lambda v, alive: thieves[0] if v != thieves[0] else vill[0]); A(pg, "v_reveal"); pg.clock.run_for(2600)
    ok("one thief out, game continues", V(pg, "V.winner") is None and V(pg, "V.out") == [thieves[0]]); A(pg, "v_after")
    alive, _ = village_vote(pg, lambda v, alive: thieves[1] if v != thieves[1] else vill[0])
    ok("eliminated player does not vote", thieves[0] not in alive and len(alive) == 4 and len(V(pg, "V.votes")) == 4)
    A(pg, "v_reveal"); pg.clock.run_for(2600); A(pg, "v_after"); txt = pg.inner_text(".screen")
    ok("villagers win when all thieves are out", scr(pg) == "v_end" and "أهل القرية كسبوا" in txt and txt.count("اتطرد") == 2, txt)
    shot(pg, "38-village-end-villagers", 1200)
    ok("back on end screen -> home", pg.evaluate("__back()") is True and scr(pg) == "home" and V(pg, "V") is None)
    # 12 players + small phone layouts
    set_players(pg, 12); A(pg, "play", "village"); A(pg, "toSettings"); A(pg, "v_thieves", "3"); A(pg, "v_start"); village_deal(pg); A(pg, "v_vote"); A(pg, "v_ballot")
    shot(pg, "39-village-ballot-12"); ok("12-player ballot fits", fits(pg))
    pg.set_viewport_size({"width":320,"height":568}); pg.clock.run_for(300); ok("ballot fits 320x568", fits(pg))
    A(pg, "exit"); A(pg, "exitYes"); shot(pg, "40-home-small"); ok("home fits 320x568", fits(pg))
    A(pg, "play", "bomb"); A(pg, "toSettings"); A(pg, "b_start"); A(pg, "b_go"); pg.clock.run_for(2000); ok("bomb live fits 320x568", fits(pg)); shot(pg, "41-bomb-small", 0)
    # close the app mid-game and reopen
    pg.set_viewport_size({"width":390,"height":844}); pg.reload(); pg.clock.run_for(500)
    ok("reopen mid-game: clean home, players + settings kept", scr(pg) == "home" and pg.evaluate("__ytm.state.players.length") == 12 and pg.evaluate("__ytm.state.village.thieves") == 3 and pg.evaluate("__ytm.state.bomb.time") == 20, pg.evaluate("JSON.stringify([__ytm.screen(),__ytm.state.players.length,__ytm.state.village,__ytm.state.bomb.time])"))
    ok("reopen: audio settings kept", abs(pg.evaluate("__ytm.audio.get().music") - .3) < .01)
    # auction still reachable and intact
    A(pg, "play", "auction"); A(pg, "toSettings"); ok("auction settings intact", scr(pg) == "settings"); A(pg, "start"); ok("auction starts", scr(pg) == "intro")
    ctx.close(); b.close()
ok("no JS/console errors", not errs, errs[:5])
bad = [n for n, c in checks if not c]
print(f"\n{len(checks)-len(bad)}/{len(checks)} checks passed"); sys.exit(1 if bad else 0)
