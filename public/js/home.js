async function loadPopularGames() {
  const target = document.getElementById("popular-games");
  if (!target) return;

  try {
    const res = await fetch("/api/games");
    if (!res.ok) throw new Error("Failed to load games");
    const games = await res.json();

    const popular = games.slice(0, 4);
    target.innerHTML = popular
      .map(
        (g) => `
        <div class="game-showcase-card">
          <div class="game-image">
            <img src="${g.imagePath}" alt="${g.title}">
          </div>
          <div class="game-details">
            <h3>${g.title}</h3>
            <p>${g.description}</p>
            <a class="btn" href="/games">Games</a>
          </div>
        </div>
      `
      )
      .join("");
  } catch (e) {
    target.innerHTML = `<p style="font-size:1.6rem;color:rgba(255,255,255,0.85)">Unable to load games right now.</p>`;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  loadPopularGames();
});

