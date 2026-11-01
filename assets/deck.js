(function () {
  "use strict";

  const body = document.body;
  const slides = Array.from(document.querySelectorAll(".slide"));
  const counter = document.getElementById("counter");
  const progress = document.querySelector(".progress");
  const world = document.getElementById("world");
  const mapEl = world ? world.querySelector(".map") : null;
  const mapImg = mapEl ? mapEl.querySelector("img") : null;
  let current = -1;
  let view = { l: 0, t: 0, z: 1 };
  let mapSrc = null;

  /* ---------- Map maths (equirectangular projection) ---------- */
  const frac = (lat, lon) => ({ x: (lon + 180) / 360, y: (90 - lat) / 180 });
  const mapSize = () => ({ w: window.innerWidth, h: window.innerWidth / 2 });
  const parseList = (spec) => (spec || "").split(";").map((s) => s.trim()).filter(Boolean).map((s) => s.split("|"));

  function focusOn(slide) {
    if (!mapEl) return;
    const size = mapSize();
    mapEl.style.width = size.w + "px";
    mapEl.style.height = size.h + "px";
    const f = slide.dataset.focus || "world";
    if (f === "world") {
      view = { z: 1, l: 0, t: Math.max(0, (window.innerHeight - size.h) / 2) + window.innerHeight * 0.04 };
    } else {
      const v = f.split("|").map(Number);
      const p = frac(v[0], v[1]);
      const z = Number.isFinite(v[2]) ? v[2] : 4;
      const ax = Number.isFinite(v[3]) ? v[3] : 0.7;
      const ay = Number.isFinite(v[4]) ? v[4] : 0.5;
      view = { z: z, l: ax * window.innerWidth - p.x * size.w * z, t: ay * window.innerHeight - p.y * size.h * z };
    }
    mapEl.style.setProperty("--z", view.z);
    mapEl.style.transform = "translate(" + view.l + "px," + view.t + "px) scale(" + view.z + ")";
    world.dataset.fade = slide.dataset.fade || "left";
    showPins(slide);
  }

  function project(lat, lon) {
    const size = mapSize();
    const p = frac(lat, lon);
    return { x: view.l + p.x * size.w * view.z, y: view.t + p.y * size.h * view.z };
  }

  function showPins(slide) {
    if (!mapEl) return;
    mapEl.querySelectorAll(".pin").forEach((p) => p.remove());
    parseList(slide.dataset.pins).forEach((item) => {
      const p = frac(Number(item[1]), Number(item[2]));
      const pin = document.createElement("div");
      pin.className = "pin";
      pin.style.left = p.x * 100 + "%";
      pin.style.top = p.y * 100 + "%";
      pin.innerHTML = '<div class="pin-inner"><span class="dot"></span><span class="lbl"></span></div>';
      pin.querySelector(".lbl").textContent = item[0];
      mapEl.appendChild(pin);
      requestAnimationFrame(() => requestAnimationFrame(() => pin.classList.add("on")));
    });
  }

  /* ---------- Animated arcs (closing slide) ---------- */
  function drawArcs(slide) {
    const svg = slide.querySelector("svg.arcs");
    if (!svg) return;
    svg.innerHTML = "";
    svg.setAttribute("viewBox", "0 0 " + window.innerWidth + " " + window.innerHeight);
    const home = parseList(body.dataset.home)[0];
    const targets = parseList(slide.dataset.arcs);
    if (!home || !targets.length) return;
    const ns = "http://www.w3.org/2000/svg";
    const from = project(Number(home[1]), Number(home[2]));

    function addPin(pt, name, cls) {
      const g = document.createElementNS(ns, "g");
      g.setAttribute("class", "arc-pin" + (cls ? " " + cls : ""));
      const c = document.createElementNS(ns, "circle");
      c.setAttribute("cx", pt.x); c.setAttribute("cy", pt.y); c.setAttribute("r", 7);
      const t = document.createElementNS(ns, "text");
      t.setAttribute("x", pt.x + 13); t.setAttribute("y", pt.y + 5);
      t.textContent = name;
      g.appendChild(c); g.appendChild(t); svg.appendChild(g);
    }

    targets.forEach((item, k) => {
      const to = project(Number(item[1]), Number(item[2]));
      const mx = (from.x + to.x) / 2;
      const my = (from.y + to.y) / 2 - Math.hypot(to.x - from.x, to.y - from.y) * 0.25;
      const path = document.createElementNS(ns, "path");
      path.setAttribute("d", "M" + from.x + "," + from.y + " Q" + mx + "," + my + " " + to.x + "," + to.y);
      svg.appendChild(path);
      const len = path.getTotalLength();
      path.style.strokeDasharray = len;
      path.style.strokeDashoffset = len;
      path.getBoundingClientRect();
      path.style.transition = "stroke-dashoffset 2.2s ease " + (1.4 + k * 0.3) + "s";
      path.style.strokeDashoffset = 0;
      addPin(to, item[0]);
    });
    addPin(from, home[0], "home");
  }

  /* ---------- Circular locator maps ---------- */
  function sizeLocators() {
    if (!mapSrc) return;
    document.querySelectorAll(".loc").forEach((loc) => {
      const el = loc.querySelector(".lmap");
      const d = el ? el.clientWidth : 0;
      if (!d) return;
      const z = Number(loc.dataset.zoom || 6);
      const p = frac(Number(loc.dataset.lat), Number(loc.dataset.lon));
      const bw = d * z, bh = bw / 2;
      el.style.backgroundImage = 'url("' + mapSrc + '")';
      el.style.backgroundSize = bw + "px " + bh + "px";
      el.style.backgroundPosition = (d / 2 - p.x * bw) + "px " + (d / 2 - p.y * bh) + "px";
    });
  }

  /* ---------- Navigation ---------- */
  function show(n) {
    n = Math.max(0, Math.min(slides.length - 1, n));
    if (n === current) return;
    current = n;
    slides.forEach((s, k) => s.classList.toggle("active", k === n));
    const s = slides[n];
    counter.textContent = (n + 1) + " / " + slides.length;
    if (progress) {
      progress.style.width = ((n + 1) / slides.length) * 100 + "%";
      const accent = getComputedStyle(s).getPropertyValue("--accent").trim();
      if (accent) progress.style.background = accent;
    }
    history.replaceState(null, "", "#" + (n + 1));
    stopSpeak();
    focusOn(s);
    drawArcs(s);
  }
  function fromHash() {
    const n = parseInt(location.hash.slice(1), 10);
    show(Number.isFinite(n) ? n - 1 : 0);
  }
  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen();
    } else if (document.exitFullscreen) {
      document.exitFullscreen();
    }
  }

  document.getElementById("prev").addEventListener("click", () => show(current - 1));
  document.getElementById("next").addEventListener("click", () => show(current + 1));
  document.getElementById("fs").addEventListener("click", toggleFullscreen);

  document.addEventListener("keydown", (e) => {
    const onControl = e.target.closest && e.target.closest("button, .card, a, summary, input");
    if (e.key === "ArrowRight" || e.key === "PageDown") show(current + 1);
    else if (e.key === "ArrowLeft" || e.key === "PageUp") show(current - 1);
    else if (e.key === " " && !onControl) { e.preventDefault(); show(current + 1); }
    else if (e.key === "Home") show(0);
    else if (e.key === "End") show(slides.length - 1);
    else if (e.key === "f" || e.key === "F") toggleFullscreen();
  });

  let touchX = null;
  document.addEventListener("touchstart", (e) => { touchX = e.changedTouches[0].clientX; }, { passive: true });
  document.addEventListener("touchend", (e) => {
    if (touchX === null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 60) show(current + (dx < 0 ? 1 : -1));
    touchX = null;
  });
  window.addEventListener("hashchange", fromHash);

  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const s = slides[current];
      focusOn(s); drawArcs(s); sizeLocators();
    }, 200);
  });

  /* ---------- Dot grids ---------- */
  document.querySelectorAll(".dotgrid").forEach((g) => {
    const total = Number(g.dataset.total || 100);
    const on = Number(g.dataset.on || 0);
    for (let k = 0; k < total; k++) {
      const i = document.createElement("i");
      i.style.setProperty("--k", k);
      if (k < on) i.className = "on";
      g.appendChild(i);
    }
  });

  /* ---------- Flip cards ---------- */
  document.querySelectorAll(".card").forEach((card) => {
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    const flip = () => card.classList.toggle("revealed");
    card.addEventListener("click", flip);
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); flip(); }
    });
  });

  /* ---------- Quizzes ---------- */
  document.querySelectorAll(".quiz").forEach((quiz) => {
    const feedback = quiz.querySelector(".feedback");
    quiz.querySelectorAll(".opt").forEach((btn) => {
      btn.addEventListener("click", () => {
        const right = btn.hasAttribute("data-correct");
        btn.classList.add(right ? "right" : "wrong");
        if (feedback) {
          feedback.textContent = right ? (quiz.dataset.right || "Correct!") : (quiz.dataset.wrong || "Not quite. Try again!");
        }
      });
    });
  });

  /* ---------- Speak-along ---------- */
  let speakTimer = null;
  let activeButton = null;
  function stopSpeak() {
    clearTimeout(speakTimer);
    document.querySelectorAll(".syl.on").forEach((s) => s.classList.remove("on"));
    if (activeButton) { activeButton.textContent = activeButton.dataset.label; activeButton = null; }
  }
  document.querySelectorAll(".speak").forEach((box) => {
    box.querySelectorAll(".line[data-syl]").forEach((line) => {
      line.textContent = "";
      line.dataset.syl.split(" ").forEach((word, w) => {
        if (w > 0) line.appendChild(document.createTextNode(" "));
        word.split("·").forEach((part) => {
          const span = document.createElement("span");
          span.className = "syl";
          span.textContent = part;
          line.appendChild(span);
        });
      });
    });
    const button = box.querySelector(".btn.play");
    if (!button) return;
    button.dataset.label = button.textContent;
    const tempo = parseInt(box.dataset.tempo || "600", 10);
    button.addEventListener("click", () => {
      if (activeButton === button) { stopSpeak(); return; }
      stopSpeak();
      activeButton = button;
      button.textContent = "■ Stop";
      const steps = [];
      box.querySelectorAll(".line[data-syl]").forEach((line) => {
        line.querySelectorAll(".syl").forEach((s) => steps.push(s));
        steps.push("pause");
      });
      const run = (k) => {
        document.querySelectorAll(".syl.on").forEach((s) => s.classList.remove("on"));
        if (k >= steps.length) { stopSpeak(); return; }
        if (steps[k] === "pause") { speakTimer = setTimeout(() => run(k + 1), tempo * 2); return; }
        steps[k].classList.add("on");
        speakTimer = setTimeout(() => run(k + 1), tempo);
      };
      run(0);
    });
  });

  /* ---------- Images from Wikimedia Commons, with automatic credits ---------- */
  const plain = (html) => new DOMParser().parseFromString(html || "", "text/html").body.textContent.trim();

  async function commonsInfo(file, width) {
    const u = new URL("https://commons.wikimedia.org/w/api.php");
    const params = {
      action: "query", format: "json", origin: "*", prop: "imageinfo",
      iiprop: "url|extmetadata", iiurlwidth: String(width || 1000), titles: "File:" + file
    };
    Object.keys(params).forEach((k) => u.searchParams.set(k, params[k]));
    const data = await (await fetch(u)).json();
    const page = Object.values(data.query.pages)[0];
    if (!page.imageinfo) return null;
    const info = page.imageinfo[0];
    const meta = info.extmetadata || {};
    return {
      src: info.thumburl || info.url,
      page: info.descriptionurl,
      title: file.replace(/_/g, " "),
      artist: plain(meta.Artist && meta.Artist.value) || "Unknown author",
      license: plain(meta.LicenseShortName && meta.LicenseShortName.value) || "see file page"
    };
  }

  async function wikiLeadImage(article) {
    const u = new URL("https://en.wikipedia.org/w/api.php");
    const params = { action: "query", format: "json", origin: "*", prop: "pageimages", piprop: "name", redirects: "1", titles: article };
    Object.keys(params).forEach((k) => u.searchParams.set(k, params[k]));
    const data = await (await fetch(u)).json();
    const page = Object.values(data.query.pages)[0];
    return page.pageimage || null;
  }

  async function loadImages() {
    const credits = [];
    const seen = new Set();
    const addCredit = (info) => { if (!seen.has(info.page)) { seen.add(info.page); credits.push(info); } };

    const mapFile = body.dataset.map;
    const mapJob = mapFile ? commonsInfo(mapFile, 6000).catch(() => null) : Promise.resolve(null);

    const imgs = Array.from(document.querySelectorAll("img[data-file], img[data-wiki]"));
    const results = await Promise.all(imgs.map(async (img) => {
      try {
        const file = img.dataset.file || await wikiLeadImage(img.dataset.wiki);
        return file ? await commonsInfo(file, img.dataset.width || 1000) : null;
      } catch (err) { return null; }
    }));

    imgs.forEach((img, k) => {
      const info = results[k];
      if (!info) {
        const box = document.createElement("div");
        box.className = "img-missing";
        box.textContent = "Image unavailable: " + (img.dataset.file || img.dataset.wiki);
        img.replaceWith(box);
        return;
      }
      img.src = info.src;
      if (!img.alt) img.alt = info.title;
      addCredit(info);
    });

    const mapInfo = await mapJob;
    if (mapInfo) {
      mapSrc = mapInfo.src;
      if (mapImg) mapImg.src = mapSrc;
      addCredit(mapInfo);
      sizeLocators();
    }

    const list = document.getElementById("credits");
    if (!list) return;
    credits.forEach((c) => {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = c.page; a.target = "_blank"; a.rel = "noopener";
      a.textContent = c.title;
      li.appendChild(a);
      li.appendChild(document.createTextNode(" by " + c.artist + ", " + c.license));
      list.appendChild(li);
    });
  }

  fromHash();
  loadImages();
})();
