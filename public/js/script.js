document.addEventListener("DOMContentLoaded", function () {
  // Mobile menu functionality
  const mobileMenuBtn = document.querySelector(".mobile-menu-btn");
  const navbar = document.querySelector(".navbar");

  if (mobileMenuBtn && navbar) {
    mobileMenuBtn.addEventListener("click", () => {
      navbar.classList.toggle("active");
      mobileMenuBtn.classList.toggle("active");
    });

    // Close menu when clicking outside
    document.addEventListener("click", (e) => {
      if (!navbar.contains(e.target) && !mobileMenuBtn.contains(e.target)) {
        navbar.classList.remove("active");
        mobileMenuBtn.classList.remove("active");
      }
    });

    // Close menu when scrolling
    window.addEventListener("scroll", () => {
      navbar.classList.remove("active");
      mobileMenuBtn.classList.remove("active");
    });
  }

  // Smooth scroll for navigation links
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener("click", function (e) {
      e.preventDefault();
      document.querySelector(this.getAttribute("href")).scrollIntoView({
        behavior: "smooth",
      });
    });
  });

  // Booking form handling - now handled by PHP backend
  const gameSelect = document.getElementById("gameName");

  // Auto-select game if URL has game parameter
  if (gameSelect) {
    const urlParams = new URLSearchParams(window.location.search);
    const gameParam = urlParams.get("game");
    if (gameParam) {
      gameSelect.value = gameParam;
    }
  }

  // Set minimum date to today for booking form
  const dateInput = document.getElementById("date");
  if (dateInput) {
    const today = new Date().toISOString().split("T")[0];
    dateInput.min = today;
  }

  // Game cards reveal animation
  const gameCards = document.querySelectorAll(".game-card");

  const revealCard = (entries, observer) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("active");
        observer.unobserve(entry.target);
      }
    });
  };

  const cardObserver = new IntersectionObserver(revealCard, {
    threshold: 0.2,
  });

  gameCards.forEach((card) => {
    cardObserver.observe(card);
  });
});
