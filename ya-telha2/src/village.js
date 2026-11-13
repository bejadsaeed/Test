/* 🏘️ لعبة أهل القرية — خداع وتصويت سري. منطق مستقل فوق النواة المشتركة (YTM) */
(function () {
  "use strict";
  var Y = window.YTM, S = Y.S, AU = Y.AU, esc = Y.esc, av = Y.av, $ = Y.$;
  var cf = S.village = S.village || {}; cf.thieves = cf.thieves || 1;
  var V = null, timer = null;
  function maxThieves(n) { return Math.max(0, Math.min(3, Math.floor((n - 1) / 2))); }   /* thieves must start as a strict minority */

  var ART = '<svg viewBox="0 0 120 120"><circle cx="92" cy="26" r="13" fill="#ffe9a8"/><circle cx="86" cy="22" r="11" fill="#1d1266"/><g fill="#fff"><circle cx="22" cy="20" r="1.6"/><circle cx="48" cy="12" r="1.2"/><circle cx="64" cy="30" r="1.4"/></g><path d="M8 104 L8 68 L30 48 L52 68 L52 104 Z" fill="#3a2d8c" stroke="#b866ff" stroke-width="2.5"/><path d="M2 70 L30 44 L58 70" fill="none" stroke="#ff3fd8" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><rect x="23" y="80" width="14" height="24" rx="3" fill="#ffcf40"/><path d="M58 104 L58 60 L84 38 L110 60 L110 104 Z" fill="#2a1a8a" stroke="#b866ff" stroke-width="2.5"/><path d="M52 62 L84 34 L116 62" fill="none" stroke="#27e6ff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><rect x="68" y="70" width="13" height="13" rx="2" fill="#ffcf40"/><rect x="88" y="70" width="13" height="13" rx="2" fill="#120a38"/><g class="peek"><circle cx="94.5" cy="78" r="2" fill="#ff4d6d"/><circle cx="99" cy="78" r="2" fill="#ff4d6d"/></g><rect x="2" y="103" width="116" height="5" rx="2.5" fill="#7a3df0"/></svg>';

  function P(id) { return Y.P(id); }
  function isT(id) { return V.roles[id] === "t"; }
  function counts() { var t = 0; V.alive.forEach(function (id) { if (isT(id)) t++; }); return { t: t, v: V.alive.length - t }; }
  function top(label) { return '<div class="top">' + Y.exitBtn + '<span class="pill">' + label + "</span>" + Y.muteBtn() + "</div>"; }
  function clearT() { if (timer) { clearTimeout(timer); timer = null; } }

  /* ---------- settings ---------- */
  function settings() {
    var n = S.players.length, mx = maxThieves(n);
    if (cf.thieves > mx) cf.thieves = Math.max(1, mx);
    var t = cf.thieves;
    Y.show("set_village",
      '<div class="top"><button class="ic" data-a="toPlayers" aria-label="رجوع">➜</button><h1 class="disp">أهل القرية</h1><span class="ic ghost"></span></div><div class="scroll">' +
      '<div class="card"><h3>🦹 عدد الحرامية</h3><div class="seg">' + [1, 2, 3].map(function (k) {
        var need = 2 * k + 1;
        return '<button data-a="v_thieves" data-v="' + k + '" class="' + (t === k ? "on" : "") + (k > mx ? " off" : "") + '">' + k + "<small>" + (k > mx ? "من " + need + " لاعيبة" : k === 1 ? "حرامي" : "حرامية") + "</small></button>";
      }).join("") + "</div></div>" +
      '<div class="card"><h3>👥 توزيع الأدوار</h3><div class="dist"><div><span class="big">🏡</span><b class="disp" id="vdv">' + (n - t) + '</b><small>أهل القرية</small></div><div class="plus disp">+</div><div class="th"><span class="big">🦹</span><b class="disp" id="vdt">' + t + '</b><small>' + (t === 1 ? "حرامي" : "حرامية") + '</small></div><div class="plus disp">=</div><div><span class="big">👥</span><b class="disp">' + n + "</b><small>لاعب</small></div></div>" +
      '<p class="mut sm center" style="margin-top:10px">الأدوار بتتوزع عشوائي وفي السر.. كل واحد يشوف دوره لوحده</p></div>' +
      '<div class="card"><h3>🏆 مين يكسب؟</h3><p class="sm">🏡 أهل القرية يكسبوا لو طردوا <b>كل</b> الحرامية.<br>🦹 الحرامية يكسبوا لو عددهم بقى قد أهل القرية أو أكتر.</p></div>' +
      '</div><button class="btn red" data-a="v_start">وزّع الأدوار 🎭</button>', "", Y.cur() === "set_village");
  }

  /* ---------- deal ---------- */
  function start() {
    var ids = S.players.map(function (p) { return p.id; }), t = Math.min(cf.thieves, maxThieves(ids.length));
    if (t < 1) { Y.toast("أهل القرية محتاجة 3 لاعيبة على الأقل"); Y.players(); return; }
    clearT();
    V = { order: ids, alive: ids.slice(), out: [], roles: {}, thieves: t, phase: "deal", i: 0, talk: 1, round: 1, votes: {}, pick: null, last: null, winner: null };
    var pool = Y.shuffle(ids.slice());
    ids.forEach(function (id) { V.roles[id] = "v"; });
    pool.slice(0, t).forEach(function (id) { V.roles[id] = "t"; });
    AU.preload(["reveal", "pass", "vote", "drumroll", "eliminate", "tie", "win", "evil", "mystery"]);
    AU.music("mystery");
    try { navigator.wakeLock && navigator.wakeLock.request("screen").catch(function () { }); } catch (e) { }
    passRole();
  }
  function handoff(id, label, line, btn, action) {
    var p = P(id);
    return top(label) + '<div class="grow center" style="gap:10px"><div class="mut" style="font-size:20px;font-weight:700">ادّي الموبايل لـ</div>' + av(p.av, "xl") +
      '<div class="disp" style="font-size:44px;line-height:1.1">' + esc(p.name) + '</div><div class="pill cy">🙈 ' + line + "</div></div>" +
      '<button class="btn pulse" data-a="' + action + '">أنا ' + esc(p.name) + " — " + btn + "</button>";
  }
  function passRole() {
    V.phase = "deal";
    Y.show("v_pass", handoff(V.order[V.i], "توزيع الأدوار " + (V.i + 1) + " / " + V.order.length, "محدش غيره يبص على الشاشة", "اكشف دوري 👀", "v_show"));
  }
  function showRole() {
    var id = V.order[V.i], p = P(id), t = isT(id), last = V.i === V.order.length - 1;
    V.phase = "role";
    Y.show("v_role", top("توزيع الأدوار " + (V.i + 1) + " / " + V.order.length) +
      '<div class="grow center"><div class="rolecard"><div class="mut sm">' + esc(p.name) + '، دورك هو</div><div class="remoji">' + (t ? "🦹" : "🏡") + '</div><div class="disp rname">' + (t ? "أنت الحرامي" : "أنت من أهل القرية") + "</div>" +
      '<p class="sm">' + (t ? "اتخفّى وسطهم، واقنعهم إنك بريء لحد ما القرية تقع." : "ركّز في كلام الكل.. واكشف الحرامي قبل ما يسرق القرية.") + "</p></div></div>" +
      '<button class="btn go" data-a="v_hide">' + (last ? "إخفاء الدور وبدء النقاش" : "إخفاء الدور وتسليم الموبايل") + "</button>");
    AU.play("reveal", { gap: 0 });                 /* same sound for both roles: nobody can tell by ear */
  }

  /* ---------- discussion ---------- */
  function chips(ids, cls) {
    return '<div class="pgrid ' + (ids.length <= 6 ? "big" : "") + '" style="margin-top:0">' + ids.map(function (id) { var p = P(id); return '<div class="pb ' + (cls || "") + '">' + av(p.av) + "<span>" + esc(p.name) + "</span></div>"; }).join("") + "</div>";
  }
  function talk(noAnim) {
    V.phase = "talk";
    Y.show("v_talk", top("جولة " + V.round) + '<div class="scroll"><div class="qcard"><div class="lead">🗣 وقت النقاش • لفة ' + V.talk + '</div><div class="q">مين الحرامي؟</div><div class="mut sm" style="margin-top:6px">كل واحد يدافع عن نفسه ويقول شاكك في مين.. في اللعبة ' + V.thieves + (V.thieves === 1 ? " حرامي" : " حرامية") + "</div></div>" +
      '<div class="card"><h3>🏘 في القرية <span class="mut sm" style="margin-inline-start:auto;font-weight:600">' + V.alive.length + " لاعب</span></h3>" + chips(V.alive) + "</div>" +
      (V.out.length ? '<div class="card"><h3>🚪 اتطردوا <span class="mut sm" style="margin-inline-start:auto;font-weight:600">أدوارهم سر</span></h3>' + chips(V.out, "gone") + "</div>" : "") + "</div>" +
      '<button class="btn sec" data-a="v_more">🔁 لفة نقاش كمان</button><button class="btn red" data-a="v_vote">🗳 نبدأ التصويت</button>', "", noAnim);
  }

  /* ---------- secret vote ---------- */
  function passVote() {
    V.phase = "vpass"; V.pick = null;
    Y.show("v_vpass", handoff(V.alive[V.i], "التصويت " + (V.i + 1) + " / " + V.alive.length, "التصويت سري.. خبّي الشاشة", "هصوّت 🗳", "v_ballot"));
  }
  function ballot(noAnim) {
    var me = V.alive[V.i], others = V.alive.filter(function (id) { return id !== me; });
    V.phase = "ballot";
    Y.show("v_ballot", top("التصويت " + (V.i + 1) + " / " + V.alive.length) + '<div class="scroll"><div class="qcard red"><div class="lead">🗳 ' + esc(P(me).name) + '، صوتك سر</div><div class="q">شاكك في مين؟</div></div>' +
      '<div class="pgrid ' + (others.length <= 6 ? "big" : "") + '" style="margin-top:0">' + others.map(function (id) { var p = P(id); return '<button class="pb vote ' + (V.pick === id ? "on" : "") + '" data-a="v_pick" data-v="' + id + '">' + av(p.av) + "<span>" + esc(p.name) + "</span></button>"; }).join("") + "</div></div>" +
      '<button class="btn go" data-a="v_confirm"' + (V.pick ? "" : " disabled") + ">تأكيد التصويت ✔</button>", "", noAnim);
  }
  function allVoted() {
    V.phase = "wait";
    Y.show("v_wait", top("جولة " + V.round) + '<div class="grow center" style="gap:12px"><div style="font-size:84px;line-height:1">🗳</div><div class="disp" style="font-size:38px">كل الأصوات اتسجلت</div><div class="mut">اتجمّعوا حوالين الموبايل..</div></div><button class="btn gold pulse" data-a="v_reveal">أعلن النتيجة 🥁</button>');
  }
  function tally() {
    var c = {}, top1 = 0, lead = [];
    V.alive.forEach(function (id) { var t = V.votes[id]; if (t) c[t] = (c[t] || 0) + 1; });
    for (var id in c) { if (c[id] > top1) { top1 = c[id]; lead = [id]; } else if (c[id] === top1) lead.push(id); }
    return { out: lead.length === 1 ? lead[0] : null, n: top1, tie: lead.length > 1 };
  }
  function suspense() {
    V.phase = "suspense";
    Y.overlay('<div class="center" style="gap:18px"><div class="drum">🥁</div><div class="disp" style="font-size:40px;text-shadow:0 0 24px var(--pink)">القرية قررت..</div></div>', "block");
    AU.play("drumroll", { gap: 0 });
    timer = setTimeout(function () { timer = null; Y.overlay(""); result(); }, 2400);
  }
  function winner() { var c = counts(); return c.t === 0 ? "v" : c.t >= c.v ? "t" : null; }
  function result() {
    var r = tally(); V.last = r; V.phase = "result";
    if (r.out) { V.alive.splice(V.alive.indexOf(r.out), 1); V.out.push(r.out); }
    V.winner = winner();
    var body;
    if (r.out) {
      var p = P(r.out);
      body = '<div class="verdict disp no" style="font-size:min(15vw,70px)">اتطرد!</div>' + av(p.av, "xl gonebig") + '<div class="disp" style="font-size:40px">' + esc(p.name) + '</div><div class="mut">خد ' + r.n + (r.n === 1 ? " صوت" : r.n === 2 ? " صوتين" : " أصوات") + ' وخرج من القرية</div><div class="pill">🤫 دوره هيفضل سر</div>';
      AU.play("eliminate", { gap: 0 }); Y.vib([120, 60, 240]);
    } else {
      body = '<div style="font-size:84px;line-height:1">⚖️</div><div class="disp" style="font-size:52px;color:var(--gold)">تعادل!</div><div class="mut" style="font-size:19px">' + (r.n ? "الأصوات اتقسمت.. محدش هيتطرد" : "محدش صوّت.. محدش هيتطرد") + '</div><div class="pill cy">نقاش جديد وتصويت تاني</div>';
      AU.play("tie", { gap: 0 });
    }
    Y.show("v_result", top("جولة " + V.round) + '<div class="grow center" style="gap:8px">' + body + "</div>" +
      '<button class="btn ' + (V.winner ? "gold pulse" : "go") + '" data-a="v_after">' + (V.winner ? "اكشف النهاية 🎭" : "نرجع للنقاش 🗣") + "</button>");
  }
  function end() {
    V.phase = "end"; AU.stopMusic(0.4);
    var vw = V.winner === "v", th = V.order.filter(isT);
    Y.show("v_end", '<div class="center" style="gap:4px;padding-top:8px"><div style="font-size:60px;line-height:1">' + (vw ? "🏡" : "🦹") + '</div><div class="disp ' + (vw ? "wv" : "wt") + '" style="font-size:min(11vw,46px);line-height:1.15">' + (vw ? "أهل القرية كسبوا!" : th.length > 1 ? "الحرامية كسبوا!" : "الحرامي كسب!") + "</div>" +
      '<div class="mut">' + (th.length > 1 ? "الحرامية كانوا: " : "الحرامي كان: ") + '<b style="color:var(--bad)">' + th.map(function (id) { return esc(P(id).name); }).join(" و ") + "</b></div></div>" +
      '<div class="scroll"><div class="board">' + V.order.slice().sort(function (a, b) { return (isT(b) ? 1 : 0) - (isT(a) ? 1 : 0); }).map(function (id, i) {
        var p = P(id), t = isT(id), gone = V.out.indexOf(id) >= 0;
        return '<div class="brow ' + (t ? "thief" : "") + '" style="animation-delay:' + i * 0.05 + 's">' + av(p.av, "sm") + "<b>" + esc(p.name) + (gone ? ' <small class="mut">• اتطرد</small>' : "") + '</b><span class="pill ' + (t ? "rd" : "gr") + '">' + (t ? "🦹 حرامي" : "🏡 أهل القرية") + "</span></div>";
      }).join("") + '</div></div><button class="btn go" data-a="v_again">العب تاني 🔁</button><button class="btn sec" data-a="home">الرئيسية</button>');
    AU.play(vw ? "win" : "evil", { gap: 0 });
    Y.confetti(vw ? Y.C_OK : ["#ff4d6d", "#8f2bff", "#120a38", "#ff3fd8"], 170);
  }
  function stop() { clearT(); V = null; }

  Y.register("village", {
    name: "أهل القرية", desc: "وسطكم حرامي.. اتناقشوا وصوّتوا في السر واكشفوه", art: ART, btn: "red", min: 3,
    minMsg: "أهل القرية محتاجة 3 لاعيبة على الأقل 🏘️",
    how: [
      ["🏘️", "أهل القرية", "كلكم من أهل القرية.. إلا حرامي أو اتنين أو تلاتة مستخبيين وسطكم. الموبايل بيلف وكل واحد يشوف دوره لوحده."],
      ["🗣", "النقاش", "اتكلموا ودافعوا عن نفسكم وشكّكوا في بعض. عايزين وقت أكتر؟ \"لفة نقاش كمان\". جاهزين؟ \"نبدأ التصويت\"."],
      ["🗳", "التصويت السري", "كل لاعب يصوّت لوحده على اللي شاكك فيه. أكتر واحد ياخد أصوات يتطرد.. من غير ما دوره يتكشف. لو تعادل محدش يتطرد."],
      ["🏆", "مين يكسب؟", "أهل القرية يكسبوا لما كل الحرامية يتطردوا. الحرامية يكسبوا لما عددهم يبقى قد أهل القرية أو أكتر."]
    ],
    openSettings: settings,
    isActive: function () { return !!V; }, atEnd: function () { return !!V && V.phase === "end"; },
    stop: stop,
    actions: {
      v_thieves: function (v) { if (+v > maxThieves(S.players.length)) { Y.toast("محتاجين " + (2 * v + 1) + " لاعيبة على الأقل لـ " + v + " حرامية"); return; } cf.thieves = +v; Y.persist(); settings(); },
      v_start: function () { start(); return "quiet"; },
      v_show: function () { if (V && V.phase === "deal") showRole(); return "quiet"; },
      v_hide: function () {
        if (!V || V.phase !== "role") return "quiet";
        AU.play("pass", { gap: 0 }); V.i++;
        if (V.i < V.order.length) passRole(); else { V.i = 0; talk(); }
        return "quiet";
      },
      v_more: function () { if (!V || V.phase !== "talk") return "quiet"; V.talk++; AU.play("turn", { gap: 0 }); talk(true); return "quiet"; },
      v_vote: function () { if (!V || V.phase !== "talk") return "quiet"; V.votes = {}; V.i = 0; AU.play("pass", { gap: 0 }); passVote(); return "quiet"; },
      v_ballot: function () { if (V && V.phase === "vpass") ballot(); return "quiet"; },
      v_pick: function (v) { if (!V || V.phase !== "ballot" || v === V.alive[V.i] || V.alive.indexOf(v) < 0) return; V.pick = v; ballot(true); },
      v_confirm: function () {
        if (!V || V.phase !== "ballot" || !V.pick) return "quiet";
        V.votes[V.alive[V.i]] = V.pick; V.pick = null; AU.play("vote", { gap: 0 }); Y.vib(30); V.i++;
        if (V.i < V.alive.length) passVote(); else allVoted();
        return "quiet";
      },
      v_reveal: function () { if (V && V.phase === "wait") suspense(); return "quiet"; },
      v_after: function () {
        if (!V || V.phase !== "result") return "quiet";
        if (V.winner) end(); else { V.round++; V.talk = 1; V.i = 0; talk(); }
        return "quiet";
      },
      v_again: function () { AU.stopSfx(); start(); return "quiet"; }
    }
  });
  window.__ytm.village = function () { return V; };
})();
