const API = "https://graphql.anilist.co";

let slides = [];
let slideIndex = 0;
let animeEntries = [];
let mangaEntries = [];
let currentUser = "";

let summaryPages = [];
let canvasPage = 0;

// Utility: top N entries from an object (works count)
function topN(obj, n = 5) {
  const arr = Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n);
  return arr.length ? arr.map(([k, v]) => `${k} (${v})`).join("\n") : "—";
}

function iconFor(title) {
  if (title.includes("Anime")) return "🎬";
  if (title.includes("Manga")) return "📚";
  if (title.includes("Episodes")) return "📺";
  if (title.includes("Hours")) return "⏱";
  if (title.includes("Genres")) return "🏆";
  if (title.includes("Tags")) return "🏷";
  if (title.includes("Studios")) return "🎥";
  if (title.includes("Staff")) return "🎭";
  return "✨";
}

// Wrap text into lines that fit maxWidth using canvas measureText
function wrapText(ctx, text, maxWidth, font) {
  ctx.font = font;
  const words = String(text).split(" ");
  const lines = [];
  let line = "";
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (ctx.measureText(test).width <= maxWidth) {
      line = test;
    } else {
      if (line) lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// Build pages of sections so each canvas page fits vertically
function buildSummaryPages(ctx, slides) {
  const pages = [];
  const headerSpace = 300;
  const footerSpace = 80;
  const usableHeight = 1920 - headerSpace - footerSpace;
  const maxWidth = 1080 - 160;

  let page = [];
  let used = 0;

  for (const s of slides) {
    const icon = iconFor(s.title);
    const titleLines = wrapText(ctx, `${icon} ${s.title}:`, maxWidth, "34px Segoe UI");
    const rawValues = (s.value || "").split("\n");
    const valueLines = rawValues.flatMap(v => wrapText(ctx, v, maxWidth - 40, "30px Segoe UI"));

    const titleHeight = titleLines.length * 40;
    const valueHeight = valueLines.length * 36;
    const sectionHeight = titleHeight + valueHeight + 40;

    if (used + sectionHeight > usableHeight && page.length > 0) {
      pages.push(page);
      page = [];
      used = 0;
    }

    page.push({ titleLines, valueLines });
    used += sectionHeight;
  }

  if (page.length) pages.push(page);
  return pages;
}

// Draw a single canvas page
function drawWrappedSummary(user, pages, pageIndex = 0) {
  const canvas = document.getElementById("wrappedCanvas");
  if (!canvas) return;
  canvas.width = 1080;
  canvas.height = 1920;
  const ctx = canvas.getContext("2d");

  // Background
  ctx.fillStyle = "#0f1226";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Header
  ctx.textAlign = "center";
  ctx.fillStyle = "#eef0ff";
  ctx.font = "bold 72px Segoe UI";
  ctx.fillText("AniList Wrapped 2025", canvas.width / 2, 120);
  ctx.font = "40px Segoe UI";
  ctx.fillText(`@${user}`, canvas.width / 2, 180);

  // Page indicator
  ctx.font = "28px Segoe UI";
  ctx.fillStyle = "#aab0d9";
  ctx.fillText(`Page ${pageIndex + 1} / ${pages.length}`, canvas.width / 2, 230);

  // Content
  let y = 300;
  ctx.textAlign = "left";
  for (const sec of pages[pageIndex]) {
    ctx.fillStyle = "#eef0ff";
    ctx.font = "34px Segoe UI";
    for (const line of sec.titleLines) {
      ctx.fillText(line, 100, y);
      y += 40;
    }
    y += 6;
    ctx.font = "30px Segoe UI";
    ctx.fillStyle = "#eef0ff";
    for (const line of sec.valueLines) {
      ctx.fillText(line, 140, y);
      y += 36;
    }
    y += 20;
  }

  // Footer
  ctx.textAlign = "center";
  ctx.fillStyle = "#aab0d9";
  ctx.font = "28px Segoe UI";
  ctx.fillText("Generated locally • Save and share 🎉", canvas.width / 2, canvas.height - 60);
}

// Save current canvas page as PNG
function saveCanvas() {
  const canvas = document.getElementById("wrappedCanvas");
  if (!canvas) return;
  const a = document.createElement("a");
  a.download = `anilist-wrapped-2025-page${canvasPage + 1}.png`;
  a.href = canvas.toDataURL("image/png");
  a.click();
}

// Canvas page navigation
window.nextCanvasPage = function () {
  if (!summaryPages.length) return;
  canvasPage = (canvasPage + 1) % summaryPages.length;
  drawWrappedSummary(currentUser, summaryPages, canvasPage);
  updateCanvasNavState();
};

window.prevCanvasPage = function () {
  if (!summaryPages.length) return;
  canvasPage = (canvasPage - 1 + summaryPages.length) % summaryPages.length;
  drawWrappedSummary(currentUser, summaryPages, canvasPage);
  updateCanvasNavState();
};

function updateCanvasNavState() {
  const nav = document.getElementById("canvasNav");
  const saveBtn = document.getElementById("saveBtn");
  if (!nav || !saveBtn) return;
  nav.style.display = summaryPages.length > 1 ? "flex" : "none";
  saveBtn.style.display = summaryPages.length ? "inline-block" : "none";
}

// Slide UI (small preview slide)
function renderSlide() {
  const titleEl = document.getElementById("slide-title");
  const valueEl = document.getElementById("slide-value");
  if (!titleEl || !valueEl) return;
  const s = slides[slideIndex] || { title: "", value: "" };
  titleEl.textContent = s.title;
  valueEl.textContent = s.value;
}

window.nextSlide = function () {
  if (!slides.length) return;
  slideIndex = (slideIndex + 1) % slides.length;
  renderSlide();
};

window.prevSlide = function () {
  if (!slides.length) return;
  slideIndex = (slideIndex - 1 + slides.length) % slides.length;
  renderSlide();
}

// Main generate function: fetch data, aggregate, build slides and pages
window.generate = async function () {
  const userInput = document.getElementById("username");
  const errorEl = document.getElementById("error");
  if (!userInput || !errorEl) return;
  const user = userInput.value.trim();
  currentUser = user;
  errorEl.textContent = "";
  if (!user) {
    errorEl.textContent = "Please enter an AniList username.";
    return;
  }

  // NOTE: we request the entry's score (user's rating) via 'score' on the list entry
  const query = `query ($name: String) {
    anime: MediaListCollection(userName: $name, type: ANIME) {
      lists { entries {
        completedAt { year }
        progress
        score
        media {
          title { romaji }
          episodes
          duration
          genres
          tags { name }
          studios { edges { node { name } } }
          staff { edges { node { name { full } } } }
        }
      } }
    }
    manga: MediaListCollection(userName: $name, type: MANGA) {
      lists { entries {
        completedAt { year }
        progress
        score
        media {
          title { romaji }
          chapters
          genres
          tags { name }
          staff { edges { node { name { full } } } }
        }
      } }
    }
  }`;

  try {
    const res = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables: { name: user } })
    });
    const json = await res.json();

    if (!json || !json.data) {
      throw new Error("No data returned from AniList.");
    }

    // Keep entries that were completed in 2025
    animeEntries = (json.data.anime?.lists || []).flatMap(l => l.entries || [])
      .filter(e => e.completedAt?.year === 2025);
    mangaEntries = (json.data.manga?.lists || []).flatMap(l => l.entries || [])
      .filter(e => e.completedAt?.year === 2025);

    // Aggregate anime
    let episodes = 0;
    let minutes = 0;
    const genres = {};
    const tags = {};
    const studiosWorks = {}; // count works per studio
    const staffWorks = {};   // count works per staff
    const animeRatedByUser = [];   // { title, score }

    for (const e of animeEntries) {
      const media = e.media || {};
      const title = media.title?.romaji || "Unknown";
      const eps = media.episodes ?? e.progress ?? 0;
      const dur = media.duration ?? 24;
      episodes += eps;
      minutes += eps * dur;
      (media.genres || []).forEach(g => genres[g] = (genres[g] || 0) + 1);
      (media.tags || []).forEach(t => tags[t.name] = (tags[t.name] || 0) + 1);

      // Count works per studio (one work per media)
      const studioNames = (media.studios?.edges || []).map(s => s.node.name);
      const uniqueStudios = Array.from(new Set(studioNames));
      uniqueStudios.forEach(name => {
        studiosWorks[name] = (studiosWorks[name] || 0) + 1;
      });

      // Count works per staff (one work per media per staff member)
      const staffNames = (media.staff?.edges || []).map(s => s.node.name.full);
      const uniqueStaff = Array.from(new Set(staffNames));
      uniqueStaff.forEach(name => {
        staffWorks[name] = (staffWorks[name] || 0) + 1;
      });

      // Use the user's score from the list entry (score)
      // AniList stores scores as integers (0-100) depending on user's scoring scale
      const userScore = (typeof e.score === "number") ? e.score : (e.score ?? 0);
      animeRatedByUser.push({ title, score: userScore });
    }

    // Aggregate manga
    let chapters = 0;
    const mangaGenres = {};
    const mangaTags = {};
    const mangaStaffWorks = {};
    const mangaRatedByUser = [];

    for (const e of mangaEntries) {
      const media = e.media || {};
      const title = media.title?.romaji || "Unknown";
      const ch = media.chapters ?? e.progress ?? 0;
      chapters += ch;
      (media.genres || []).forEach(g => mangaGenres[g] = (mangaGenres[g] || 0) + 1);
      (media.tags || []).forEach(t => mangaTags[t.name] = (mangaTags[t.name] || 0) + 1);

      const staffNames = (media.staff?.edges || []).map(s => s.node.name.full);
      const uniqueStaff = Array.from(new Set(staffNames));
      uniqueStaff.forEach(name => {
        mangaStaffWorks[name] = (mangaStaffWorks[name] || 0) + 1;
      });

      const userScore = (typeof e.score === "number") ? e.score : (e.score ?? 0);
      mangaRatedByUser.push({ title, score: userScore });
    }

    // Sort rated lists by user's score
    const animeRatedDesc = animeRatedByUser.slice().sort((a, b) => b.score - a.score);
    const animeRatedAsc = animeRatedByUser.slice().sort((a, b) => a.score - b.score);
    const mangaRatedDesc = mangaRatedByUser.slice().sort((a, b) => b.score - a.score);
    const mangaRatedAsc = mangaRatedByUser.slice().sort((a, b) => a.score - b.score);

    // Format rated lists (show user's score)
    function formatRated(arr, n = 5) {
      return arr.slice(0, n).map(it => `${it.title} — ${it.score}`).join("\n") || "—";
    }

    slides = [
      { title: "Anime Completed", value: String(animeEntries.length) },
      { title: "Episodes Watched", value: String(episodes) },
      { title: "Hours Watched", value: `${Math.round(minutes / 60)} h` },
      { title: "Top Genres", value: topN(genres, 5) },
      { title: "Top Tags", value: topN(tags, 5) },
      { title: "Top Studios (Works)", value: topN(studiosWorks, 5) },
      { title: "Top Staff (Anime Works)", value: topN(staffWorks, 5) },
      { title: "Top Rated Anime (Your Scores)", value: formatRated(animeRatedDesc, 5) },
      { title: "Lowest Rated Anime (Your Scores)", value: formatRated(animeRatedAsc, 5) },
      { title: "Manga Completed", value: String(mangaEntries.length) },
      { title: "Chapters Read", value: String(chapters) },
      { title: "Top Genres (Manga)", value: topN(mangaGenres, 5) },
      { title: "Top Tags (Manga)", value: topN(mangaTags, 5) },
      { title: "Top Rated Manga (Your Scores)", value: formatRated(mangaRatedDesc, 5) },
      { title: "Lowest Rated Manga (Your Scores)", value: formatRated(mangaRatedAsc, 5) },
      { title: "Top Staff (Manga Works)", value: topN(mangaStaffWorks, 5) },
      { title: "Wrapped", value: "✨ 2025 Complete ✨" }
    ];

    // Show slide preview
    slideIndex = 0;
    renderSlide();
    const slideEl = document.getElementById("slide");
    if (slideEl) slideEl.style.display = "block";

    // Build canvas pages and draw first page
    const canvas = document.getElementById("wrappedCanvas");
    const ctx = canvas.getContext("2d");
    summaryPages = buildSummaryPages(ctx, slides);
    canvasPage = 0;
    if (summaryPages.length === 0) {
      summaryPages = [[{ titleLines: ["✨ Wrapped"], valueLines: ["No data for 2025"] }]];
    }
    drawWrappedSummary(currentUser, summaryPages, canvasPage);

    // Show/hide nav and save button
    updateCanvasNavState();

    // Ensure canvas is visible
    const canvasEl = document.getElementById("wrappedCanvas");
    if (canvasEl) canvasEl.style.display = "block";
  } catch (err) {
    console.error(err);
    const errorEl = document.getElementById("error");
    if (errorEl) errorEl.textContent = "Failed to load AniList data. Check username or try again later.";
  }
};