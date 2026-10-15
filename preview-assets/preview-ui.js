/* Preview-only UI layer for Day 6 Talk. No checker, mic, scoring or auth changes.
   - colour-codes level cards (Basic=green, Int 2=blue, Int 3=red) and sets html[data-book]
   - replaces the "Hear the line" <select> with voice chips (select kept, hidden, driven by "change") */
(function () {
  "use strict";
  var root = document.documentElement;
  function fam(t) { t = String(t || "").toUpperCase(); return /INT\s*3/.test(t) ? "red" : /INT\s*2/.test(t) ? "blue" : "green"; }
  var ICON = { green: "🌿", blue: "💎", red: "🍎" };
  function tagCards() {
    document.querySelectorAll("#bookList .book-card:not([data-pv])").forEach(function (b) {
      var h = b.querySelector("h2");
      var f = fam(h && h.textContent);
      b.setAttribute("data-pv", f);
      b.classList.add("pv-" + f);
      var i = document.createElement("span");
      i.className = "pv-card-icon"; i.setAttribute("aria-hidden", "true"); i.textContent = ICON[f];
      b.insertBefore(i, b.firstChild);
      if (/review/i.test(h ? h.textContent : "")) b.classList.add("pv-review");
      b.addEventListener("click", function () { root.setAttribute("data-book", f); }, true);
    });
    var home = document.getElementById("viewHome");
    if (home && !home.hidden) root.setAttribute("data-book", "green");
  }
  function voiceChips() {
    var sel = document.getElementById("listenVoice");
    if (!sel || !sel.options.length) return false;
    if (document.querySelector(".pv-voices")) return true;
    var label = sel.closest("label");
    label.classList.add("pv-hidden-control");
    var row = document.createElement("div");
    row.className = "pv-voices";
    row.setAttribute("role", "group");
    row.setAttribute("aria-label", "Hear the line");
    var cap = document.createElement("span");
    cap.className = "pv-voices-cap"; cap.textContent = "🔊 Hear the line";
    row.appendChild(cap);
    var ICONS = { texan: "🤠", grandpa: "👴", american: "🧑" };
    Array.prototype.forEach.call(sel.options, function (o) {
      var c = document.createElement("button");
      c.type = "button";
      c.className = "pv-voice" + (o.value === sel.value ? " is-on" : "");
      c.setAttribute("aria-pressed", String(o.value === sel.value));
      c.textContent = (ICONS[o.value] || "🔈") + " " + o.textContent;
      c.onclick = function () {
        sel.value = o.value;
        sel.dispatchEvent(new Event("change", { bubbles: true }));
        row.querySelectorAll(".pv-voice").forEach(function (x) { var on = x === c; x.classList.toggle("is-on", on); x.setAttribute("aria-pressed", String(on)); });
      };
      row.appendChild(c);
    });
    label.parentNode.insertBefore(row, label);
    return true;
  }
  var obs = new MutationObserver(function () { tagCards(); voiceChips(); });
  obs.observe(document.getElementById("app") || document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });
  var n = 0;
  (function wait() { tagCards(); if (!voiceChips() && n++ < 100) setTimeout(wait, 100); })();
})();
