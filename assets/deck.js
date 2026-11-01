(function () {
  "use strict";

  /* ---------- Navigation ---------- */
  const slides = Array.from(document.querySelectorAll(".slide"));
  const counter = document.getElementById("counter");
  let current = 0;

  function show(n) {
    current = Math.max(0, Math.min(slides.length - 1, n));
    slides.forEach((s, k) => s.classList.toggle("active", k === current));
    counter.textContent = (current + 1) + " / " + slides.length;
    history.replaceState(null, "", "#" + (current + 1));
    stopSpeak();
  }
  function fromHash() {
    const n = parseInt(location.hash.slice(1), 10);
    show(Number.isFinite(n) ? n - 1 : 0);
  }
  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen && document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen && document.exitFullscreen();
    }
  }

  document.getElementById("prev").addEventListener("click", () => show(current - 1));
  document.getElementById("next").addEventListener("click", () => show(current + 1));
  document.getElementById("fs").addEventListener("click", toggleFullscreen);

  document.addEventListener("keydown", (e) => {
    const onControl = e.target.closest && e.target.closest("button, .card, a, input");
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
          feedback.textContent = right
            ? (quiz.dataset.right || "Correct!")
            : (quiz.dataset.wrong || "Not quite. Try again!");
        }
      });
    });
  });

  /* ---------- Speak-along (syllables light up in turn) ---------- */
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

  async function commonsInfo(file) {
    const u = new URL("https://commons.wikimedia.org/w/api.php");
    const params = {
      action: "query", format: "json", origin: "*", prop: "imageinfo",
      iiprop: "url|extmetadata", iiurlwidth: "1400", titles: "File:" + file
    };
    Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
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
      license: plain(meta.LicenseShortName && meta.LicenseShortName.value) || "See file page"
    };
  }

  async function wikiLeadImage(article) {
    const u = new URL("https://en.wikipedia.org/w/api.php");
    const params = {
      action: "query", format: "json", origin: "*", prop: "pageimages",
      piprop: "name", redirects: "1", titles: article
    };
    Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
    const data = await (await fetch(u)).json();
    const page = Object.values(data.query.pages)[0];
    return page.pageimage || null;
  }

  async function loadImages() {
    const imgs = Array.from(document.querySelectorAll("img[data-file], img[data-wiki]"));
    const results = await Promise.all(imgs.map(async (img) => {
      try {
        const file = img.dataset.file || await wikiLeadImage(img.dataset.wiki);
        return file ? await commonsInfo(file) : null;
      } catch (err) { return null; }
    }));

    const credits = [];
    const seen = new Set();
    imgs.forEach((img, k) => {
      const info = results[k];
      if (!info) {
        const box = document.createElement("div");
        box.className = "img-missing";
        box.textContent = "Image unavailable: " + (img.dataset.file || img.dataset.wiki);
        if (img.classList.contains("hero")) img.remove(); else img.replaceWith(box);
        return;
      }
      img.src = info.src;
      if (!img.alt) img.alt = info.title;
      if (!seen.has(info.page)) { seen.add(info.page); credits.push(info); }
    });

    const list = document.getElementById("credits");
    if (!list) return;
    credits.forEach((c) => {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = c.page; a.target = "_blank"; a.rel = "noopener";
      a.textContent = c.title;
      li.appendChild(a);
      li.appendChild(document.createTextNode(" by " + c.artist + ", " + c.license + " (Wikimedia Commons)"));
      list.appendChild(li);
    });
  }

  fromHash();
  loadImages();
})();
