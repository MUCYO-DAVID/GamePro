function renderFeatures(features) {
  if (!Array.isArray(features)) return "";
  return features
    .map((f) => `<li><i class="fas ${f.icon || "fa-star"}"></i> ${f.text || ""}</li>`)
    .join("");
}

async function loadGames() {
  const grid = document.getElementById("games-grid");
  if (!grid) return;

  try {
    const res = await fetch("/api/games");
    if (!res.ok) throw new Error("Failed to load games");
    const games = await res.json();

    grid.innerHTML = games
      .map(
        (g) => `
        <div class="game-showcase-card">
          <div class="game-image">
            <img src="${g.imagePath}" alt="${g.title}">
          </div>
          <div class="game-details">
            <h3>${g.title}</h3>
            <p>${g.description}</p>
            <ul class="game-features">
              ${renderFeatures(g.features)}
            </ul>
            <a class="btn book-now" href="/booking?game=${encodeURIComponent(g.slug)}">Book Now</a>
          </div>
        </div>
      `
      )
      .join("");
  } catch (e) {
    grid.innerHTML = `<p style="font-size:1.6rem;color:rgba(255,255,255,0.85)">Unable to load games right now.</p>`;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  loadGames();
});

