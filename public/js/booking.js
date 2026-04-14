const MAX_PLAYERS = 10;
const MIN_PLAYERS = 1;
let playerCount = 1;
let selectedDuration = "1 hour";

function renderPlayerIcons() {
  const row = document.getElementById("player-icons-row");
  if (!row) return;
  row.innerHTML = Array.from({ length: MAX_PLAYERS }, (_, i) =>
    `<i class="fas fa-user player-icon${i < playerCount ? " active" : ""}"></i>`
  ).join("");
}

function updatePlayerButtons() {
  const dec = document.getElementById("players-dec");
  const inc = document.getElementById("players-inc");
  const num = document.getElementById("players-count");
  if (dec) dec.disabled = playerCount <= MIN_PLAYERS;
  if (inc) inc.disabled = playerCount >= MAX_PLAYERS;
  if (num) num.textContent = String(playerCount);
  renderPlayerIcons();
}

function initPlayersSteppers() {
  document.getElementById("players-dec")?.addEventListener("click", () => {
    if (playerCount > MIN_PLAYERS) { playerCount--; updatePlayerButtons(); }
  });
  document.getElementById("players-inc")?.addEventListener("click", () => {
    if (playerCount < MAX_PLAYERS) { playerCount++; updatePlayerButtons(); }
  });
  updatePlayerButtons();
}

function initDurationPills() {
  document.querySelectorAll(".duration-pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      document.querySelectorAll(".duration-pill").forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");
      selectedDuration = pill.dataset.value;
    });
  });
}

async function loadGamesIntoSelect() {
  const select = document.getElementById("gameSlug");
  if (!select) return;

  const res = await fetch("/api/games");
  const games = await res.json();

  select.innerHTML = games
    .map((g) => `<option value="${g.slug}">${g.title}</option>`)
    .join("");

  const urlParams = new URLSearchParams(window.location.search);
  const gameParam = urlParams.get("game");
  if (gameParam) select.value = gameParam;
}

function setMinDateTime() {
  const input = document.getElementById("date");
  if (!input) return;

  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const min = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  input.min = min;
}

async function handleBookingSubmit(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const result = document.getElementById("booking-result");

  const body = Object.fromEntries(new FormData(form).entries());

  // Prepend players + duration info to notes
  const playerLabel = `${playerCount} player${playerCount !== 1 ? "s" : ""}`;
  const sessionInfo = `${playerLabel}, ${selectedDuration} session`;
  body.notes = body.notes ? `${sessionInfo}. ${body.notes}` : sessionInfo;

  try {
    const res = await fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    const data = await res.json();
    if (!res.ok) {
      result.textContent = data?.error || "Booking failed.";
      return;
    }

    result.textContent = `Booking submitted for ${data.game.title}! Status: ${data.status}.`;
    form.reset();
    playerCount = 1;
    selectedDuration = "1 hour";
    updatePlayerButtons();
    document.querySelectorAll(".duration-pill").forEach((p) => {
      p.classList.toggle("active", p.dataset.value === "1 hour");
    });
    setMinDateTime();
  } catch {
    result.textContent = "Network error. Please try again.";
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  await loadGamesIntoSelect();
  setMinDateTime();
  initPlayersSteppers();
  initDurationPills();

  const form = document.getElementById("booking-form");
  if (form) form.addEventListener("submit", handleBookingSubmit);
});
