(function () {
  "use strict";

  var COLORS = ["#ff5d73", "#ff9f1c", "#ffd23f", "#8be04e", "#2ec4b6", "#3fa7ff", "#7b6cff", "#c26bff", "#ff6bcb", "#f4f0ff"];
  var $ = function (s) { return document.querySelector(s); };

  /* Tirage non biaisé : échantillonnage avec rejet sur des entiers 32 bits aléatoires. */
  function secureInt(n) {
    if (n <= 1) return 0;
    var c = window.crypto;
    if (!c || !c.getRandomValues) return Math.floor(Math.random() * n);
    var limit = Math.floor(0x100000000 / n) * n;
    var a = new Uint32Array(1), x;
    do { c.getRandomValues(a); x = a[0]; } while (x >= limit);
    return x % n;
  }

  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Onglets ---------- */
  var tabs = document.querySelectorAll(".tab");
  tabs.forEach(function (t) {
    t.addEventListener("click", function () {
      tabs.forEach(function (o) { o.setAttribute("aria-selected", o === t ? "true" : "false"); });
      $("#view-fingers").hidden = t.dataset.tab !== "fingers";
      $("#view-names").hidden = t.dataset.tab !== "names";
      document.body.classList.toggle("fingers-mode", t.dataset.tab === "fingers");
    });
  });

  document.body.classList.add("fingers-mode");

  /* ---------- Mode doigts ---------- */
  var arena = $("#arena"), flood = $("#flood"), hudTitle = $("#hud-title"), hudCount = $("#hud-count"), replay = $("#replay");
  var fingers = new Map();
  var mode = "idle";
  var timer = null, remaining = 0, mouseSeq = 0;

  function pos(e) {
    var r = arena.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function freeColor() {
    var used = new Set();
    fingers.forEach(function (f) { used.add(f.color); });
    var pool = COLORS.filter(function (c) { return !used.has(c); });
    if (!pool.length) pool = COLORS;
    return pool[secureInt(pool.length)];
  }

  function place(f) { f.el.style.transform = "translate(" + f.x + "px," + f.y + "px)"; }

  function addFinger(key, p) {
    var el = document.createElement("div");
    var color = freeColor();
    el.className = "dot";
    el.style.setProperty("--c", color);
    var f = { x: p.x, y: p.y, color: color, el: el };
    place(f);
    arena.appendChild(el);
    fingers.set(key, f);
    update();
  }

  function removeFinger(key) {
    var f = fingers.get(key);
    if (!f) return;
    f.el.remove();
    fingers.delete(key);
    update();
  }

  function nearestMouseDot(p) {
    var hit = null, best = 52;
    fingers.forEach(function (f, key) {
      if (typeof key !== "string") return;
      var d = Math.hypot(f.x - p.x, f.y - p.y);
      if (d < best) { best = d; hit = key; }
    });
    return hit;
  }

  function update() {
    clearTimeout(timer);
    mode = "idle";
    arena.classList.remove("counting");
    var n = fingers.size;
    arena.classList.toggle("has-fingers", n > 0);
    if (n === 0) {
      hudTitle.textContent = "Posez chacun un doigt sur l'écran";
      hudCount.textContent = "";
    } else if (n === 1) {
      hudTitle.textContent = "Il faut au moins deux personnes";
      hudCount.textContent = "";
    } else {
      mode = "counting";
      arena.classList.add("counting");
      remaining = 3;
      tick();
    }
  }

  function tick() {
    hudTitle.textContent = fingers.size + " personnes en lice, ne bougez plus";
    hudCount.textContent = String(remaining);
    timer = setTimeout(function () {
      remaining -= 1;
      if (remaining <= 0) pick(); else tick();
    }, 1000);
  }

  function pick() {
    var list = [];
    fingers.forEach(function (f) { list.push(f); });
    if (list.length < 2) { update(); return; }
    var w = list[secureInt(list.length)];
    mode = "done";
    flood.style.setProperty("--x", w.x + "px");
    flood.style.setProperty("--y", w.y + "px");
    flood.style.setProperty("--c", w.color);
    list.forEach(function (f) { f.el.classList.add(f === w ? "won" : "lost"); });
    arena.classList.remove("counting");
    arena.classList.add("done");
    hudTitle.textContent = "C'est toi !";
    hudCount.textContent = "";
    replay.hidden = false;
    try { if (navigator.vibrate) navigator.vibrate([120, 60, 220]); } catch (err) {}
  }

  function resetArena() {
    clearTimeout(timer);
    fingers.forEach(function (f) { f.el.remove(); });
    fingers.clear();
    arena.classList.remove("done");
    replay.hidden = true;
    update();
  }

  arena.addEventListener("pointerdown", function (e) {
    if (e.target.closest && e.target.closest("button")) return;
    if (mode === "done") return;
    e.preventDefault();
    var p = pos(e);
    if (e.pointerType === "mouse") {
      var hit = nearestMouseDot(p);
      if (hit !== null) removeFinger(hit);
      else addFinger("m" + (++mouseSeq), p);
    } else if (!fingers.has(e.pointerId)) {
      addFinger(e.pointerId, p);
    }
  });

  arena.addEventListener("pointermove", function (e) {
    if (mode === "done" || e.pointerType === "mouse") return;
    var f = fingers.get(e.pointerId);
    if (!f) return;
    var p = pos(e);
    f.x = p.x; f.y = p.y;
    place(f);
  });

  function lift(e) {
    if (mode === "done" || e.pointerType === "mouse") return;
    removeFinger(e.pointerId);
  }
  arena.addEventListener("pointerup", lift);
  arena.addEventListener("pointercancel", lift);
  arena.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  /* Rien ne doit défiler, se sélectionner ou se glisser dans l'arène. */
  arena.addEventListener("touchmove", function (e) { e.preventDefault(); }, { passive: false });
  arena.addEventListener("wheel", function (e) { e.preventDefault(); }, { passive: false });
  arena.addEventListener("selectstart", function (e) { e.preventDefault(); });
  arena.addEventListener("dragstart", function (e) { e.preventDefault(); });
  replay.addEventListener("click", resetArena);

  /* ---------- Mode prénoms ---------- */
  var KEY = "qui-commence-v1";
  var state = { people: [], sample: true, once: false };
  var seq = 0;
  var lastId = null;
  var drawing = false;

  function newId() { seq += 1; return "p" + Date.now().toString(36) + seq; }

  function firstFreeColor() {
    var used = {};
    state.people.forEach(function (p) { used[p.color] = true; });
    for (var i = 0; i < COLORS.length; i++) if (!used[COLORS[i]]) return COLORS[i];
    return COLORS[state.people.length % COLORS.length];
  }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var d = JSON.parse(raw);
        if (d && Array.isArray(d.people)) {
          state.people = d.people.filter(function (p) { return p && typeof p.name === "string" && typeof p.color === "string"; })
            .map(function (p) { return { id: String(p.id || newId()), name: p.name.slice(0, 24), color: p.color, drawn: !!p.drawn }; });
          state.sample = !!d.sample;
          state.once = !!d.once;
          return;
        }
      }
    } catch (err) {}
    ["Léa", "Tom", "Inès", "Karim"].forEach(function (n) {
      state.people.push({ id: newId(), name: n, color: firstFreeColor(), drawn: false });
    });
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (err) {}
  }

  var list = $("#people"), msg = $("#msg"), who = $("#who"), sub = $("#sub"), result = $("#result"), go = $("#go"), onceBox = $("#once");

  function render() {
    list.textContent = "";
    state.people.forEach(function (p) {
      var li = document.createElement("li");
      li.className = "person" + (state.once && p.drawn ? " passed" : "") + (p.id === lastId ? " hot" : "");
      li.dataset.id = p.id;
      li.style.setProperty("--c", p.color);
      var sw = document.createElement("span"); sw.className = "swatch";
      var nm = document.createElement("span"); nm.className = "pname"; nm.textContent = p.name;
      li.appendChild(sw); li.appendChild(nm);
      if (state.once && p.drawn) {
        var sn = document.createElement("span"); sn.className = "seen"; sn.textContent = "déjà passé·e";
        li.appendChild(sn);
      }
      var rm = document.createElement("button");
      rm.type = "button"; rm.className = "rm"; rm.dataset.rm = p.id;
      rm.setAttribute("aria-label", "Retirer " + p.name);
      rm.textContent = "×";
      li.appendChild(rm);
      list.appendChild(li);
    });
    var n = state.people.length;
    $("#people-count").textContent = "(" + n + ")";
    $("#sample-note").hidden = !(state.sample && n > 0);
    $("#clear").hidden = n === 0;
    onceBox.checked = state.once;
    go.disabled = n < 2 || drawing;
    if (n < 2) { sub.textContent = n === 0 ? "Ajoutez au moins deux prénoms" : "Ajoutez encore un prénom"; }
  }

  $("#add-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var input = $("#new-name");
    var name = input.value.replace(/\s+/g, " ").trim();
    if (!name) { msg.textContent = "Écrivez un prénom avant d'ajouter."; return; }
    var dup = state.people.some(function (p) { return p.name.toLowerCase() === name.toLowerCase(); });
    if (dup) { msg.textContent = name + " est déjà dans la liste."; return; }
    msg.textContent = "";
    state.people.push({ id: newId(), name: name, color: firstFreeColor(), drawn: false });
    state.sample = false;
    input.value = "";
    save(); render(); input.focus();
  });

  list.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-rm]");
    if (!b || drawing) return;
    var id = b.dataset.rm;
    state.people = state.people.filter(function (p) { return p.id !== id; });
    if (lastId === id) lastId = null;
    state.sample = false;
    msg.textContent = "";
    save(); render();
  });

  $("#clear").addEventListener("click", function () {
    if (drawing) return;
    state.people = []; state.sample = false; lastId = null;
    who.textContent = "?";
    result.classList.remove("lit", "final");
    result.style.removeProperty("--rc");
    save(); render();
  });

  onceBox.addEventListener("change", function () {
    state.once = onceBox.checked;
    if (!state.once) state.people.forEach(function (p) { p.drawn = false; });
    save(); render();
  });

  function show(p, final) {
    who.textContent = p.name;
    result.style.setProperty("--rc", p.color);
    result.classList.add("lit");
    result.classList.toggle("final", !!final);
    sub.textContent = final ? "C'est à toi de commencer" : "Tirage en cours…";
  }

  function draw() {
    if (drawing || state.people.length < 2) return;
    var pool = state.once ? state.people.filter(function (p) { return !p.drawn; }) : state.people.slice();
    if (!pool.length) {
      state.people.forEach(function (p) { p.drawn = false; });
      pool = state.people.slice();
    }
    var wi = secureInt(pool.length);
    var winner = pool[wi];
    var m = pool.length;
    var steps = reduceMotion ? 1 : 24;
    var start = (((wi - (steps - 1)) % m) + m) % m;
    drawing = true;
    go.disabled = true;
    result.classList.remove("final");
    lastId = null;
    var k = 0;

    function step() {
      var p = pool[(start + k) % m];
      list.querySelectorAll(".person.hot").forEach(function (el) { el.classList.remove("hot"); });
      var li = list.querySelector('[data-id="' + p.id + '"]');
      if (li) { li.classList.add("hot"); }
      if (k === steps - 1) {
        show(winner, true);
        lastId = winner.id;
        if (state.once) winner.drawn = true;
        drawing = false;
        save(); render();
        try { if (navigator.vibrate) navigator.vibrate(150); } catch (err) {}
        return;
      }
      show(p, false);
      var delay = 55 + k * k * 0.32;
      k += 1;
      setTimeout(step, delay);
    }
    step();
  }

  go.addEventListener("click", draw);

  load();
  render();
  update();
})();
