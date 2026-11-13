/* 💣 لعبة القنبلة — منطق مستقل، بيستخدم النواة المشتركة (YTM) ونظام الصوت الموحد */
(function () {
  "use strict";
  var Y = window.YTM, S = Y.S, AU = Y.AU, esc = Y.esc, av = Y.av, $ = Y.$;
  var ALL = Y.CATS.map(function (c) { return c.id; });
  var TIMES = [20, 30, 45, 60, 90], MODES = [["normal", "عادي", "دقات منتظمة"], ["tension", "توتر", "الدقات بتسرع"], ["cinematic", "سينمائي", "موسيقى ونبض قلب"]];
  var cf = S.bomb = S.bomb || {};
  cf.rounds = cf.rounds || 5; cf.time = TIMES.indexOf(cf.time) >= 0 ? cf.time : 45;
  if (cf.random === undefined) cf.random = true; if (cf.shuffle === undefined) cf.shuffle = true;
  cf.mode = cf.mode || "tension";
  cf.cats = (cf.cats || ALL.slice()).filter(function (c) { return Y.QS[c]; }); if (!cf.cats.length) cf.cats = ALL.slice();
  var B = null, loop = null;

  var ART = '<svg viewBox="0 0 120 120"><defs><radialGradient id="bG" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#6b5a8e"/><stop offset=".45" stop-color="#241a3d"/><stop offset="1" stop-color="#07051a"/></radialGradient></defs><path d="M74 38 C80 22 92 20 98 14" fill="none" stroke="#c9a15a" stroke-width="5" stroke-linecap="round"/><rect x="60" y="30" width="22" height="14" rx="4" transform="rotate(28 71 37)" fill="#3a2d5c"/><circle cx="56" cy="72" r="36" fill="url(#bG)" stroke="#ff4d6d" stroke-width="2.5"/><ellipse cx="42" cy="58" rx="9" ry="5" transform="rotate(-35 42 58)" fill="#ffffff55"/><g class="spark"><path d="M98 14 l4 -10 l2 9 l9 -3 l-7 7 l8 5 l-10 0 l-1 9 l-4 -8 l-8 4 z" fill="#ffcf40"/><circle cx="100" cy="14" r="4" fill="#fff"/></g></svg>';

  /* ---------- settings ---------- */
  function settings() {
    var n = cf.cats.reduce(function (a, c) { return a + Y.QS[c].length; }, 0), allOn = cf.cats.length === ALL.length;
    Y.show("set_bomb",
      '<div class="top"><button class="ic" data-a="toPlayers" aria-label="رجوع">➜</button><h1 class="disp">إعدادات القنبلة</h1><span class="ic ghost"></span></div><div class="scroll">' +
      '<div class="card"><h3>🏁 عدد الجولات</h3><div class="step"><button data-a="b_rounds" data-v="1">+</button><span class="val disp" id="brv">' + cf.rounds + '</span><button data-a="b_rounds" data-v="-1">−</button></div></div>' +
      '<div class="card"><h3>💣 وقت القنبلة <span class="mut sm" style="margin-inline-start:auto;font-weight:600">بالثواني</span></h3><div class="seg five">' + TIMES.map(function (t) { return '<button data-a="b_time" data-v="' + t + '" class="' + (cf.time === t ? "on" : "") + '">' + t + "</button>"; }).join("") + "</div>" +
      '<button class="tgl ' + (cf.random ? "on" : "") + '" data-a="b_random"><span><b>🎲 انفجار عشوائي</b><small>' + (cf.random ? "القنبلة تنفجر في أي لحظة قبل ما الـ " + cf.time + " ثانية يخلصوا" : "القنبلة تنفجر بعد " + cf.time + " ثانية بالظبط") + '</small></span><i></i></button></div>' +
      '<div class="card"><h3>🔊 جو الصوت</h3><div class="seg">' + MODES.map(function (m) { return '<button data-a="b_mode" data-v="' + m[0] + '" class="' + (cf.mode === m[0] ? "on" : "") + '" style="font-size:19px">' + m[1] + "<small>" + m[2] + "</small></button>"; }).join("") + "</div></div>" +
      '<div class="card"><h3>📂 الفئات <span class="mut sm" style="margin-inline-start:auto;font-weight:600">' + n + ' سؤال</span></h3><div class="chips"><button class="chip ' + (allOn ? "on" : "") + '" data-a="b_all">✨ كل الفئات</button>' +
      Y.CATS.map(function (c) { return '<button class="chip ' + (cf.cats.indexOf(c.id) >= 0 ? "on" : "") + '" data-a="b_cat" data-v="' + c.id + '">' + c.icon + " " + c.name + "</button>"; }).join("") + "</div>" +
      '<button class="tgl ' + (cf.shuffle ? "on" : "") + '" data-a="b_shuffle"><span><b>🔀 خلط الأسئلة</b><small>' + (cf.shuffle ? "ترتيب عشوائي كل ماتش" : "الأسئلة بترتيب الفئات") + '</small></span><i></i></button></div>' +
      '</div><button class="btn red" data-a="b_start">ولّع الفتيل 🔥</button>', "", Y.cur() === "set_bomb");
  }

  /* ---------- match ---------- */
  function start() {
    var ids = S.players.map(function (p) { return p.id; });
    if (ids.length < 2) { Y.players(); return; }
    B = { round: 0, total: cf.rounds, mode: cf.mode, deck: Y.deck(cf.cats, "ytm_hist_bomb", cf.rounds * 4, !cf.shuffle), qi: 0, used: [], order: ids, turn: Math.floor(Math.random() * ids.length), strikes: {}, phase: "", saved: false };
    ids.forEach(function (id) { B.strikes[id] = 0; });
    AU.preload(["tick", "tock", "heartbeat", "turn", "begin", "skip", "round_start", "lose", B.mode === "cinematic" ? "explosion_big" : "explosion"].concat(B.mode === "normal" ? [] : [B.mode]));
    try { navigator.wakeLock && navigator.wakeLock.request("screen").catch(function () { }); } catch (e) { }
    nextRound();
  }
  function drawQ() { if (B.qi >= B.deck.length) B.qi = 0; B.q = B.deck[B.qi++]; if (B.used.indexOf(B.q.id) < 0) B.used.push(B.q.id); }
  function curP() { return Y.P(B.order[B.turn]); }
  function top() { return '<div class="top">' + Y.exitBtn + '<span class="pill">الجولة ' + B.round + " / " + B.total + "</span>" + Y.muteBtn() + "</div>"; }
  function qCard() { var c = Y.cat(B.q.c); return '<div class="qcard red" id="bq"><div class="lead">' + c.icon + " " + c.name + ' • كل واحد يقول</div><div class="q">' + esc(B.q.t) + "</div></div>"; }
  function bombArt(cls) { return '<div class="bombwrap ' + (cls || "") + '" id="bomb"><div class="glow"></div>' + ART + "</div>"; }
  function who() { var p = curP(); return av(p.av, "lg") + '<div><div class="mut sm">الدور على</div><b class="disp" style="font-size:34px;line-height:1.1">' + esc(p.name) + "</b></div>"; }

  function nextRound() {
    stopLoop(); AU.stopMusic(0.3);
    B.round++; B.phase = "ready"; drawQ();
    Y.show("b_ready", top() + '<div class="scroll">' + qCard() + '<div class="grow center">' + bombArt("idle") + '</div></div><div class="row whorow" id="who">' + who() + "</div>" +
      '<button class="btn sec" data-a="b_skip">🔄 غيّر السؤال</button><button class="btn go pulse" data-a="b_go">بدأت اللعب ▶</button>');
    AU.play("round_start");
  }
  function arm() {
    var max = cf.time * 1000;
    B.dur = window.__bombDur || (cf.random ? Math.round(max * (0.35 + 0.65 * Math.random())) : max);
    B.elapsed = 0; B.tickAcc = 1e9; B.beatAcc = 0; B.tk = 0; B.paused = false; B.last = performance.now(); B.phase = "live";
    Y.show("b_live", top() + '<div class="scroll">' + qCard() + '<div class="grow center">' + bombArt("live") + '</div></div><div class="row whorow" id="who">' + who() + "</div>" +
      '<button class="btn sec" data-a="b_skip">🔄 غيّر السؤال</button><button class="btn go tap" data-a="b_done">تم ✔ اللي بعده</button>');
    AU.play("begin");
    if (B.mode !== "normal") AU.music(B.mode);
    loop = setInterval(step, 50);
  }
  function step() {
    if (!B || B.phase !== "live") return;
    var now = performance.now(), dt = now - B.last; B.last = now;
    if (B.paused || document.hidden) return;        /* exit dialog open, or app in the background */
    dt = Math.min(dt, 1000);                       /* a backgrounded tab must not jump the fuse */
    B.elapsed += dt;
    if (B.elapsed >= B.dur) { explode(); return; }
    var f = B.elapsed / B.dur, every = B.mode === "normal" ? 1000 : 1000 - 830 * Math.pow(f, 1.6);
    B.tickAcc += dt;
    if (B.tickAcc >= every) {
      B.tickAcc = 0; B.tk++;
      AU.play(B.tk % 2 ? "tick" : "tock", { gap: 0, vol: B.mode === "normal" ? 0.8 : 0.6 + 0.4 * f });
      var el = $("#bomb"); if (el) { el.classList.remove("beat"); void el.offsetWidth; el.classList.add("beat"); el.style.setProperty("--heat", f.toFixed(2)); }
    }
    if (B.mode === "cinematic") {
      B.beatAcc += dt;
      if (B.beatAcc >= 950 - 600 * f) { B.beatAcc = 0; AU.play("heartbeat", { gap: 0, vol: 0.55 + 0.45 * f }); }
    }
  }
  function stopLoop() { if (loop) { clearInterval(loop); loop = null; } }
  function explode() {
    stopLoop(); B.phase = "boom"; AU.stopMusic(0.05); AU.stopSfx();
    var p = curP(), last = B.round >= B.total; B.strikes[p.id]++; B.loser = p.id;
    AU.play(B.mode === "cinematic" ? "explosion_big" : "explosion", { gap: 0 });
    Y.vib([300, 80, 400]);
    document.body.classList.add("quake"); setTimeout(function () { document.body.classList.remove("quake"); }, B.mode === "cinematic" ? 1400 : 900);
    Y.confetti(["#ff4d6d", "#ff9d1c", "#ffcf40", "#3a2d5c", "#ffffff"], 170);
    Y.show("b_boom", top() + '<div class="flash"></div><div class="center" style="gap:6px;padding-top:4px"><div class="verdict disp no boomtxt">بوووم!</div>' +
      '<div class="row" style="margin-top:4px">' + av(p.av, "lg") + '<div style="text-align:right"><b class="disp" style="font-size:30px">' + esc(p.name) + '</b><div class="mut">القنبلة فرقعت في إيده 💥</div></div></div></div>' +
      '<div class="scroll">' + board(p.id) + "</div>" + '<button class="btn ' + (last ? "gold" : "go") + '" data-a="b_next">' + (last ? "النتيجة النهائية 🏆" : "الجولة الجاية") + "</button>");
    setTimeout(function () { if (B && B.phase === "boom") AU.play("lose"); }, 1300);
  }
  function ranked() { return S.players.filter(function (p) { return p.id in B.strikes; }).sort(function (a, b) { return B.strikes[a.id] - B.strikes[b.id]; }); }
  function board(hit) {
    var r = ranked(), best = B.strikes[r[0].id];
    return '<div class="board">' + r.map(function (p, i) {
      var n = B.strikes[p.id], s = ""; for (var k = 0; k < Math.min(n, 6); k++) s += "💥";
      return '<div class="brow ' + (n === best ? "first " : "") + (hit === p.id ? "hit" : "") + '" style="animation-delay:' + i * 0.05 + 's"><span class="rk disp">' + (i + 1) + "</span>" + av(p.av, "sm") + "<b>" + esc(p.name) + '</b><span class="sm">' + s + '</span><span class="sc disp ' + (n ? "neg" : "") + '">' + n + "</span></div>";
    }).join("") + "</div>";
  }
  function saveHist() { if (B && !B.saved) { Y.pushHist("ytm_hist_bomb", B.used); B.saved = true; } }
  function end() {
    B.phase = "end"; saveHist();
    var r = ranked(), best = B.strikes[r[0].id], w = r.filter(function (p) { return B.strikes[p.id] === best; });
    Y.show("b_end", '<div class="center" style="gap:4px;padding-top:8px"><div style="font-size:54px;line-height:1;filter:drop-shadow(0 0 20px var(--gold))">🏆</div>' +
      '<div class="row" style="justify-content:center;flex-wrap:wrap">' + w.map(function (p) { return av(p.av, w.length > 2 ? "" : "lg"); }).join("") + "</div>" +
      '<div class="disp gold" style="font-size:38px;text-shadow:0 0 24px rgba(255,207,64,.7);text-wrap:balance">' + w.map(function (p) { return esc(p.name); }).join(" و ") + "</div>" +
      '<div class="mut">' + (best === 0 ? "ولا قنبلة فرقعت في إيده" : "أقل واحد اتفرقع: " + best + " 💥") + "</div></div>" +
      '<div class="scroll">' + board() + '</div><button class="btn go" data-a="b_again">ماتش جديد 🔁</button><button class="btn sec" data-a="home">الرئيسية</button>');
    AU.play("win"); Y.confetti(Y.C_GOLD.concat(Y.C_OK), 180);
  }
  function stop() { stopLoop(); saveHist(); B = null; document.body.classList.remove("quake"); }
  function setCats() { Y.persist(); settings(); }

  Y.register("bomb", {
    name: "القنبلة", desc: "جاوب بسرعة وسلّم الدور.. قبل ما تفرقع في إيدك", art: ART, btn: "red", min: 2,
    minMsg: "القنبلة محتاجة لاعبين اتنين على الأقل 💣",
    how: [
      ["💣", "القنبلة", "سؤال واحد على الشاشة، وكل لاعب يقول إجابة واحدة بالدور.. والقنبلة شغّالة ومحدش عارف هتفرقع إمتى."],
      ["▶", "ابدأ", "أول لاعب يدوس \"بدأت اللعب\" والفتيل يولّع. قول إجابتك ودوس \"تم\" عشان الدور يروح للي بعدك."],
      ["🔄", "مش عاجبكم السؤال؟", "دوسوا \"غيّر السؤال\" في أي وقت.. بس القنبلة مش بتستنى حد."],
      ["💥", "الخسارة", "اللي القنبلة تفرقع في دوره يخسر الجولة. وأقل واحد اتفرقع في آخر الماتش هو الكسبان."]
    ],
    openSettings: settings,
    isActive: function () { return !!B; }, atEnd: function () { return !!B && B.phase === "end"; },
    pause: function () { if (B && B.phase === "live") B.paused = true; },
    resume: function () { if (B && B.phase === "live") { B.paused = false; B.last = performance.now(); } },
    stop: stop,
    actions: {
      b_rounds: function (v) { cf.rounds = Math.max(1, Math.min(20, cf.rounds + +v)); Y.persist(); $("#brv").textContent = cf.rounds; },
      b_time: function (v) { cf.time = +v; setCats(); },
      b_random: function () { cf.random = !cf.random; setCats(); },
      b_shuffle: function () { cf.shuffle = !cf.shuffle; setCats(); },
      b_mode: function (v) { cf.mode = v; setCats(); },
      b_all: function () { cf.cats = ALL.slice(); setCats(); },
      b_cat: function (v) {
        var i = cf.cats.indexOf(v);
        if (i >= 0) { if (cf.cats.length === 1) { Y.toast("لازم فئة واحدة على الأقل"); return; } cf.cats.splice(i, 1); } else cf.cats.push(v);
        setCats();
      },
      b_start: function () { start(); return "quiet"; },
      b_go: function () { if (B && B.phase === "ready") arm(); return "quiet"; },
      b_done: function () {
        if (!B || B.phase !== "live") return "quiet";
        B.turn = (B.turn + 1) % B.order.length; AU.play("turn", { gap: 0 }); Y.vib(20);
        var w = $("#who"); if (w) { w.innerHTML = who(); w.classList.remove("swap"); void w.offsetWidth; w.classList.add("swap"); }
        return "quiet";
      },
      b_skip: function () {
        if (!B || (B.phase !== "live" && B.phase !== "ready")) return "quiet";
        drawQ(); AU.play("skip", { gap: 0 });
        var q = $("#bq"); if (q) { q.outerHTML = qCard(); q = $("#bq"); q.classList.add("swap"); }
        return "quiet";
      },
      b_next: function () {
        if (!B || B.phase !== "boom") return "quiet";
        AU.stopSfx();
        if (B.round >= B.total) end(); else { B.turn = (B.order.indexOf(B.loser) + 1) % B.order.length; nextRound(); }
        return "quiet";
      },
      b_again: function () { stop(); start(); return "quiet"; }
    }
  });
  window.__ytm.bomb = function () { return B; };
})();
