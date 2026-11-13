/* يا تلحق يا متلحقش — النواة المشتركة (لاعيبة، تنقّل، صوت، واجهة) + لعبة المزاد.
   الألعاب التانية في ملفات مستقلة (bomb.js / village.js) وبتتسجّل عن طريق YTM.register */
(function () {
  "use strict";
  var $ = function (s) { return document.querySelector(s); };
  var app = $("#app"), ovEl = $("#ov");
  var CATS = window.CATEGORIES, QS = window.QUESTIONS;
  var TOTAL_Q = CATS.reduce(function (n, c) { return n + QS[c.id].length; }, 0);
  var AV = [["🦊", "#ff8a3d"], ["🐼", "#7bdcb5"], ["🦁", "#ffc93c"], ["🐸", "#5fd35f"], ["🐵", "#c98b5a"], ["🦄", "#f78bd8"],
    ["🐯", "#ffa94d"], ["🐙", "#ff6b8b"], ["👽", "#8ce99a"], ["🤖", "#74c0fc"], ["👻", "#b197fc"], ["🐲", "#38d9a9"],
    ["🦉", "#d0a370"], ["🐧", "#66d9e8"], ["😎", "#ffd43b"], ["🤠", "#e599f7"]];
  var MAX_P = 12, MAX_BID = 50, WIN = 100, LOSE = 500, WASTA_P = 0.05;

  /* ---------- storage ---------- */
  function load(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }
  var S = load("ytm_state", null) || {};
  S.players = Array.isArray(S.players) ? S.players : [];
  S.settings = S.settings || {};
  S.settings.rounds = S.settings.rounds || 5;
  S.settings.timer = S.settings.timer || 30;
  S.settings.cats = (S.settings.cats || CATS.map(function (c) { return c.id; })).filter(function (id) { return QS[id]; });
  if (!S.settings.cats.length) S.settings.cats = CATS.map(function (c) { return c.id; });
  function persist() { save("ytm_state", S); }

  var M = null, cur = "home", ed = null, sel = null, bidVal = 1, lockT = null, tick = null, howI = 0, howG = "auction";
  var GAMES = {}, ORDER = [], G = null, ovClose = null;   /* registered games, selected game, overlay close hook */

  /* ---------- helpers ---------- */
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function av(i, cls) { var a = AV[i % AV.length]; return '<span class="av ' + (cls || "") + '" style="background:radial-gradient(circle at 30% 25%,#ffffffaa,' + a[1] + ' 62%)">' + a[0] + "</span>"; }
  function P(id) { for (var i = 0; i < S.players.length; i++) if (S.players[i].id === id) return S.players[i]; return null; }
  function cat(id) { for (var i = 0; i < CATS.length; i++) if (CATS[i].id === id) return CATS[i]; }
  function fmt(n) { return (n > 0 ? "+" : n < 0 ? "−" : "") + Math.abs(n); }
  function vib(p) { try { navigator.vibrate && navigator.vibrate(p); } catch (e) { } }
  function show(name, html, cls, noAnim) {
    cur = name;
    app.innerHTML = '<div class="screen ' + (cls || "") + '"' + (noAnim ? ' style="animation:none"' : "") + ">" + html + "</div>";
  }
  function overlay(html, cls, onClose) { ovClose = html ? (onClose || null) : null; ovEl.innerHTML = html ? '<div class="ov ' + (cls || "") + '">' + html + "</div>" : ""; }
  function closeOverlay() { var f = ovClose; overlay(""); if (f) f(); }
  function hasOv() { return !!ovEl.firstChild; }
  function toast(t) {
    var o = $(".toast"); if (o) o.remove();
    var d = document.createElement("div"); d.className = "toast"; d.textContent = t; document.body.appendChild(d);
    setTimeout(function () { d.remove(); }, 1700);
  }

  /* ---------- sound: everything goes through the shared AudioSys (audio.js) ---------- */
  var AU = window.AudioSys;
  if (S.sound === false) AU.set("muted", true);      /* migrate the old on/off flag */
  delete S.sound;
  function ac() { AU.unlock(); }
  function tone(f, d, type, vol, at, f2) { AU.tone(f, d, type, vol, at, f2); }
  function muteIcon() { return AU.get().muted ? "🔇" : "🔊"; }
  function refreshMute() { var b = document.querySelectorAll("[data-mute]"); for (var i = 0; i < b.length; i++) b[i].textContent = muteIcon(); }
  function leaveGame() { var g = GAMES[G]; if (g && g.stop) g.stop(); AU.stopAll(); }
  var SFX = {
    tap: function () { tone(520, 0.06, "triangle", 0.12); },
    bid: function (n) { var b = 380 + Math.min(n, 20) * 28; tone(b, 0.09, "square", 0.1); tone(b * 1.5, 0.14, "square", 0.1, 0.08); },
    gavel: function () { tone(170, 0.16, "square", 0.3, 0, 60); tone(90, 0.2, "sine", 0.35, 0, 40); },
    tick: function (hot) { tone(hot ? 1250 : 880, 0.05, "square", hot ? 0.16 : 0.07); },
    hit: function (n) { tone(600 + n * 35, 0.1, "triangle", 0.22); tone(900 + n * 35, 0.16, "sine", 0.16, 0.06); },
    undo: function () { tone(300, 0.1, "triangle", 0.15, 0, 200); },
    start: function () { tone(660, 0.1, "square", 0.12); tone(660, 0.1, "square", 0.12, 0.18); tone(990, 0.3, "square", 0.14, 0.36); },
    win: function () { [523, 659, 784, 1047, 1319].forEach(function (f, i) { tone(f, 0.22, "triangle", 0.22, i * 0.09); }); tone(1568, 0.5, "sine", 0.18, 0.5); },
    lose: function () { tone(330, 0.3, "sawtooth", 0.16, 0, 220); tone(220, 0.35, "sawtooth", 0.16, 0.25, 140); tone(120, 0.6, "sawtooth", 0.2, 0.55, 60); },
    wasta: function () { [784, 988, 1175, 1568, 1976, 2349].forEach(function (f, i) { tone(f, 0.5, "sine", 0.16, i * 0.07); tone(f / 2, 0.5, "triangle", 0.1, i * 0.07); }); },
    final: function () { [392, 523, 659, 784, 659, 784, 1047].forEach(function (f, i) { tone(f, 0.26, "triangle", 0.22, i * 0.13); }); }
  };

  /* ---------- confetti ---------- */
  var fx = $("#fx"), fctx = fx.getContext("2d"), parts = [], fxRun = false;
  function confetti(colors, n) {
    var w = fx.width = innerWidth, h = fx.height = innerHeight;
    for (var i = 0; i < (n || 110); i++) parts.push({
      x: w / 2 + (Math.random() - 0.5) * w * 0.5, y: h * 0.35, vx: (Math.random() - 0.5) * 16, vy: -Math.random() * 15 - 4,
      s: 5 + Math.random() * 7, c: colors[i % colors.length], r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, life: 150 + Math.random() * 50
    });
    if (!fxRun) { fxRun = true; requestAnimationFrame(fxStep); }
  }
  function fxStep() {
    fctx.clearRect(0, 0, fx.width, fx.height);
    parts = parts.filter(function (p) { return p.life > 0 && p.y < fx.height + 20; });
    parts.forEach(function (p) {
      p.vy += 0.42; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr; p.life--;
      fctx.save(); fctx.translate(p.x, p.y); fctx.rotate(p.r); fctx.globalAlpha = Math.min(1, p.life / 40);
      fctx.fillStyle = p.c; fctx.fillRect(-p.s / 2, -p.s / 3, p.s, p.s * 0.66); fctx.restore();
    });
    if (parts.length) requestAnimationFrame(fxStep); else { fxRun = false; fctx.clearRect(0, 0, fx.width, fx.height); }
  }
  var C_OK = ["#2dffa0", "#27e6ff", "#b866ff", "#ff3fd8", "#ffffff"], C_GOLD = ["#ffcf40", "#ff9d1c", "#fff7c9", "#ffffff"];

  /* ================= screens ================= */
  var ART_AUCTION = '<svg viewBox="0 0 120 120"><defs><linearGradient id="aG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3b0"/><stop offset=".5" stop-color="#ffcf40"/><stop offset="1" stop-color="#ff9d1c"/></linearGradient></defs><circle cx="60" cy="62" r="46" fill="none" stroke="#ffffff22" stroke-width="7"/><circle cx="60" cy="62" r="46" fill="none" stroke="#b866ff" stroke-width="7" stroke-linecap="round" stroke-dasharray="210 290" transform="rotate(-90 60 62)"/><g class="swing" transform="rotate(-38 60 62)"><rect x="56" y="54" width="9" height="48" rx="4.5" fill="url(#aG)"/><rect x="34" y="32" width="52" height="28" rx="7" fill="url(#aG)"/><rect x="34" y="38" width="52" height="4" fill="#a85e00" opacity=".45"/><rect x="34" y="50" width="52" height="4" fill="#a85e00" opacity=".45"/></g><rect x="30" y="100" width="60" height="9" rx="4.5" fill="#7a3df0"/></svg>';
  function gameCard(id) {
    var g = GAMES[id];
    return '<div class="gcard2 g-' + id + '"><div class="art">' + g.art + '</div><div class="gi"><b class="disp">' + g.name + '</b><span class="mut sm">' + g.desc + '</span>' +
      '<div class="row"><button class="btn sm2 ' + (g.btn || "go") + '" data-a="play" data-v="' + id + '">ابدأ اللعب</button><button class="ic disp" data-a="howto" data-v="' + id + '" aria-label="طريقة لعب ' + g.name + '">؟</button></div></div></div>';
  }
  function home() {
    stopTimers(); G = null;
    show("home",
      '<div class="top"><button class="ic" data-a="audio" data-mute aria-label="إعدادات الصوت">' + muteIcon() + '</button><div class="hlogo disp"><div class="h1">يا تلحق</div><div class="h2">يا متلحقش</div></div><span class="ic ghost"></span></div>' +
      '<div class="tagline">لمّة وضحك وتحدّي.. اختار لعبتك</div>' +
      '<div class="scroll games">' + ORDER.map(gameCard).join("") + "</div>" +
      '<div class="sm mut center">' + ORDER.length + " ألعاب • " + TOTAL_Q + ' سؤال • من غير نت</div>');
  }
  function audioPanel() {
    var c = AU.get(), keep = ovClose;
    function sl(k, label) { var v = Math.round(c[k] * 100); return '<label class="vol"><span>' + label + '</span><input type="range" min="0" max="100" step="5" value="' + v + '" data-vol="' + k + '" aria-label="' + label + '"><b id="vv_' + k + '">' + v + "</b></label>"; }
    function tg(k, label) { return '<button class="chip ' + (c[k] ? "on" : "") + '" data-a="audioTg" data-v="' + k + '">' + label + (c[k] ? " شغّالة" : " مقفولة") + "</button>"; }
    overlay('<div class="modal"><h2 class="disp">الصوت</h2>' +
      '<button class="btn ' + (c.muted ? "bad" : "sec") + '" data-a="mute" data-v="panel">' + (c.muted ? "🔇 الصوت مكتوم — دوس للتشغيل" : "🔊 كتم كل الأصوات") + "</button>" +
      sl("master", "🎚 الصوت العام") + sl("music", "🎵 الموسيقى") + sl("sfx", "💥 المؤثرات") +
      '<div class="chips" style="justify-content:center">' + tg("musicOn", "🎵 الموسيقى") + tg("sfxOn", "💥 المؤثرات") + '</div><button class="btn go" data-a="closeOv">تمام</button></div>', "", keep);
  }

  function players() {
    var rows = S.players.map(function (p) {
      return '<div class="prow">' + av(p.av) + "<b>" + esc(p.name) + '</b><button class="mini" data-a="edit" data-v="' + p.id + '" aria-label="تعديل">✏️</button><button class="mini" data-a="del" data-v="' + p.id + '" aria-label="حذف">🗑️</button></div>';
    }).join("");
    var n = S.players.length, g = GAMES[G] || GAMES.auction, min = g.min;
    show("players",
      '<div class="top"><button class="ic" data-a="home" aria-label="رجوع">➜</button><h1 class="disp">اللاعيبة</h1><span class="pill">' + n + " / " + MAX_P + "</span></div>" +
      '<div class="scroll">' + (n < MAX_P ? '<button class="addbox" data-a="add"><span>ضيف لاعب جديد</span><span class="plus">+</span></button>' : "") +
      '<div class="plist">' + rows + "</div>" +
      (n < min ? '<div class="mut center" style="padding:20px 10px">' + g.minMsg + "</div>" : "") + "</div>" +
      '<button class="btn go" data-a="toSettings"' + (n < min ? " disabled" : "") + ">التالي</button>");
  }
  function editor(id) {
    var p = id ? P(id) : null, used = S.players.map(function (x) { return x.av; }), first = 0;
    while (used.indexOf(first) >= 0 && first < AV.length - 1) first++;
    ed = { id: id || null, av: p ? p.av : first };
    overlay('<div class="modal"><h2 class="disp">' + (p ? "عدّل اللاعب" : "اختار شخصيتك واكتب اسمك") + "</h2>" +
      '<div class="avgrid">' + AV.map(function (a, i) { return '<button data-a="pickAv" data-v="' + i + '">' + av(i, i === ed.av ? "on" : "") + "</button>"; }).join("") + "</div>" +
      '<input class="inp" id="pname" maxlength="14" placeholder="اسم اللاعب" autocomplete="off" value="' + (p ? esc(p.name) : "") + '">' +
      '<button class="btn go" data-a="saveP">' + (p ? "حفظ" : "إضافة") + '</button><button class="btn sec" data-a="closeOv">إلغاء</button></div>');
  }

  function settings() {
    var st = S.settings, cnt = st.cats.reduce(function (n, c) { return n + QS[c].length; }, 0);
    show("settings",
      '<div class="top"><button class="ic" data-a="toPlayers" aria-label="رجوع">➜</button><h1 class="disp">إعدادات الماتش</h1><span class="ic ghost"></span></div>' +
      '<div class="scroll">' +
      '<div class="card"><h3>🏁 عدد الجولات</h3><div class="step"><button data-a="rounds" data-v="1">+</button><span class="val disp" id="rv">' + st.rounds + '</span><button data-a="rounds" data-v="-1">−</button></div></div>' +
      '<div class="card"><h3>⏳ وقت التحدي</h3><div class="seg">' + [30, 45, 60].map(function (t) { return '<button data-a="timer" data-v="' + t + '" class="' + (st.timer === t ? "on" : "") + '">' + t + "<small>ثانية</small></button>"; }).join("") + "</div></div>" +
      '<div class="card"><h3>📂 الفئات <span class="mut sm" style="margin-inline-start:auto;font-weight:600">' + cnt + " سؤال</span></h3><div class=\"chips\">" +
      CATS.map(function (c) { return '<button class="chip ' + (st.cats.indexOf(c.id) >= 0 ? "on" : "") + '" data-a="cat" data-v="' + c.id + '">' + c.icon + " " + c.name + "</button>"; }).join("") + "</div></div>" +
      "</div>" + '<button class="btn go" data-a="start">ابدأ الماتش 🔥</button>', "", cur === "settings");
  }

  /* ---------- match ---------- */
  /* shuffled deck for the chosen categories that avoids the questions of the last 3 matches (per game) when possible */
  function deckFor(cats, histKey, need, keepOrder) {
    var all = [];
    cats.forEach(function (c) { QS[c].forEach(function (t, i) { all.push({ id: c + ":" + i, c: c, t: t }); }); });
    var hist = load(histKey, []), pool = all; need = Math.min(all.length, need);
    for (var k = 0; k <= hist.length; k++) {
      var ex = {}; hist.slice(k).forEach(function (m) { m.forEach(function (id) { ex[id] = 1; }); });
      pool = all.filter(function (q) { return !ex[q.id]; });
      if (pool.length >= need) break;
    }
    var inPool = {}; pool.forEach(function (q) { inPool[q.id] = 1; });
    var rest = all.filter(function (q) { return !inPool[q.id]; });
    return keepOrder ? pool.concat(rest) : shuffle(pool).concat(shuffle(rest));
  }
  function pushHist(histKey, used) { if (!used || !used.length) return; var h = load(histKey, []); h.push(used.slice()); save(histKey, h.slice(-3)); }
  function buildDeck() { return deckFor(S.settings.cats, "ytm_hist", S.settings.rounds * 4); }
  function saveHistory() {
    if (!M || !M.used.length || M.saved) return;
    pushHist("ytm_hist", M.used); M.saved = true;
  }
  function startMatch() {
    M = { round: 0, total: S.settings.rounds, timer: S.settings.timer, deck: buildDeck(), qi: 0, used: [], scores: {}, wastaUsed: false, saved: false };
    S.players.forEach(function (p) { M.scores[p.id] = 0; });
    try { navigator.wakeLock && navigator.wakeLock.request("screen").catch(function () { }); } catch (e) { }
    nextRound();
  }
  function drawQ() { M.q = M.deck[M.qi++]; M.used.push(M.q.id); }
  function nextRound() {
    M.round++; M.high = 0; M.by = null; M.wasta = false; sel = null; bidVal = 1; drawQ();
    var c = cat(M.q.c);
    show("intro",
      '<div class="top"><button class="ic" data-a="exit" aria-label="خروج">✕</button><span></span><span class="ic ghost"></span></div>' +
      '<div class="grow center" style="gap:14px"><div class="mut" style="font-size:22px;font-weight:700">الجولة</div>' +
      '<div class="disp" style="font-size:130px;line-height:.9;color:#fff;text-shadow:0 0 30px var(--violet2),0 0 80px var(--violet)">' + M.round + '</div>' +
      '<div class="mut" style="font-size:20px">من ' + M.total + '</div><span class="pill cy" style="font-size:19px;padding:8px 20px">' + c.icon + " " + c.name + "</span></div>" +
      '<button class="btn pulse" data-a="reveal">اكشف السؤال 👀</button>');
    SFX.start();
  }
  function topBar(extra) {
    return '<div class="top"><button class="ic" data-a="exit" aria-label="خروج">✕</button><span class="pill">الجولة ' + M.round + " / " + M.total + "</span>" + (extra || '<span class="ic ghost"></span>') + "</div>";
  }
  function qCard() {
    var c = cat(M.q.c);
    return '<div class="qcard"><div class="lead">' + c.icon + " " + c.name + ' • اذكر..</div><div class="q">' + esc(M.q.t) + "</div></div>";
  }
  function bidding(pop) {
    var n = S.players.length, lead = M.by ? P(M.by) : null;
    show("bidding", topBar('<button class="ic" data-a="skip" aria-label="غيّر السؤال">🔄</button>') +
      '<div class="scroll">' + qCard() +
      '<div class="high">' + (lead ? av(lead.av, "lg") + '<div><div class="num disp ' + (pop ? "pop" : "") + '">' + M.high + '</div></div><div style="text-align:right"><div class="mut sm">أعلى مزايدة</div><b style="font-size:22px">' + esc(lead.name) + "</b></div>"
        : '<div class="mut center" style="padding:14px;font-size:19px">تقدر تقول كام؟<br><b style="color:#fff">اختار اسمك وزايد!</b></div>') + "</div>" +
      '<div class="pgrid ' + (n <= 6 ? "big" : "") + '">' + S.players.map(function (p) {
        return '<button class="pb ' + (sel === p.id ? "on " : "") + (M.by === p.id ? "lead" : "") + '" data-a="selP" data-v="' + p.id + '">' + av(p.av) + "<span>" + esc(p.name) + "</span></button>";
      }).join("") + "</div></div>" +
      '<div class="bidbar"><div class="step"><button data-a="bidAdj" data-v="1">+</button><span class="val disp" id="bv">' + bidVal + '</span><button data-a="bidAdj" data-v="-1">−</button></div><button class="btn" data-a="bid">زايد!</button></div>' +
      '<button class="btn gold" data-a="lock"' + (M.by ? "" : " disabled") + ">🔨 قفل المزاد</button>", "", cur === "bidding");
  }
  function lockSeq() {
    var words = ["ألا أونا..", "ألا دو..", "ألا تري!"], i = 0;
    function step() {
      if (i >= words.length) { lockT = null; overlay(""); afterLock(); return; }
      overlay('<div class="center" style="gap:26px"><div class="gavel disp">' + words[i] + '</div><div class="disp" style="font-size:30px">' + M.high + " لـ " + esc(P(M.by).name) + '</div><button class="btn sec" style="width:auto" data-a="cancelLock">استنى! في حد هيزايد ✋</button></div>');
      SFX.gavel(); vib(40); i++; lockT = setTimeout(step, 900);
    }
    step();
  }
  function afterLock() {
    var fw = window.__forceWasta; /* test hook: true = force, false = never */
    if (!M.wastaUsed && (fw === true || (fw !== false && Math.random() < WASTA_P))) {
      M.wasta = true; M.wastaUsed = true;
      overlay('<div class="rays"></div><div class="wbox"><div style="font-size:54px">👑</div><div class="w1 disp">الواسطة!</div><div class="x2 disp" dir="ltr">×2</div><p>الجولة دي دهب.. المكسب دوبل والخسارة دوبل!</p><button class="btn gold" style="margin-top:14px;min-width:230px" data-a="wastaGo">يا ساتر.. كمّل</button></div>', "wasta");
      SFX.wasta(); vib([60, 40, 60, 40, 200]); confetti(C_GOLD, 160);
    } else ready();
  }
  function mult() { return M.wasta ? 2 : 1; }
  function ready() {
    var p = P(M.by);
    show("ready", topBar(M.wasta ? '<span class="pill gd">👑 <span dir="ltr">×2</span></span>' : "") +
      '<div class="grow center" style="gap:8px">' + av(p.av, "xl") + '<div class="disp" style="font-size:34px">' + esc(p.name) + '</div><div class="mut">لازم يقول</div>' +
      '<div class="disp" style="font-size:110px;line-height:.9;color:var(--gold);text-shadow:0 0 30px rgba(255,207,64,.75),0 5px 0 #8a5200">' + M.high + "</div>" +
      '<div style="font-size:24px;font-weight:800;text-wrap:balance">' + esc(M.q.t) + '</div><div class="mut">في ' + M.timer + " ثانية</div>" +
      '<div class="row" style="margin-top:8px"><span class="pill" style="border-color:var(--ok);color:var(--ok)" dir="ltr">' + fmt(M.high * WIN * mult()) + '</span><span class="pill" style="border-color:var(--bad);color:var(--bad)" dir="ltr">' + fmt(-LOSE * mult()) + "</span></div></div>" +
      '<div class="sm mut center">الموبايل مع حد تاني يعدّ الإجابات الصح</div><button class="btn go pulse" data-a="go">ابدأ الوقت ⏱</button>', M.wasta ? "goldmode" : "");
  }
  var CIRC = 2 * Math.PI * 54;
  function run() {
    M.got = 0; M.deadline = performance.now() + M.timer * 1000; M.lastSec = M.timer;
    var dots = ""; for (var i = 0; i < M.high; i++) dots += "<i></i>";
    show("run", topBar(M.wasta ? '<span class="pill gd">👑 <span dir="ltr">×2</span></span>' : "") +
      '<div class="grow center" style="gap:12px"><div class="ring" id="ring"><svg viewBox="0 0 120 120"><circle class="tr" cx="60" cy="60" r="54"/><circle class="pr" id="pr" cx="60" cy="60" r="54" stroke-dasharray="' + CIRC + '" stroke-dashoffset="0"/></svg><div class="t disp" id="tt">' + M.timer + "</div></div>" +
      '<div style="font-size:21px;font-weight:800;text-wrap:balance">' + esc(M.q.t) + '</div><div class="count"><b class="disp" id="got">0</b> / ' + M.high + '</div><div class="dots" id="dots">' + dots + "</div></div>" +
      '<button class="btn go tap" data-a="hit">✔ إجابة صح</button><div class="row"><button class="btn sec" data-a="undo">↩ تراجع</button><button class="btn bad" data-a="giveup">🏳 استسلم</button></div>', M.wasta ? "goldmode" : "");
    SFX.start();
    tick = setInterval(function () {
      var left = Math.max(0, M.deadline - performance.now()), sec = Math.ceil(left / 1000), pr = $("#pr"), tt = $("#tt");
      if (!pr) return;
      pr.setAttribute("stroke-dashoffset", String(CIRC * (1 - left / (M.timer * 1000))));
      if (sec !== M.lastSec) {
        M.lastSec = sec; tt.textContent = sec;
        if (sec <= 10 && sec > 0) { SFX.tick(sec <= 5); if (sec <= 5) { $("#ring").classList.add("warn"); vib(30); } }
      }
      if (left <= 0) finish(false);
    }, 100);
  }
  function setGot() {
    var g = $("#got"); if (!g) return; g.textContent = M.got;
    var d = $("#dots").children; for (var i = 0; i < d.length; i++) d[i].className = i < M.got ? "on" : "";
  }
  function stopTimers() { if (tick) { clearInterval(tick); tick = null; } if (lockT) { clearTimeout(lockT); lockT = null; } }
  function finish(ok) {
    if (cur !== "run") return; stopTimers();
    var delta = (ok ? M.high * WIN : -LOSE) * mult(), p = P(M.by);
    M.scores[M.by] += delta; M.last = { ok: ok, delta: delta };
    var last = M.round >= M.total;
    show("result", topBar(M.wasta ? '<span class="pill gd">👑 <span dir="ltr">×2</span></span>' : "") +
      '<div class="center" style="gap:4px;padding-top:6px"><div class="verdict disp ' + (ok ? "ok" : "no") + '">' + (ok ? "لحق!" : "ملحقش!") + "</div>" +
      '<div class="row" style="margin-top:6px">' + av(p.av) + '<b style="font-size:22px">' + esc(p.name) + '</b><span class="delta disp ' + (ok ? "ok" : "no") + '" dir="ltr">' + fmt(delta) + "</span></div>" +
      '<div class="mut sm">قال ' + M.got + " من " + M.high + (M.wasta ? " • الواسطة ضربت <span dir=\"ltr\">×2</span> 👑" : "") + "</div></div>" +
      '<div class="scroll">' + board(M.by) + "</div>" +
      '<button class="btn ' + (last ? "gold" : "go") + '" data-a="next">' + (last ? "النتيجة النهائية 🏆" : "الجولة الجاية") + "</button>", M.wasta ? "goldmode" : "");
    if (ok) { SFX.win(); confetti(M.wasta ? C_GOLD : C_OK); vib([40, 40, 120]); } else { SFX.lose(); vib([200, 60, 200]); }
  }
  function ranked() {
    return S.players.slice().sort(function (a, b) { return M.scores[b.id] - M.scores[a.id]; });
  }
  function board(hit) {
    var r = ranked(), top = M.scores[r[0].id];
    return '<div class="board">' + r.map(function (p, i) {
      var sc = M.scores[p.id];
      return '<div class="brow ' + (sc === top ? "first " : "") + (hit === p.id ? "hit" : "") + '" style="animation-delay:' + i * 0.05 + 's"><span class="rk disp">' + (i + 1) + "</span>" + av(p.av, "sm") + "<b>" + esc(p.name) + '</b><span class="sc disp ' + (sc < 0 ? "neg" : "") + '">' + (sc < 0 ? "−" : "") + Math.abs(sc) + "</span></div>";
    }).join("") + "</div>";
  }
  function final() {
    saveHistory();
    var r = ranked(), top = M.scores[r[0].id], winners = r.filter(function (p) { return M.scores[p.id] === top; });
    show("final",
      '<div class="center" style="gap:4px;padding-top:8px"><div style="font-size:54px;line-height:1;filter:drop-shadow(0 0 20px var(--gold))">🏆</div>' +
      '<div class="row" style="justify-content:center;flex-wrap:wrap">' + winners.map(function (p) { return av(p.av, winners.length > 2 ? "" : "lg"); }).join("") + "</div>" +
      '<div class="disp gold" style="font-size:40px;text-shadow:0 0 24px rgba(255,207,64,.7);text-wrap:balance">' + winners.map(function (p) { return esc(p.name); }).join(" و ") + "</div>" +
      '<div class="mut">' + (winners.length > 1 ? "تعادل على القمة" : "كسب المزاد") + ' بـ <b class="gold" dir="ltr">' + (top < 0 ? "−" : "") + Math.abs(top) + "</b> نقطة</div></div>" +
      '<div class="scroll">' + board() + "</div>" +
      '<button class="btn go" data-a="again">ماتش جديد 🔁</button><button class="btn sec" data-a="home">الرئيسية</button>');
    SFX.final(); confetti(C_GOLD.concat(C_OK), 200); setTimeout(function () { if (cur === "final") confetti(C_GOLD, 120); }, 900);
  }

  /* ---------- how to ---------- */
  var HOW = [
    ["🔨", "المزاد", "لعبة لمّة على موبايل واحد. كل جولة فيها سؤال \"اذكر..\"، وكل واحد يقول يقدر يجاوب كام."],
    ["🔢", "المزايدة", "اختار اسمك وزوّد الرقم. اللي يقول أعلى رقم ياخد التحدي.. ومفيش رجوع بعد \"ألا تري\"!"],
    ["⏱", "التحدي", "صاحب أعلى مزايدة لازم يقول العدد كله قبل الوقت ما يخلص، والباقي يعدّوا وراه الإجابات الصح."],
    ["🏆", "النقط", "لحق؟ ياخد 100 نقطة على كل إجابة زايد بيها. ملحقش؟ يتخصم منه 500. وخلّي بالك من المفاجآت 👀"]
  ];
  function howto() {
    var HOWG = GAMES[howG].how, h = HOWG[howI];
    overlay('<div class="modal"><div class="big">' + h[0] + '</div><div class="dotsnav">' + HOWG.map(function (_, i) { return '<i class="' + (i === howI ? "on" : "") + '"></i>'; }).join("") + '</div><h2 class="disp">' + h[1] + '</h2><p style="font-size:19px;min-height:112px">' + h[2] + "</p>" +
      '<div class="row">' + (howI > 0 ? '<button class="btn sec" data-a="howPrev">السابق</button>' : "") + (howI < HOWG.length - 1 ? '<button class="btn" data-a="howNext">التالي</button>' : '<button class="btn go" data-a="closeOv">فهمت 👌</button>') + "</div></div>");
  }
  function exitAsk() {
    var g = GAMES[G]; if (g && g.pause) g.pause();
    overlay('<div class="modal"><div class="big">🚪</div><h2 class="disp">تخرج من الماتش؟</h2><p class="mut">النتيجة هتروح عليكم</p><div class="row"><button class="btn bad" style="min-height:58px" data-a="exitYes">أيوه اخرج</button><button class="btn go" data-a="closeOv">كمّل لعب</button></div></div>', "", function () { if (g && g.resume) g.resume(); });
  }

  /* ================= actions ================= */
  var A = {
    audio: function () { audioPanel(); },
    audioTg: function (v) { AU.set(v, !AU.get()[v]); audioPanel(); },
    mute: function (v) { AU.toggleMute(); refreshMute(); if (v === "panel") audioPanel(); },
    howto: function (v) { howG = GAMES[v] ? v : (G || "auction"); howI = 0; howto(); },
    howNext: function () { howI++; howto(); }, howPrev: function () { howI--; howto(); },
    closeOv: function () { closeOverlay(); },
    home: function () { leaveGame(); home(); },
    play: function (v) { G = GAMES[v] ? v : "auction"; players(); }, toPlayers: function () { players(); },
    add: function () { editor(null); },
    edit: function (v) { editor(v); },
    del: function (v) { S.players = S.players.filter(function (p) { return p.id !== v; }); persist(); players(); },
    pickAv: function (v) {
      ed.av = +v; var a = document.querySelectorAll(".avgrid .av");
      for (var i = 0; i < a.length; i++) a[i].classList.toggle("on", i === ed.av);
    },
    saveP: function () {
      var name = ($("#pname").value || "").trim().slice(0, 14);
      if (!name) { var k = S.players.length + (ed.id ? 0 : 1); name = "لاعب " + k; }
      if (ed.id) { var p = P(ed.id); p.name = name; p.av = ed.av; }
      else { if (S.players.length >= MAX_P) return; S.players.push({ id: "p" + Date.now().toString(36) + Math.floor(Math.random() * 1e4), name: name, av: ed.av }); }
      persist(); overlay(""); players();
    },
    toSettings: function () { var g = GAMES[G] || GAMES.auction; if (S.players.length >= g.min) g.openSettings(); },
    rounds: function (v) { S.settings.rounds = Math.max(1, Math.min(20, S.settings.rounds + +v)); persist(); $("#rv").textContent = S.settings.rounds; },
    timer: function (v) { S.settings.timer = +v; persist(); settings(); },
    cat: function (v) {
      var c = S.settings.cats, i = c.indexOf(v);
      if (i >= 0) { if (c.length === 1) { toast("لازم فئة واحدة على الأقل"); return; } c.splice(i, 1); } else c.push(v);
      persist(); settings();
    },
    start: function () { startMatch(); },
    reveal: function () { bidding(); },
    skip: function () {
      if (M.qi >= M.deck.length) { toast("مفيش أسئلة تانية"); return; }
      M.high = 0; M.by = null; sel = null; bidVal = 1; drawQ(); cur = "x"; bidding();
    },
    selP: function (v) { sel = v; bidding(); },
    bidAdj: function (v) { bidVal = Math.max(M.high + 1, Math.min(MAX_BID, bidVal + +v)); $("#bv").textContent = bidVal; },
    bid: function () {
      if (!sel) { toast("اختار مين اللي بيزايد الأول 👆"); return "quiet"; }
      if (bidVal <= M.high) return;
      M.high = bidVal; M.by = sel; sel = null; bidVal = Math.min(MAX_BID, M.high + 1);
      SFX.bid(M.high); vib(25); bidding(true); return "quiet";
    },
    lock: function () { if (M.by) lockSeq(); return "quiet"; },
    cancelLock: function () { if (lockT) { clearTimeout(lockT); lockT = null; } overlay(""); },
    wastaGo: function () { overlay(""); ready(); },
    go: function () { run(); return "quiet"; },
    hit: function () { if (cur !== "run") return; M.got++; SFX.hit(M.got); vib(20); setGot(); if (M.got >= M.high) finish(true); return "quiet"; },
    undo: function () { if (cur === "run" && M.got > 0) { M.got--; SFX.undo(); setGot(); } return "quiet"; },
    giveup: function () { finish(false); return "quiet"; },
    next: function () { if (M.round >= M.total) final(); else nextRound(); return "quiet"; },
    again: function () { startMatch(); return "quiet"; },
    exit: function () { exitAsk(); },
    exitYes: function () { overlay(""); leaveGame(); home(); }
  };
  document.addEventListener("click", function (e) {
    var t = e.target.closest ? e.target.closest("[data-a]") : null;
    if (!t || t.disabled) return;
    var fn = A[t.getAttribute("data-a")]; if (!fn) return;
    ac();
    var r = fn(t.getAttribute("data-v"));
    if (r !== "quiet") SFX.tap();
  });
  document.addEventListener("input", function (e) {
    var k = e.target.getAttribute && e.target.getAttribute("data-vol"); if (!k) return;
    AU.set(k, e.target.value / 100); var b = $("#vv_" + k); if (b) b.textContent = e.target.value;
  });
  document.addEventListener("change", function (e) {
    var k = e.target.getAttribute && e.target.getAttribute("data-vol"); if (!k) return;
    ac(); if (k === "music") AU.play("reveal", { vol: 0 }); else AU.play("tick", { gap: 0 });
  });
  AU.onChange(refreshMute);
  document.addEventListener("keydown", function (e) { if (e.key === "Enter" && e.target.id === "pname") A.saveP(); });

  /* hardware back (Android wrapper calls this). returns true if handled */
  window.__back = function () {
    if (hasOv()) { if (lockT) A.cancelLock(); else if (!$(".ov.wasta") && !$(".ov.block")) closeOverlay(); return true; }
    var g = GAMES[G];
    if (g && g.isActive()) { if (g.atEnd()) { leaveGame(); home(); } else exitAsk(); return true; }
    if (cur.indexOf("set") === 0) { players(); return true; }
    if (cur === "players") { home(); return true; }
    return false;
  };

  /* ---------- shared API for the other game modules ---------- */
  window.YTM = {
    S: S, CATS: CATS, QS: QS, AU: AU, C_OK: C_OK, C_GOLD: C_GOLD, $: $,
    persist: persist, load: load, save: save, show: show, overlay: overlay, closeOverlay: closeOverlay, hasOv: hasOv, toast: toast,
    esc: esc, shuffle: shuffle, av: av, P: P, cat: cat, vib: vib, confetti: confetti, deck: deckFor, pushHist: pushHist,
    cur: function () { return cur; }, players: players, goHome: function () { leaveGame(); home(); },
    muteBtn: function () { return '<button class="ic" data-a="mute" data-mute aria-label="كتم الصوت">' + muteIcon() + "</button>"; },
    exitBtn: '<button class="ic" data-a="exit" aria-label="خروج">✕</button>',
    register: function (id, g) { GAMES[id] = g; ORDER.push(id); for (var k in g.actions || {}) A[k] = g.actions[k]; },
    boot: function () { home(); }
  };
  window.YTM.register("auction", {
    name: "المزاد", desc: "زايد على عدد الإجابات.. والحق قبل الوقت ما يخلص", art: ART_AUCTION, min: 2,
    minMsg: "محتاجين لاعبين اتنين على الأقل عشان المزاد يولّع 🔥", how: HOW, openSettings: settings,
    isActive: function () { return !!M; }, atEnd: function () { return cur === "final"; },
    stop: function () { stopTimers(); saveHistory(); M = null; }
  });
  window.__ytm = { state: S, match: function () { return M; }, screen: function () { return cur; }, total: TOTAL_Q, game: function () { return G; }, games: GAMES, audio: AU };

  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol) && document.querySelector('link[rel="manifest"]')) {
    try { navigator.serviceWorker.register("sw.js").catch(function () { }); } catch (e) { }
  }
})();
