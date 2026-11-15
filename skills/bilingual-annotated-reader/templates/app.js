/* ============================================================
   交互层：句级联动 / 悬停卡片 / 图切换与放大 / 模式与字号
   ============================================================ */
(function () {
  "use strict";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ---------------- 阅读进度 ---------------- */
  var bar = $("#progress");
  function onScroll() {
    var h = document.documentElement;
    var max = h.scrollHeight - h.clientHeight;
    bar.style.width = (max > 0 ? (h.scrollTop / max) * 100 : 0) + "%";
    hideCard();
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---------------- 句级联动 ---------------- */
  var reader = $("#reader");
  var current = null;   // 当前悬停的 data-k
  var pinned = null;    // 点击钉住的 data-k

  function pairsOf(k) {
    return $$('.s[data-k="' + k + '"]', reader);
  }
  function paint(k) {
    $$(".s.hl", reader).forEach(function (el) {
      el.classList.remove("hl");
      var row = el.closest(".row");
      if (row) row.classList.remove("focus");
    });
    if (!k) return;
    var ps = pairsOf(k);
    if (!ps.length) return;
    ps.forEach(function (el) {
      el.classList.add("hl");
      var row = el.closest(".row");
      if (row) row.classList.add("focus");
    });
  }
  function pin(k) {
    $$(".s.pin", reader).forEach(function (el) { el.classList.remove("pin"); });
    if (k) pairsOf(k).forEach(function (el) { el.classList.add("pin"); });
  }

  if (reader) {
    reader.addEventListener("pointerover", function (e) {
      var s = e.target.closest ? e.target.closest(".s") : null;
      if (!s) return;
      var k = s.getAttribute("data-k");
      if (k === current) return;
      current = k;
      paint(k);
    });
    reader.addEventListener("pointerout", function (e) {
      var s = e.target.closest ? e.target.closest(".s") : null;
      if (!s) return;
      if (e.relatedTarget && s.contains(e.relatedTarget)) return;
      current = null;
      paint(pinned);
    });
    reader.addEventListener("click", function (e) {
      var s = e.target.closest ? e.target.closest(".s") : null;
      if (!s) return;
      if (e.target.closest("a")) return;              // 点链接不钉住
      var k = s.getAttribute("data-k");
      if (pinned === k) { pinned = null; paint(current); }
      else { pinned = k; paint(k); }
      pin(pinned);
    });
  }

  /* ---------------- 悬停卡片 ---------------- */
  var card = $("#card");
  var CARD_SEL = "[data-link],[data-term],[data-note],[data-typo]";
  var chipTier = { "必读": "", "背景": "", "可选": "" };

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function buildCard(el) {
    var C = window.CARDS || {};
    var html = "";
    var link = el.getAttribute("data-link");
    var term = el.getAttribute("data-term");
    var note = el.getAttribute("data-note");
    var typo = el.getAttribute("data-typo");

    if (link && C.links && C.links[link]) {
      var L = C.links[link];
      var cls = L.tier === "必读" ? " must" : (L.tier === "背景" ? " bg" : "");
      html += '<div class="k">延伸阅读 · ' + esc(link) +
        '<span class="chip' + cls + '">' + esc(L.tier || "可选") + '</span>' +
        (L.order ? '<span class="chip">建议 ' + esc(L.order) + '</span>' : "") + "</div>";
      html += "<h4>" + esc(L.title_zh || L.title_en || L.url) + "</h4>";
      html += '<p class="url">' + esc(L.site || "") + "</p>";
      if (L.what_zh) html += '<p class="body"><b>这是什么：</b>' + esc(L.what_zh) + "</p>";
      if (L.why_zh) html += '<p class="body"><b>为什么值得点：</b>' + esc(L.why_zh) + "</p>";
      html += '<div class="foot"><i>↗</i> 点击正文里的链接会在新标签页打开原文</div>';
    } else if (term && C.terms && C.terms[term]) {
      var T = C.terms[term];
      html += '<div class="k">术语<span class="chip">TERM</span></div>';
      html += "<h4>" + esc(T.en) + (T.zh ? " · " + esc(T.zh) : "") + "</h4>";
      html += '<p class="body">' + esc(T.def_zh) + "</p>";
      if (T.analogy_zh) html += '<p class="body"><b>打个比方：</b>' + esc(T.analogy_zh) + "</p>";
    } else if (note && C.notes && C.notes[note]) {
      var N = C.notes[note];
      html += '<div class="k">译者注<span class="chip">NOTE</span></div>';
      html += "<h4>" + esc(N.title_zh) + "</h4>";
      html += '<p class="body">' + esc(N.body_zh) + "</p>";
    } else if (typo !== null && typo !== undefined && C.typos && C.typos[typo]) {
      var Y = C.typos[typo];
      html += '<div class="k">原文如此<span class="chip">TYPO</span></div>';
      html += '<p class="url">' + esc(Y.quote_en) + "</p>";
      html += '<p class="body">' + esc(Y.body_zh) + "</p>";
    } else { return false; }
    card.innerHTML = html;
    return true;
  }

  function placeCard(el) {
    card.classList.add("show");
    var r = el.getBoundingClientRect();
    var cw = card.offsetWidth, ch = card.offsetHeight;
    var sx = window.pageXOffset || 0, sy = window.pageYOffset || 0;
    var vx = r.right + 14;
    if (vx + cw > window.innerWidth - 12) vx = r.left - cw - 14;
    if (vx < 12) vx = Math.max(12, window.innerWidth - cw - 12);
    var vy = r.top + r.height / 2 - ch / 2;
    vy = Math.max(12, Math.min(vy, window.innerHeight - ch - 12));
    card.style.left = Math.round(vx + sx) + "px";
    card.style.top = Math.round(vy + sy) + "px";
  }

  var cardTimer = null;
  function hideCard() {
    clearTimeout(cardTimer);
    if (!card) return;
    if (card.classList.contains("show")) card.classList.remove("show");
  }
  function showCard(el) {
    clearTimeout(cardTimer);
    if (!buildCard(el)) return;
    card.classList.remove("show");
    card.style.left = "-9999px"; card.style.top = "-9999px";
    cardTimer = setTimeout(function () { placeCard(el); }, 70);
  }

  document.addEventListener("pointerover", function (e) {
    var el = e.target.closest ? e.target.closest(CARD_SEL) : null;
    if (!el) return;
    if (el === card) return;
    showCard(el);
  });
  document.addEventListener("pointerout", function (e) {
    var el = e.target.closest ? e.target.closest(CARD_SEL) : null;
    if (!el) return;
    if (e.relatedTarget && el.contains(e.relatedTarget)) return;
    hideCard();
  });

  /* ---------------- 图片：静帧/动图、放大 ---------------- */
  $$(".fig").forEach(function (fig) {
    var gif = $("img.anim", fig), still = $("img.still", fig);
    var bStill = $('[data-act="still"]', fig), bAnim = $('[data-act="anim"]', fig);
    var cap = fig.getAttribute("data-cap") || "";
    if (gif && still && bStill && bAnim) {
      bStill.classList.add("on");
      bStill.addEventListener("click", function (ev) {
        ev.stopPropagation();
        still.hidden = false; gif.hidden = true;
        bStill.classList.add("on"); bAnim.classList.remove("on");
      });
      bAnim.addEventListener("click", function (ev) {
        ev.stopPropagation();
        still.hidden = true; gif.hidden = false;
        bAnim.classList.add("on"); bStill.classList.remove("on");
      });
    }
    var media = $(".fig-media", fig);
    if (media) {
      media.addEventListener("click", function (ev) {
        if (ev.target.closest("a,button")) return;
        var img = $("img:not([hidden])", media);
        if (!img) return;
        openLB(img.getAttribute("src"), cap);
      });
    }
  });

  var lb = $("#lb"), lbImg = $("#lbImg"), lbCap = $("#lbCap");
  function openLB(src, cap) {
    lbImg.src = src;
    lbCap.textContent = cap || "";
    lb.classList.add("show");
    lb.setAttribute("aria-hidden", "false");
    $(".lb-scroll", lb).scrollTop = 0;
  }
  function closeLB() {
    lb.classList.remove("show");
    lb.setAttribute("aria-hidden", "true");
    setTimeout(function () { lbImg.removeAttribute("src"); }, 200);
  }
  $("#lbClose").addEventListener("click", closeLB);
  lb.addEventListener("click", function (e) { if (e.target === lb || e.target.classList.contains("lb-scroll")) closeLB(); });

  /* ---------------- 内嵌视频（demo）：点播才把 base64 解成 Blob URL ---------------- */
  function initInlineVideos() {
    $$(".video-play").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-video");
        var src = btn.getAttribute("data-src");
        var holder = document.getElementById("vid-" + id);
        var url;
        if (src) {
          url = src;
        } else if (holder) {
          var b64 = holder.textContent.replace(/\s/g, "");
          var bin = atob(b64), n = bin.length, u8 = new Uint8Array(n);
          for (var i = 0; i < n; i++) u8[i] = bin.charCodeAt(i);
          url = URL.createObjectURL(new Blob([u8], { type: "video/mp4" }));
        } else return;
        var fig = btn.closest("figure");
        var media = btn.parentNode;
        var v = document.createElement("video");
        v.className = "fig-video";
        v.controls = true;
        v.autoplay = true;
        v.playsInline = true;
        v.setAttribute("playsinline", "");
        v.src = url;
        media.insertBefore(v, btn);
        var poster = media.querySelector(".video-poster");
        if (poster) poster.remove();
        btn.remove();
        if (holder) holder.remove();
        v.play().catch(function () {});
      });
    });
  }
  initInlineVideos();

  /* ---------------- 模式 / 字号 ---------------- */
  function setMode(m) {
    document.body.setAttribute("data-mode", m);
    $$("#modeSeg button").forEach(function (b) {
      b.classList.toggle("on", b.getAttribute("data-mode") === m);
    });
    try { localStorage.setItem("mode", m); } catch (e) {}
  }
  $$("#modeSeg button").forEach(function (b) {
    b.addEventListener("click", function () { setMode(b.getAttribute("data-mode")); });
  });
  try {
    var savedMode = localStorage.getItem("mode");
    if (savedMode) setMode(savedMode);
  } catch (e) {}

  var BASE = { en: 18.5, zh: 16.5 };
  var scale = 1;
  try { scale = parseFloat(localStorage.getItem("scale")) || 1; } catch (e) {}
  function applyScale() {
    scale = Math.max(0.85, Math.min(1.32, scale));
    document.documentElement.style.setProperty("--fs-en", (BASE.en * scale).toFixed(2) + "px");
    document.documentElement.style.setProperty("--fs-zh", (BASE.zh * scale).toFixed(2) + "px");
    try { localStorage.setItem("scale", String(scale)); } catch (e) {}
  }
  applyScale();
  $("#fPlus").addEventListener("click", function () { scale += 0.06; applyScale(); });
  $("#fMinus").addEventListener("click", function () { scale -= 0.06; applyScale(); });

  /* ---------------- 目录 ---------------- */
  var toc = $("#toc");
  function openTOC() { toc.classList.add("show"); toc.setAttribute("aria-hidden", "false"); }
  function closeTOC() { toc.classList.remove("show"); toc.setAttribute("aria-hidden", "true"); }
  $("#tocBtn").addEventListener("click", openTOC);
  toc.addEventListener("click", function (e) {
    if (e.target.hasAttribute("data-close") || e.target.tagName === "A") closeTOC();
  });

  /* ---------------- 键盘 ---------------- */
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { closeLB(); closeTOC(); hideCard(); }
  });
  window.addEventListener("resize", hideCard);
})();
