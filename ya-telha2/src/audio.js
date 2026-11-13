/* نظام الصوت الموحد — Music Manager + SFX Manager + Master / Music / SFX volume + Mute
   - الملفات محلية (src/audio/*.mp3) وبتتضمّن جوه الصفحة وقت البناء (window.AUDIO_DATA).
   - مفيش أي صوت بيشتغل قبل أول لمسة من المستخدم (قيود Autoplay في Chrome / Android WebView). */
window.AudioSys = (function () {
  "use strict";
  var KEY = "ytm_audio", DEF = { master: 1, music: 0.6, sfx: 1, muted: false, musicOn: true, sfxOn: true };
  var cfg = {}, ctx = null, gMaster, gMusic, gSfx, unlocked = false;
  var buffers = {}, pending = {}, lastAt = {}, live = [], mus = { name: null, src: null, gain: null }, wantMusic = null;
  var listeners = [];
  (function loadCfg() {
    var s = null; try { s = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { }
    for (var k in DEF) cfg[k] = s && typeof s[k] === typeof DEF[k] ? s[k] : DEF[k];
  })();
  function saveCfg() { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) { } }
  function meta(n) { return (window.AUDIO_META && window.AUDIO_META[n]) || {}; }

  function ensure() {
    if (ctx) return ctx;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      gMaster = ctx.createGain(); gMusic = ctx.createGain(); gSfx = ctx.createGain();
      gMusic.connect(gMaster); gSfx.connect(gMaster); gMaster.connect(ctx.destination); apply();
    } catch (e) { ctx = null; }
    return ctx;
  }
  function apply() {
    if (!ctx) return; var t = ctx.currentTime;
    gMaster.gain.setTargetAtTime(cfg.muted ? 0 : cfg.master, t, 0.02);
    gMusic.gain.setTargetAtTime(cfg.musicOn ? cfg.music : 0, t, 0.05);
    gSfx.gain.setTargetAtTime(cfg.sfxOn ? cfg.sfx : 0, t, 0.02);
  }
  /* call from inside a user gesture */
  function unlock() {
    if (!ensure()) return;
    /* iOS Safari: the context starts "suspended" and becomes "interrupted" after a call / app switch — resume on every tap */
    if (ctx.state !== "running" && !document.hidden) { try { var r = ctx.resume(); if (r && r.catch) r.catch(function () { }); } catch (e) { } }
    if (!unlocked) {
      try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch (e) { }   /* play even with the iPhone ring switch on silent (iOS 17+) */
      try { var s0 = ctx.createBufferSource(); s0.buffer = ctx.createBuffer(1, 1, 22050); s0.connect(ctx.destination); s0.start(0); } catch (e) { }   /* classic iOS unlock blip */
      unlocked = true; if (wantMusic) { var w = wantMusic; wantMusic = null; music(w); }
    }
  }
  function decode(name, cb) {
    if (buffers[name]) { cb(buffers[name]); return; }
    if (pending[name]) { pending[name].push(cb); return; }
    var b64 = window.AUDIO_DATA && window.AUDIO_DATA[name];
    if (!b64 || !ensure()) return;
    pending[name] = [cb];
    try {
      var bin = atob(b64), arr = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      var done = function (buf) { buffers[name] = buf; var q = pending[name] || []; delete pending[name]; q.forEach(function (f) { f(buf); }); };
      var fail = function () { delete pending[name]; };
      var p = ctx.decodeAudioData(arr.buffer, done, fail);
      if (p && p.catch) p.catch(fail);
    } catch (e) { delete pending[name]; }
  }
  function preload(names) { if (!ensure()) return; names.forEach(function (n) { decode(n, function () { }); }); }

  /* SFX — opts: vol, rate, gap (ms: ignore a repeat of the same sound inside this window) */
  function play(name, o) {
    o = o || {};
    if (!unlocked || !ensure() || cfg.muted || !cfg.sfxOn) return;
    var now = Date.now(), gap = o.gap === undefined ? 40 : o.gap;
    if (lastAt[name] && now - lastAt[name] < gap) return;
    lastAt[name] = now;
    decode(name, function (buf) {
      try {
        var s = ctx.createBufferSource(), g = ctx.createGain();
        s.buffer = buf; s.playbackRate.value = o.rate || 1; g.gain.value = o.vol === undefined ? 1 : o.vol;
        s.connect(g); g.connect(gSfx); s.start();
        live.push(s); s.onended = function () { var i = live.indexOf(s); if (i >= 0) live.splice(i, 1); };
      } catch (e) { }
    });
  }
  /* synthesised blip on the SFX bus (used by the auction game) */
  function tone(f, d, type, vol, at, f2) {
    if (!unlocked || !ensure() || cfg.muted || !cfg.sfxOn) return;
    try {
      var t = ctx.currentTime + (at || 0), o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type || "sine"; o.frequency.setValueAtTime(f, t);
      if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.2, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g); g.connect(gSfx); o.start(t); o.stop(t + d + 0.03);
    } catch (e) { }
  }
  /* Music — one track at a time, cross-faded; music(null) stops */
  function music(name) {
    if (!unlocked) { wantMusic = name; return; }
    if (!ensure() || mus.name === name) return;
    stopMusic(0.5); if (!name) return;
    mus.name = name;
    decode(name, function (buf) {
      if (mus.name !== name || mus.src) return;
      try {
        var s = ctx.createBufferSource(), g = ctx.createGain(), L = meta(name).loop, t = ctx.currentTime;
        s.buffer = buf; s.loop = true;
        if (L && buf.duration >= L + 0.3) { s.loopStart = 0.15; s.loopEnd = 0.15 + L; }
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(1, t + 0.8);
        s.connect(g); g.connect(gMusic); s.start(t, L ? 0.15 : 0);
        mus.src = s; mus.gain = g;
      } catch (e) { mus.name = null; }
    });
  }
  function stopMusic(fade) {
    wantMusic = null;
    var s = mus.src, g = mus.gain; mus = { name: null, src: null, gain: null };
    if (!s || !ctx) return;
    try {
      var t = ctx.currentTime, f = fade === undefined ? 0.4 : fade;
      g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + f); s.stop(t + f + 0.05);
    } catch (e) { }
  }
  function stopSfx() { live.slice().forEach(function (s) { try { s.stop(); } catch (e) { } }); live = []; lastAt = {}; }
  function stopAll() { stopMusic(0.25); stopSfx(); }

  function set(k, v) { if (!(k in DEF)) return; cfg[k] = typeof DEF[k] === "number" ? Math.max(0, Math.min(1, +v)) : !!v; saveCfg(); apply(); listeners.forEach(function (f) { f(cfg); }); }
  function toggleMute() { set("muted", !cfg.muted); return cfg.muted; }
  document.addEventListener("visibilitychange", function () {
    if (!ctx) return;
    try { if (document.hidden) ctx.suspend(); else if (unlocked) { var r = ctx.resume(); if (r && r.catch) r.catch(function () { }); } } catch (e) { }
  });
  return {
    unlock: unlock, play: play, tone: tone, music: music, stopMusic: stopMusic, stopSfx: stopSfx, stopAll: stopAll, preload: preload,
    set: set, get: function () { return cfg; }, toggleMute: toggleMute, onChange: function (f) { listeners.push(f); },
    debug: function () { return { unlocked: unlocked, state: ctx ? ctx.state : "none", music: mus.name, want: wantMusic, live: live.length, buffers: Object.keys(buffers) }; }
  };
})();
