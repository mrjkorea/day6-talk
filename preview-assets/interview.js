/* Preview-only "interview with the teacher" layer for Day 6.
   Avatar cards drive the app's EXISTING reply-voice buttons (#replyVoices [data-voice]),
   which call the app's own chooseReplyVoice(). No checker/mic/score logic touched.
   Placeholder SVG faces: swap the AVATARS[].svg strings for real pictures later. */
(function () {
  "use strict";
  function face(o) {
    return '<svg viewBox="0 0 120 120" role="img" aria-hidden="true">' +
      '<circle cx="60" cy="60" r="58" fill="' + o.bg + '"/>' +
      '<rect x="22" y="96" width="76" height="40" rx="30" fill="' + o.shirt + '"/>' +
      '<circle cx="60" cy="58" r="' + o.r + '" fill="#ffd9b8"/>' +
      o.hair +
      '<circle cx="' + (60 - o.eye) + '" cy="60" r="' + o.es + '" fill="#2b1d14"/><circle cx="' + (60 + o.eye) + '" cy="60" r="' + o.es + '" fill="#2b1d14"/>' +
      '<circle cx="' + (60 - o.eye - 2) + '" cy="58" r="1.6" fill="#fff"/><circle cx="' + (60 + o.eye - 2) + '" cy="58" r="1.6" fill="#fff"/>' +
      '<path d="M48 ' + o.my + ' Q60 ' + (o.my + 10) + ' 72 ' + o.my + '" stroke="#b5462f" stroke-width="3.5" fill="none" stroke-linecap="round" class="pv-mouth-shut"/>' +
      '<ellipse cx="60" cy="' + (o.my + 3) + '" rx="8" ry="6" fill="#7a2418" class="pv-mouth-open"/>' +
      '<circle cx="42" cy="' + (o.my - 2) + '" r="4" fill="#ff9e9e" opacity=".55"/><circle cx="78" cy="' + (o.my - 2) + '" r="4" fill="#ff9e9e" opacity=".55"/>' +
      (o.extra || "") + '</svg>';
  }
  var AVATARS = [
    { voice: "jay35", name: "Mr Jay", sub: "age 35", svg: face({ bg: "#cfe7ff", shirt: "#1d55c8", r: 30, eye: 11, es: 3.4, my: 72,
        hair: '<path d="M30 52 Q32 24 60 24 Q88 24 90 52 Q80 36 60 38 Q40 36 30 52Z" fill="#3b2a20"/>',
        extra: '<rect x="40" y="54" width="16" height="12" rx="4" fill="none" stroke="#333" stroke-width="2.5"/><rect x="64" y="54" width="16" height="12" rx="4" fill="none" stroke="#333" stroke-width="2.5"/><path d="M56 60h8" stroke="#333" stroke-width="2.5"/><path d="M42 80 Q60 92 78 80" stroke="#3b2a20" stroke-width="5" fill="none" opacity=".35"/>' }) },
    { voice: "jay15", name: "Teen Jay", sub: "age 15", svg: face({ bg: "#ffe3b3", shirt: "#ef4b3f", r: 29, eye: 11, es: 3.6, my: 72,
        hair: '<path d="M28 50 Q30 22 60 22 Q92 22 92 50 L84 44 L76 50 L68 42 L60 50 L50 42 L42 50 L36 44Z" fill="#2a1d16"/>',
        extra: '<path d="M26 44 Q60 14 94 44 L98 40 Q60 6 22 40Z" fill="#22a559"/><rect x="86" y="38" width="22" height="7" rx="3.5" fill="#22a559"/>' }) },
    { voice: "jay7", name: "Little Jay", sub: "age 7", svg: face({ bg: "#d9f7e3", shirt: "#ffcb2e", r: 33, eye: 12, es: 4.6, my: 74,
        hair: '<path d="M27 54 Q26 22 60 22 Q94 22 93 54 Q86 34 70 34 Q72 42 62 40 Q52 34 40 38 Q32 42 27 54Z" fill="#4a3324"/>',
        extra: '<circle cx="60" cy="22" r="5" fill="#4a3324"/>' }) }
  ];
  var KEY = "day6ReplyVoice";
  function current() { var v = localStorage.getItem(KEY) || "jay35"; return AVATARS.filter(function (a) { return a.voice === v; })[0] || AVATARS[0]; }
  function pick(a) {
    var btn = document.querySelector('#replyVoices button[data-voice="' + a.voice + '"]');
    if (btn) btn.click(); /* app's own chooseReplyVoice() */
    document.querySelectorAll(".pv-avatar").forEach(function (c) { var on = c.getAttribute("data-voice") === a.voice; c.classList.toggle("is-on", on); c.setAttribute("aria-pressed", String(on)); });
    paintInterviewer();
  }
  function buildPicker() {
    var home = document.getElementById("viewHome");
    if (!home || home.querySelector(".pv-pick")) return;
    var wrap = document.createElement("section");
    wrap.className = "pv-pick";
    wrap.innerHTML = '<h2 class="pv-step">1 · Who do you want to interview? <small>누구를 인터뷰할까요?</small></h2><div class="pv-avatars"></div><h2 class="pv-step">2 · Pick your book</h2>';
    var grid = wrap.querySelector(".pv-avatars");
    var cur = current();
    AVATARS.forEach(function (a) {
      var c = document.createElement("button");
      c.type = "button";
      c.className = "pv-avatar" + (a === cur ? " is-on" : "");
      c.setAttribute("data-voice", a.voice);
      c.setAttribute("aria-pressed", String(a === cur));
      c.innerHTML = '<span class="pv-avatar-pic">' + a.svg + '</span><span class="pv-avatar-name">' + a.name + '</span><span class="pv-avatar-sub">' + a.sub + '</span>';
      c.onclick = function () { pick(a); };
      grid.appendChild(c);
    });
    var list = document.getElementById("bookList");
    home.insertBefore(wrap, list);
  }
  function buildInterviewer() {
    var speak = document.getElementById("viewSpeak");
    if (!speak || speak.querySelector(".pv-call")) return;
    var call = document.createElement("div");
    call.className = "pv-call";
    call.innerHTML = '<div class="pv-call-video"><span class="pv-live">● LIVE</span><span class="pv-call-pic"></span><span class="pv-call-name"></span></div>' +
      '<div class="pv-bubble" aria-live="polite"><span class="pv-bubble-text"></span></div>';
    var cue = speak.querySelector(".cue-card");
    speak.appendChild(call);
    call.querySelector('.pv-bubble').onclick = function () { var b = document.getElementById('replyBanner'); if (b && this.classList.contains('is-reply')) b.click(); }; /* reply area sits at the BOTTOM, under the student's line + mic */
    var you = document.createElement("span");
    you.className = "pv-you"; you.textContent = "🙋 Your question — 질문하세요:";
    cue.insertBefore(you, cue.firstChild);
    paintInterviewer();
  }
  function paintInterviewer() {
    var call = document.querySelector(".pv-call");
    if (!call) return;
    var a = current();
    if (call.getAttribute("data-voice") !== a.voice) {
      call.setAttribute("data-voice", a.voice);
      call.querySelector(".pv-call-pic").innerHTML = a.svg;
      call.querySelector(".pv-call-name").textContent = a.name + " · " + a.sub;
    }
    var banner = document.getElementById("replyBanner");
    var reply = (document.getElementById("replyText") || {}).textContent || "";
    var showing = banner && !banner.hidden && reply.trim();
    var bubble = call.querySelector(".pv-bubble");
    if (bubble.classList.contains("is-reply") !== !!showing) bubble.classList.toggle("is-reply", !!showing);
    if (call.classList.contains("is-on") !== !!showing) call.classList.toggle("is-on", !!showing);
    var text = showing ? reply : "";
    var t = call.querySelector(".pv-bubble-text");
    if (t.textContent !== text) { t.textContent = text; bubble.classList.remove("pv-in"); void bubble.offsetWidth; bubble.classList.add("pv-in"); }
  }
  /* Talking mouth: observe (not change) media playback. Only animates while the reply is showing. */
  var talkTimer = null;
  function talk(on) {
    var call = document.querySelector(".pv-call");
    clearInterval(talkTimer); talkTimer = null;
    if (call) call.classList.remove("pv-talk");
    if (!on || !call || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    talkTimer = setInterval(function () { call.classList.toggle("pv-talk"); }, 150);
  }
  var origPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    var a = this, banner = document.getElementById("replyBanner");
    if (banner && !banner.hidden && !a.__pvTalk) {
      a.__pvTalk = 1;
      ["ended", "pause", "error"].forEach(function (ev) { a.addEventListener(ev, function () { talk(false); }); });
      a.addEventListener("playing", function () { talk(true); });
    }
    return origPlay.apply(this, arguments);
  };
  window.pvTalk = talk; /* for screenshots */
  var n = 0;
  (function wait() {
    if (document.querySelector("#replyVoices button[data-voice]")) {
      buildPicker(); buildInterviewer();
      new MutationObserver(paintInterviewer).observe(document.getElementById("viewSpeak"), { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["hidden"] });
    } else if (n++ < 150) setTimeout(wait, 100);
  })();
})();
