(function () {
  "use strict";

  var root = document.documentElement;
  var page = document.body.dataset.page;
  var base = document.body.dataset.base || "";

  /* ---------- хранилище (может быть недоступно) ---------- */
  // patanV1 и patanV2 живут на одном домене — свои ключи, чтобы настройки не смешивались
  function load(key) { try { return localStorage.getItem("patanV2-" + key); } catch (e) { return null; } }
  function save(key, val) { try { localStorage.setItem("patanV2-" + key, val); } catch (e) {} }

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
    // кнопка «Перемешать» пропадает вместе с самопроверкой — возвращаем обычный порядок
    if (!on && shuffled) { shuffled = false; renderPreps(); }
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
  // запрос из одних цифр — это номер препарата или вопроса, ищем его точно, а не «5» внутри «57»
  function matches(text, n, q) {
    if (!q) return true;
    if (/^\d+$/.test(q)) return String(n) === q;
    return text.indexOf(q) !== -1;
  }
  function applySearch() {
    var q = norm(searchInput ? searchInput.value.trim() : "").replace(/^№\s*/, "");
    var shown = 0;
    $all("[data-text]").forEach(function (el) {
      var ok = matches(el.dataset.text, el.dataset.n, q);
      el.hidden = !ok;
      if (ok) shown++;
    });
    $all("[data-group]").forEach(function (g) {
      var any = $all("[data-text]", g).some(function (el) { return !el.hidden; });
      g.hidden = !any;
      var link = g.id && $('#toc a[href="#' + g.id + '"]');
      if (link) link.hidden = !any;
    });
    var other = $("#other");
    if (other && page === "preps") {
      var ot = tab === "micro" ? "macro" : "micro";
      var n = q ? (DATA[ot] || []).reduce(function (acc, g) {
        return acc + g.items.filter(function (it) { return matches(itemText(it), it.n, q); }).length;
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
  // фото из атласов вписываем целиком, свои — кадрируем квадратом
  function contain(p) { return !!p.credit; }
  var textCache = {};
  function itemText(it) {
    if (!textCache[it.id]) {
      var d = document.createElement("div");
      d.innerHTML = [it.n, it.name, it.stain, it.opis, (it.marks || []).join(" "), (it.zapomni || []).join(" "), it.mnemo, it.star].join(" ");
      textCache[it.id] = norm(d.textContent);
    }
    return textCache[it.id];
  }

  // o.secret: для флеш-карточек — в alt нет названия, фото грузятся сразу; o.notes: пояснения под фото; o.photos: свой набор фото
  function photoBlock(it, o) {
    o = o || {};
    var secret = o.secret, photos = o.photos || it.photos || [];
    var ph = '<div class="prep-photos ' + it.kind + '">';
    var alt = function (p) { return secret ? "Фото препарата" : (p.alt || it.name); };
    var lazy = secret ? "" : ' loading="lazy"';
    if (photos.length) {
      ph += '<img class="main' + (contain(photos[0]) ? " contain" : "") + '" src="' + photoSrc(photos[0]) + '" alt="' + alt(photos[0]) + '"' + lazy + ' draggable="false" data-i="0">';
      if (photos.length > 1) {
        ph += '<div class="thumbs">' + photos.map(function (p, i) {
          return '<img' + (i ? "" : ' class="cur"') + ' src="' + photoSrc(p) + '" alt="' + alt(p) + '"' + lazy + ' draggable="false" data-i="' + i + '">';
        }).join("") + "</div>";
      }
      // под фото — только пояснения; кто автор и какая лицензия — в списке «Источники фото» внизу страницы
      if (o.notes) ph += photoNotes(it);
    } else {
      ph += '<div class="nophoto"><span class="full">' + (it.nophoto || "Фото этого препарата пока нет") + '</span><span class="short">Фото нет</span></div>';
    }
    return ph + "</div>";
  }
  function photoNotes(it) {
    return (it.photos || []).map(function (p) {
      return p.note ? '<div class="photo-note"><span class="star">★</span> ' + p.note + "</div>" : "";
    }).join("");
  }

  function prepCard(it) {
    var ph = photoBlock(it, { notes: true });

    var meta = "";
    if (it.stain) meta += "<div>Окраска: " + it.stain + "</div>";

    var body = "";
    if (it.opis) body += "<h4>Описание</h4>" + it.opis;
    if (it.marks && it.marks.length) {
      body += "<h4>Обозначить на рисунке</h4><ol class=\"marks\">" +
        it.marks.map(function (m) { return "<li>" + m + "</li>"; }).join("") + "</ol>";
    }
    body += remember(it.zapomni);
    body += mnemo(it.mnemo);
    if (it.star) body += '<div class="starblock">' + it.star + "</div>";

    return '<article class="prep" id="' + it.id + '" data-text data-n="' + it.n + '">' + ph +
      '<div class="prep-text">' +
      '<div class="prep-head"><div class="slide-label">' + it.n + '</div>' +
      '<h3 class="name-hidden"><span class="name">' + it.name + "</span></h3></div>" +
      (meta ? '<div class="meta">' + meta + "</div>" : "") +
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
    renderCredits();
  }

  /* ---------- источники фото: одним списком внизу, без названий препаратов (не подсказка в самопроверке) ---------- */
  function renderCredits() {
    var rows = [];
    ["micro", "macro"].forEach(function (k) {
      (DATA[k] || []).forEach(function (g) {
        g.items.forEach(function (it) {
          var seen = {}, cr = [];
          (it.photos || []).forEach(function (p) {
            if (p.credit && !seen[p.credit]) { seen[p.credit] = true; cr.push(p.credit); }
          });
          if (cr.length) rows.push("<li>" + (k === "micro" ? "Микро" : "Макро") + " № " + it.n + ": " + cr.join(" ") + "</li>");
        });
      });
    });
    if (!rows.length) return;
    var d = document.createElement("details");
    d.className = "credits";
    d.id = "credits";
    d.innerHTML = "<summary>Источники фото</summary><ul>" + rows.join("") + "</ul>";
    $("main").appendChild(d);
  }

  /* ---------- свайп по главному фото в карточке ---------- */
  var swipeStart = null, swipedAt = 0;
  function setMain(img, k) {
    var holder = img.closest(".prep, .fc");
    var it = byId[holder.dataset.id || holder.id];
    var photos = holder.photos || (it && it.photos) || [];
    if (photos.length < 2) return;
    k = (k + photos.length) % photos.length;
    img.src = photoSrc(photos[k]);
    if (!holder.classList.contains("fc") || holder.classList.contains("flipped")) img.alt = photos[k].alt || it.name;
    img.dataset.i = k;
    img.classList.toggle("contain", contain(photos[k]));
    $all(".thumbs img", img.parentNode).forEach(function (t) { t.classList.toggle("cur", +t.dataset.i === k); });
  }
  document.addEventListener("pointerdown", function (e) {
    var img = e.target.closest && e.target.closest(".prep-photos img.main");
    swipeStart = img ? { img: img, x: e.clientX, y: e.clientY } : null;
  });
  document.addEventListener("pointerup", function (e) {
    var s = swipeStart;
    swipeStart = null;
    if (!s) return;
    var dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    swipedAt = Date.now();
    setMain(s.img, +s.img.dataset.i + (dx < 0 ? 1 : -1));
  });
  document.addEventListener("pointercancel", function () { swipeStart = null; });

  /* ---------- флеш-карточки: фото → вспомнить название → «Знаю» / «Не знаю» ---------- */
  if (page === "cards") {
    var fcEl = $("#fc"), fcCount = $("#fc-count"), fcBar = $("#fc-bar");
    // в колоду идут только препараты с фото
    var deckIds = { micro: [], macro: [] };
    ["micro", "macro"].forEach(function (k) {
      (DATA[k] || []).forEach(function (g) {
        g.items.forEach(function (it) { if ((it.photos || []).length) deckIds[k].push(it.id); });
      });
    });
    deckIds.all = deckIds.micro.concat(deckIds.macro);
    $all("[data-deck]").forEach(function (b) {
      var c = $(".count", b);
      if (c) c.textContent = deckIds[b.dataset.deck].length;
    });

    var st = null;
    try { st = JSON.parse(load("cards") || "null"); } catch (e) { st = null; }
    // сохранённая колода годится, только если все её карточки ещё есть на сайте
    if (!st || !deckIds[st.deck] || !st.queue || !st.queue.every(function (id) { return byId[id]; })) st = null;

    function shuffle(a) {
      a = a.slice();
      for (var i = a.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var t = a[i]; a[i] = a[j]; a[j] = t;
      }
      return a;
    }
    function startDeck(deck, ids) {
      ids = shuffle(ids || deckIds[deck]);
      st = { deck: deck, queue: ids, wrong: [], total: ids.length };
      saveState();
      renderCard();
    }
    function saveState() { save("cards", JSON.stringify(st)); }

    function renderCard() {
      $all("[data-deck]").forEach(function (b) { b.setAttribute("aria-pressed", b.dataset.deck === st.deck ? "true" : "false"); });
      var left = st.queue.length, done = st.total - left;
      fcCount.textContent = left ? "Осталось " + left + " из " + st.total : "Готово";
      fcBar.style.width = (st.total ? Math.round(done / st.total * 100) : 0) + "%";
      if (!left) {
        var right = st.total - st.wrong.length;
        fcEl.innerHTML = '<div class="fc fc-done"><h2>Колода пройдена</h2>' +
          "<p>С первого раза узнали " + right + " из " + st.total + ".</p>" +
          '<div class="fc-actions">' +
          (st.wrong.length ? '<button class="btn primary" type="button" data-act="wrong">Повторить ошибки (' + st.wrong.length + ")</button>" : "") +
          '<button class="btn' + (st.wrong.length ? "" : " primary") + '" type="button" data-act="again">Пройти заново</button></div></div>';
        return;
      }
      var it = byId[st.queue[0]];
      var front = frontPhotos(it);
      fcEl.innerHTML = '<article class="fc" data-id="' + it.id + '">' + photoBlock(it, { secret: true, photos: front }) +
        '<div class="fc-back" hidden>' +
        '<div class="fc-name"><span class="slide-label">' + it.n + '</span><h2>' + it.name + "</h2></div>" +
        '<div class="fc-kind">' + (it.kind === "micro" ? "Микропрепарат" : "Макропрепарат") + (it.stain ? " · окраска: " + it.stain : "") + "</div>" +
        photoNotes(it) +
        '<a class="fc-more" href="' + base + "#" + it.id + '">Описание препарата</a></div>' +
        '<div class="fc-actions">' +
        '<button class="btn primary fc-flip" type="button" data-act="flip">Показать название</button>' +
        '<button class="btn fc-ans" type="button" data-act="no" hidden>Не знаю</button>' +
        '<button class="btn primary fc-ans" type="button" data-act="yes" hidden>Знаю</button>' +
        "</div></article>";
      $(".fc", fcEl).photos = front;
    }
    // до ответа: банки с закрашенными этикетками (img/macro-fc), у микро — без фото стекла с номером (*-s.jpg)
    function frontPhotos(it) {
      var ph = (it.photos || []).filter(function (p) { return !/-s\.jpg$/.test(p.src); });
      if (!ph.length) ph = it.photos || [];
      return ph.map(function (p) {
        return it.kind === "macro" ? { src: p.src.replace("img/macro/", "img/macro-fc/"), alt: p.alt, credit: p.credit } : p;
      });
    }
    function flip() {
      var card = $(".fc[data-id]", fcEl);
      if (!card || card.classList.contains("flipped")) return;
      var it = byId[card.dataset.id];
      card.classList.add("flipped");
      $(".fc-back", card).hidden = false;
      $(".fc-flip", card).hidden = true;
      $all(".fc-ans", card).forEach(function (b) { b.hidden = false; });
      // после ответа — все фото как есть: с этикетками и фото стекла
      var box = document.createElement("div");
      box.innerHTML = photoBlock(it);
      card.replaceChild(box.firstChild, $(".prep-photos", card));
      card.photos = null;
      $('[data-act="yes"]', card).focus({ preventScroll: true });
    }
    function answer(knew) {
      var id = st.queue.shift();
      if (!knew) {
        if (st.wrong.indexOf(id) === -1) st.wrong.push(id);
        // забытая карточка вернётся через пару других
        st.queue.splice(Math.min(3, st.queue.length), 0, id);
      }
      saveState();
      renderCard();
      var top = fcEl.getBoundingClientRect().top;
      if (top < 0) window.scrollBy(0, top - 12);
    }
    fcEl.addEventListener("click", function (e) {
      var b = e.target.closest("[data-act]");
      if (!b) return;
      var a = b.dataset.act;
      if (a === "flip") flip();
      else if (a === "yes" || a === "no") answer(a === "yes");
      else if (a === "wrong") startDeck(st.deck, st.wrong);
      else if (a === "again") startDeck(st.deck);
    });
    $all("[data-deck]").forEach(function (b) {
      b.addEventListener("click", function () { startDeck(b.dataset.deck); });
    });
    var restart = $("#fc-restart");
    if (restart) restart.addEventListener("click", function () { startDeck(st.deck); });
    document.addEventListener("keydown", function (e) {
      if (document.querySelector(".lb.on") || (e.target.closest && e.target.closest("input, textarea"))) return;
      var card = $(".fc[data-id]", fcEl);
      if (!card) return;
      var flipped = card.classList.contains("flipped");
      if (!flipped && (e.key === " " || e.key === "Enter")) { e.preventDefault(); flip(); }
      else if (flipped && (e.key === "ArrowRight" || e.key === "2")) answer(true);
      else if (flipped && (e.key === "ArrowLeft" || e.key === "1")) answer(false);
    });

    if (st) renderCard();
    else startDeck("micro");
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
            return '<article class="qa" id="q-' + it.n + '" data-text data-n="' + it.n + '">' +
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
      // для телефона: каждой ячейке — название её колонки (см. style.css)
      $all(".qa-body table").forEach(function (t) {
        var heads = $all("thead th", t).map(function (th) { return th.textContent.trim(); });
        $all("tbody tr", t).forEach(function (tr) {
          $all("td", tr).forEach(function (td, i) { if (heads[i]) td.dataset.label = heads[i]; });
        });
      });
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
    lbImg.alt = gallery.secret ? "Фото препарата" : gallery[gi].alt;
    // в самопроверке подпись с названием выдала бы ответ
    var pos = gallery.length > 1 ? (gi + 1) + " из " + gallery.length : "";
    if (gallery.secret) lbCap.textContent = "Фото" + (pos ? " " + pos : "");
    else lbCap.textContent = gallery[gi].alt + (pos ? " (" + pos + ")" : "");
    $(".lb-prev", lb).style.visibility = gallery.length > 1 ? "visible" : "hidden";
    $(".lb-next", lb).style.visibility = gallery.length > 1 ? "visible" : "hidden";
    fitBar();
    applyT();
  }
  // подпись бывает в 1–3 строки — фото не должно заходить под нижнюю панель
  function fitBar() { lb.style.setProperty("--bar", $(".lb-bar", lb).offsetHeight + "px"); }
  window.addEventListener("resize", function () { if (lb.classList.contains("on")) fitBar(); });
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
    if (!img || Date.now() - swipedAt < 400) return; // это был свайп, а не нажатие
    var wrap = img.closest(".prep-photos");
    var seen = {}, imgs = [];
    $all("img", wrap).forEach(function (im) {
      if (seen[im.dataset.i]) return;
      seen[im.dataset.i] = true;
      imgs[+im.dataset.i] = { src: im.src, alt: im.alt };
    });
    imgs = imgs.filter(Boolean);
    var holder = img.closest(".prep, .fc");
    imgs.secret = holder.classList.contains("fc") ? !holder.classList.contains("flipped")
      : document.body.classList.contains("quiz") && !holder.classList.contains("open");
    openLb(imgs, +img.dataset.i);
  });
  $(".lb-close", lb).addEventListener("click", closeLb);
  $(".lb-prev", lb).addEventListener("click", function () { show(gi - 1); });
  $(".lb-next", lb).addEventListener("click", function () { show(gi + 1); });
  lb.addEventListener("click", function (e) { if (e.target === lb && Date.now() - swipedAt > 400) closeLb(); });
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
  // свайп вбок листает фото (и по самому фото, и по тёмному фону вокруг); при увеличении палец двигает фото
  var lbSwipe = null;
  lb.addEventListener("pointerdown", function (e) {
    if (e.target.closest("button")) return;
    if (e.target === lbImg) lbImg.setPointerCapture(e.pointerId);
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    var ids = Object.keys(pointers);
    if (ids.length === 2) {
      var a = pointers[ids[0]], b = pointers[ids[1]];
      startDist = Math.hypot(a.x - b.x, a.y - b.y); startScale = scale;
      lbSwipe = null;
    } else {
      lbSwipe = scale === 1 && gallery.length > 1 ? { x: e.clientX, y: e.clientY } : null;
    }
    last = { x: e.clientX, y: e.clientY };
  });
  lb.addEventListener("pointermove", function (e) {
    if (!pointers[e.pointerId]) return;
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    var ids = Object.keys(pointers);
    if (ids.length === 2) {
      var a = pointers[ids[0]], b = pointers[ids[1]];
      var d = Math.hypot(a.x - b.x, a.y - b.y);
      scale = Math.min(8, Math.max(1, startScale * d / startDist));
      if (scale === 1) { tx = ty = 0; }
      applyT();
    } else if (lbSwipe) {
      tx = e.clientX - lbSwipe.x; // фото едет за пальцем
      applyT();
    } else if (ids.length === 1 && scale > 1 && last) {
      tx += e.clientX - last.x; ty += e.clientY - last.y;
      last = { x: e.clientX, y: e.clientY };
      applyT();
    }
  });
  function up(e) {
    if (!pointers[e.pointerId]) return;
    delete pointers[e.pointerId]; last = null;
    var s = lbSwipe;
    lbSwipe = null;
    if (!s) return;
    var dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (Math.abs(dx) > 10) swipedAt = Date.now();
    if (e.type === "pointerup" && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) show(gi + (dx < 0 ? 1 : -1));
    else { tx = 0; applyT(); }
  }
  lb.addEventListener("pointerup", up);
  lb.addEventListener("pointercancel", up);
})();
