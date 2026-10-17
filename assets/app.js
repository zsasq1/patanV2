(function () {
  "use strict";

  var root = document.documentElement;
  var page = document.body.dataset.page;
  var base = document.body.dataset.base || "";

  /* ---------- хранилище (может быть недоступно) ---------- */
  function load(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
  function save(key, val) { try { localStorage.setItem(key, val); } catch (e) {} }

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $all(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
  function norm(s) { return (s || "").toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " "); }

  /* ---------- тема ---------- */
  var savedTheme = load("theme");
  if (savedTheme === "dark" || savedTheme === "light") root.dataset.theme = savedTheme;
  var themeBtn = $("#theme");
  if (themeBtn) {
    themeBtn.addEventListener("click", function () {
      var dark = root.dataset.theme
        ? root.dataset.theme === "dark"
        : window.matchMedia("(prefers-color-scheme: dark)").matches;
      root.dataset.theme = dark ? "light" : "dark";
      save("theme", root.dataset.theme);
    });
  }

  /* ---------- самопроверка ---------- */
  var quizBtn = $("#quiz");
  var shuffleBtn = $("#shuffle");

  /* плавающий глазик: виден, только когда кнопка самопроверки в шапке ушла за экран */
  var fab = null;
  if (quizBtn) {
    fab = document.createElement("button");
    fab.type = "button";
    fab.className = "fab";
    fab.setAttribute("aria-label", "Самопроверка");
    fab.setAttribute("title", "Самопроверка");
    fab.setAttribute("aria-pressed", "false");
    var eye = quizBtn.querySelector("svg");
    fab.innerHTML = eye ? eye.outerHTML : "";
    document.body.appendChild(fab);
    fab.addEventListener("click", function () {
      // держим на месте карточку, которую сейчас читают, — высота карточек меняется
      var anchor = $all(".prep, .qa").filter(function (el) {
        return !el.hidden && el.getBoundingClientRect().bottom > 0;
      })[0];
      var before = anchor ? anchor.getBoundingClientRect().top : 0;
      setQuiz(!document.body.classList.contains("quiz"));
      if (anchor) window.scrollBy(0, anchor.getBoundingClientRect().top - before);
    });
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        fab.classList.toggle("show", !entries[0].isIntersecting);
      }).observe(quizBtn);
    }
  }

  function setQuiz(on) {
    document.body.classList.toggle("quiz", on);
    if (quizBtn) quizBtn.setAttribute("aria-pressed", on ? "true" : "false");
    if (fab) fab.setAttribute("aria-pressed", on ? "true" : "false");
    if (shuffleBtn) shuffleBtn.hidden = !on;
    $all(".open").forEach(function (el) { el.classList.remove("open"); });
    save("quiz-" + page, on ? "1" : "0");
  }
  if (quizBtn) quizBtn.addEventListener("click", function () {
    setQuiz(!document.body.classList.contains("quiz"));
  });
  document.addEventListener("click", function (e) {
    var b = e.target.closest(".reveal");
    if (b) b.closest(".prep, .qa").classList.add("open");
  });

  /* ---------- поиск ---------- */
  var searchInput = $("#search");
  function applySearch() {
    var q = norm(searchInput ? searchInput.value.trim() : "");
    var shown = 0;
    $all("[data-text]").forEach(function (el) {
      var ok = !q || el.dataset.text.indexOf(q) !== -1;
      el.hidden = !ok;
      if (ok) shown++;
    });
    $all("[data-group]").forEach(function (g) {
      var any = $all("[data-text]", g).some(function (el) { return !el.hidden; });
      g.hidden = !any;
    });
    var other = $("#other");
    if (other && page === "preps") {
      var ot = tab === "micro" ? "macro" : "micro";
      var n = q ? (DATA[ot] || []).reduce(function (acc, g) {
        return acc + g.items.filter(function (it) { return itemText(it).indexOf(q) !== -1; }).length;
      }, 0) : 0;
      other.hidden = !n;
      other.textContent = "Ещё " + n + " в разделе «" + (ot === "micro" ? "Микро" : "Макро") + "» — показать";
      other.dataset.tab = ot;
    }
    var empty = $("#empty");
    if (empty) {
      empty.hidden = shown > 0;
      empty.textContent = "Ничего не найдено по запросу «" + (searchInput ? searchInput.value.trim() : "") + "». Попробуйте номер препарата или одно слово.";
    }
  }
  if (searchInput) searchInput.addEventListener("input", applySearch);
  function indexText() {
    $all("[data-text]").forEach(function (el) { el.dataset.text = norm(el.textContent); });
  }

  /* ---------- вспомогательная разметка ---------- */
  function list(items, cls) {
    if (!items || !items.length) return "";
    return "<ul" + (cls ? ' class="' + cls + '"' : "") + ">" +
      items.map(function (x) { return "<li>" + x + "</li>"; }).join("") + "</ul>";
  }
  function remember(items) {
    if (!items || !items.length) return "";
    return '<div class="remember"><h4>Запомни</h4>' + list(items) + "</div>";
  }
  function mnemo(html) {
    if (!html) return "";
    return '<div class="mnemo"><h4>Мнемоника</h4><p>' + html + "</p></div>";
  }

  /* ---------- страница препаратов ---------- */
  var DATA = window.PREPARATY || { micro: [], macro: [] };
  var byId = {};
  ["micro", "macro"].forEach(function (k) {
    (DATA[k] || []).forEach(function (g) {
      g.items.forEach(function (it) { it.kind = k; byId[it.id] = it; });
    });
  });

  function photoSrc(p) { return base + p.src; }
  var textCache = {};
  function itemText(it) {
    if (!textCache[it.id]) {
      var d = document.createElement("div");
      d.innerHTML = [it.n, it.name, it.stain, it.tetrad, it.opis, (it.marks || []).join(" "), (it.zapomni || []).join(" "), it.mnemo, it.star].join(" ");
      textCache[it.id] = norm(d.textContent);
    }
    return textCache[it.id];
  }

  function prepCard(it) {
    var photos = it.photos || [];
    var ph = '<div class="prep-photos ' + it.kind + '">';
    if (photos.length) {
      ph += '<img class="main' + (photos[0].credit ? " contain" : "") + '" src="' + photoSrc(photos[0]) + '" alt="' + (photos[0].alt || it.name) + '" loading="lazy" data-i="0">';
      if (photos.length > 1) {
        ph += '<div class="thumbs">' + photos.map(function (p, i) {
          return '<img src="' + photoSrc(p) + '" alt="' + (p.alt || it.name) + '" loading="lazy" data-i="' + i + '">';
        }).join("") + "</div>";
      }
      photos.forEach(function (p) {
        if (p.credit) ph += '<div class="photo-credit"><span class="star">★</span> ' + p.credit + "</div>";
      });
    } else {
      ph += '<div class="nophoto">' + (it.nophoto || "Фото этого препарата пока нет") + "</div>";
    }
    ph += "</div>";

    var meta = "";
    if (it.stain) meta += "<div>Окраска: " + it.stain + "</div>";
    if (it.tetrad) meta += "<div>" + it.tetrad + "</div>";

    var body = "";
    if (it.opis) body += "<h4>Описание</h4>" + it.opis;
    if (it.marks && it.marks.length) {
      body += "<h4>Обозначить на рисунке</h4><ol class=\"marks\">" +
        it.marks.map(function (m) { return "<li>" + m + "</li>"; }).join("") + "</ol>";
    }
    body += remember(it.zapomni);
    body += mnemo(it.mnemo);
    if (it.star) body += '<div class="starblock">' + it.star + "</div>";

    return '<article class="prep" id="' + it.id + '" data-text>' + ph +
      '<div class="prep-text">' +
      '<div class="prep-head"><div class="slide-label">' + it.n + '</div>' +
      '<h3 class="name-hidden"><span class="name">' + it.name + "</span></h3></div>" +
      '<div class="meta">' + meta + "</div>" +
      '<button class="btn reveal" type="button">Показать ответ</button>' +
      '<div class="hideable">' + body + "</div>" +
      "</div></article>";
  }

  var tab = "micro";
  var shuffled = false;

  function renderPreps() {
    var out = $("#list");
    if (!out) return;
    var groups = DATA[tab] || [];
    var html = "";
    if (shuffled) {
      var all = [];
      groups.forEach(function (g) { all = all.concat(g.items); });
      for (var i = all.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var t = all[i]; all[i] = all[j]; all[j] = t;
      }
      html = '<section data-group><h2 class="group-title">Вперемешку <span class="count">' + all.length + "</span></h2>" + all.map(prepCard).join("") + "</section>";
    } else {
      html = groups.map(function (g) {
        return '<section data-group><h2 class="group-title">' + g.group + ' <span class="count">' + g.items.length + "</span></h2>" + g.items.map(prepCard).join("") + "</section>";
      }).join("");
    }
    out.innerHTML = html;
    $all(".switch [data-tab]").forEach(function (b) {
      if (b.dataset.tab === tab) b.setAttribute("aria-current", "page");
      else b.removeAttribute("aria-current");
    });
    indexText();
    applySearch();
  }

  function fromHash() {
    var h = decodeURIComponent(location.hash.replace("#", ""));
    if (h === "macro" || h.indexOf("ma-") === 0) tab = "macro";
    else tab = "micro";
    return h;
  }

  if (page === "preps") {
    var target = fromHash();
    setQuiz(load("quiz-preps") === "1");
    renderPreps();
    if (target && byId[target]) {
      var el = document.getElementById(target);
      if (el) setTimeout(function () { el.scrollIntoView(); }, 50);
    }
    $all(".switch [data-tab]").forEach(function (b) {
      b.addEventListener("click", function (e) {
        e.preventDefault();
        tab = b.dataset.tab;
        shuffled = false;
        history.replaceState(null, "", "#" + tab);
        renderPreps();
        window.scrollTo(0, 0);
      });
    });
    window.addEventListener("hashchange", function () {
      var h = fromHash();
      renderPreps();
      var el = h && document.getElementById(h);
      if (el) el.scrollIntoView();
    });
    var otherBtn = $("#other");
    if (otherBtn) otherBtn.addEventListener("click", function () {
      tab = otherBtn.dataset.tab;
      shuffled = false;
      history.replaceState(null, "", "#" + tab);
      renderPreps();
      window.scrollTo(0, 0);
    });
    if (shuffleBtn) shuffleBtn.addEventListener("click", function () {
      shuffled = true;
      $all(".open").forEach(function (el) { el.classList.remove("open"); });
      renderPreps();
      window.scrollTo(0, 0);
    });
  }

  /* ---------- страница вопросов ---------- */
  if (page === "voprosy") {
    var V = window.VOPROSY;
    var listEl = $("#list");
    var toc = $("#toc");
    if (!V || !V.length) {
      listEl.innerHTML = '<p class="empty">Ответы ещё не добавлены.</p>';
    } else {
      var total = 0;
      toc.innerHTML = V.map(function (s) {
        var first = s.items[0] ? s.items[0].n : "";
        var last = s.items.length ? s.items[s.items.length - 1].n : "";
        return '<a href="#' + s.id + '">' + s.title + ' <span class="n">' + first + "–" + last + "</span></a>";
      }).join("");
      listEl.innerHTML = V.map(function (s) {
        return '<section data-group id="' + s.id + '"><h2 class="group-title">' + s.title + ' <span class="count">' + s.items.length + "</span></h2>" +
          s.items.map(function (it) {
            total++;
            var chips = (it.preps || []).filter(function (id) { return byId[id]; }).map(function (id) {
              var p = byId[id];
              return '<a class="chip" href="' + base + "#" + id + '">' + (p.kind === "micro" ? "Микро" : "Макро") + " № " + p.n + " · " + p.name + "</a>";
            }).join("");
            return '<article class="qa" id="q-' + it.n + '" data-text>' +
              '<h3 class="qa-q"><span class="qa-n">' + it.n + "</span><span>" + it.q + "</span></h3>" +
              '<button class="btn reveal" type="button">Показать ответ</button>' +
              '<div class="qa-body">' + (it.a || "") + remember(it.zapomni) + mnemo(it.mnemo) +
              (it.src ? '<div class="src">Источник: ' + it.src + "</div>" : "") +
              (chips ? '<div class="chips">' + chips + "</div>" : "") +
              "</div></article>";
          }).join("") + "</section>";
      }).join("");
      var c = $("#qcount");
      if (c) c.textContent = total;
    }
    setQuiz(load("quiz-voprosy") === "1");
    indexText();
    applySearch();
    if (location.hash) {
      var t = document.getElementById(location.hash.slice(1));
      if (t) setTimeout(function () { t.scrollIntoView(); }, 50);
    }
  }

  /* ---------- лайтбокс с зумом ---------- */
  var lb = document.createElement("div");
  lb.className = "lb";
  lb.setAttribute("role", "dialog");
  lb.setAttribute("aria-modal", "true");
  lb.setAttribute("aria-label", "Просмотр фото");
  lb.innerHTML = '<img alt=""><button class="lb-close" type="button" aria-label="Закрыть"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg></button>' +
    '<div class="lb-bar"><button class="lb-prev" type="button" aria-label="Предыдущее фото"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg></button>' +
    '<span class="lb-cap"></span><button class="lb-next" type="button" aria-label="Следующее фото"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg></button></div>';
  document.body.appendChild(lb);
  var lbImg = $("img", lb), lbCap = $(".lb-cap", lb);
  var gallery = [], gi = 0, scale = 1, tx = 0, ty = 0;
  var pointers = {}, startDist = 0, startScale = 1, last = null, lastFocus = null;

  function applyT() {
    lbImg.style.transform = "translate(calc(-50% + " + tx + "px), calc(-50% + " + ty + "px)) scale(" + scale + ")";
  }
  function show(i) {
    gi = (i + gallery.length) % gallery.length;
    scale = 1; tx = 0; ty = 0;
    lbImg.src = gallery[gi].src;
    lbImg.alt = gallery[gi].alt;
    lbCap.textContent = gallery[gi].alt + (gallery.length > 1 ? " (" + (gi + 1) + " из " + gallery.length + ")" : "");
    $(".lb-prev", lb).style.visibility = gallery.length > 1 ? "visible" : "hidden";
    $(".lb-next", lb).style.visibility = gallery.length > 1 ? "visible" : "hidden";
    applyT();
  }
  function openLb(imgs, i) {
    gallery = imgs; lastFocus = document.activeElement;
    lb.classList.add("on"); document.body.style.overflow = "hidden";
    show(i); $(".lb-close", lb).focus();
  }
  function closeLb() {
    lb.classList.remove("on"); document.body.style.overflow = "";
    if (lastFocus) lastFocus.focus();
  }
  document.addEventListener("click", function (e) {
    var img = e.target.closest(".prep-photos img");
    if (!img) return;
    var wrap = img.closest(".prep-photos");
    var seen = {}, imgs = [];
    $all("img", wrap).forEach(function (im) {
      if (seen[im.dataset.i]) return;
      seen[im.dataset.i] = true;
      imgs[+im.dataset.i] = { src: im.src, alt: im.alt };
    });
    openLb(imgs.filter(Boolean), +img.dataset.i);
  });
  $(".lb-close", lb).addEventListener("click", closeLb);
  $(".lb-prev", lb).addEventListener("click", function () { show(gi - 1); });
  $(".lb-next", lb).addEventListener("click", function () { show(gi + 1); });
  lb.addEventListener("click", function (e) { if (e.target === lb) closeLb(); });
  document.addEventListener("keydown", function (e) {
    if (!lb.classList.contains("on")) return;
    if (e.key === "Escape") closeLb();
    if (e.key === "ArrowLeft") show(gi - 1);
    if (e.key === "ArrowRight") show(gi + 1);
    if (e.key === "+" || e.key === "=") { scale = Math.min(8, scale * 1.25); applyT(); }
    if (e.key === "-") { scale = Math.max(1, scale / 1.25); if (scale === 1) { tx = ty = 0; } applyT(); }
  });
  lb.addEventListener("wheel", function (e) {
    e.preventDefault();
    var f = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    var ns = Math.min(8, Math.max(1, scale * f));
    var cx = e.clientX - window.innerWidth / 2, cy = e.clientY - window.innerHeight / 2;
    tx = cx - (cx - tx) * (ns / scale); ty = cy - (cy - ty) * (ns / scale);
    scale = ns; if (scale === 1) { tx = ty = 0; }
    applyT();
  }, { passive: false });
  lbImg.addEventListener("dblclick", function (e) {
    if (scale > 1) { scale = 1; tx = ty = 0; }
    else {
      var cx = e.clientX - window.innerWidth / 2, cy = e.clientY - window.innerHeight / 2;
      scale = 2.5; tx = -cx * 1.5; ty = -cy * 1.5;
    }
    applyT();
  });
  lbImg.addEventListener("pointerdown", function (e) {
    lbImg.setPointerCapture(e.pointerId);
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    var ids = Object.keys(pointers);
    if (ids.length === 2) {
      var a = pointers[ids[0]], b = pointers[ids[1]];
      startDist = Math.hypot(a.x - b.x, a.y - b.y); startScale = scale;
    }
    last = { x: e.clientX, y: e.clientY };
  });
  lbImg.addEventListener("pointermove", function (e) {
    if (!pointers[e.pointerId]) return;
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    var ids = Object.keys(pointers);
    if (ids.length === 2) {
      var a = pointers[ids[0]], b = pointers[ids[1]];
      var d = Math.hypot(a.x - b.x, a.y - b.y);
      scale = Math.min(8, Math.max(1, startScale * d / startDist));
      if (scale === 1) { tx = ty = 0; }
      applyT();
    } else if (ids.length === 1 && scale > 1 && last) {
      tx += e.clientX - last.x; ty += e.clientY - last.y;
      last = { x: e.clientX, y: e.clientY };
      applyT();
    }
  });
  function up(e) { delete pointers[e.pointerId]; last = null; }
  lbImg.addEventListener("pointerup", up);
  lbImg.addEventListener("pointercancel", up);
})();
