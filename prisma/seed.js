import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const games = [
  {
    slug: "vip",
    title: "VIP Gaming Room",
    description:
      "Experience luxury gaming in our exclusive VIP room with premium equipment and personalized service.",
    imagePath: "/images/VIP-room.jpg",
    features: [
      { icon: "fa-crown", text: "Premium Experience" },
      { icon: "fa-clock", text: "Flexible Hours" },
      { icon: "fa-star", text: "Private Space" }
    ]
  },
  {
    slug: "cinema",
    title: "Cinema Gaming Room",
    description:
      "Immerse yourself in our cinema-style gaming room with a massive screen and surround sound system.",
    imagePath: "/images/cinema-room.avif",
    features: [
      { icon: "fa-film", text: "Theater Experience" },
      { icon: "fa-users", text: "Up to 10 Players" },
      { icon: "fa-volume-up", text: "Surround Sound" }
    ]
  },
  {
    slug: "competition",
    title: "Competition Room",
    description:
      "Perfect for tournaments and competitive gaming events with professional equipment and streaming setup.",
    imagePath: "/images/competition-room.jpg",
    features: [
      { icon: "fa-trophy", text: "Tournament Ready" },
      { icon: "fa-gamepad", text: "Pro Equipment" },
      { icon: "fa-video", text: "Streaming Setup" }
    ]
  },
  {
    slug: "fifa",
    title: "FIFA Gaming",
    description:
      "Experience the latest FIFA games with friends in our dedicated football gaming zone.",
    imagePath: "/images/FC-2025.webp",
    features: [
      { icon: "fa-futbol", text: "Latest FIFA" },
      { icon: "fa-users", text: "2-4 Players" },
      { icon: "fa-tv", text: "4K Display" }
    ]
  },
  {
    slug: "online",
    title: "Online Gaming Zone",
    description:
      "High-speed internet and powerful gaming PCs for the best online gaming experience.",
    imagePath: "/images/online-playing.webp",
    features: [
      { icon: "fa-wifi", text: "High-Speed Internet" },
      { icon: "fa-desktop", text: "Gaming PCs" },
      { icon: "fa-network-wired", text: "LAN Setup" }
    ]
  },
  {
    slug: "budget",
    title: "Budget Gaming Room",
    description: "Affordable gaming options without compromising on the fun factor.",
    imagePath: "/images/discount-room.jpeg",
    features: [
      { icon: "fa-tags", text: "Best Value" },
      { icon: "fa-clock", text: "Flexible Hours" },
      { icon: "fa-gamepad", text: "Various Games" }
    ]
  },
  {
    slug: "nba2k",
    title: "NBA 2K",
    description:
      "Experience the thrill of professional basketball with our latest NBA 2K setup. Perfect for both casual players and competitive gamers.",
    imagePath: "/images/2k games.jpeg",
    features: [
      { icon: "fa-users", text: "1-4 Players" },
      { icon: "fa-clock", text: "30 min sessions" },
      { icon: "fa-gamepad", text: "Pro Controllers" }
    ]
  },
  {
    slug: "pool",
    title: "8 Ball Pool",
    description:
      "Challenge your friends in our professional pool gaming setup. Test your skills and strategy in this classic game.",
    imagePath: "/images/8-pool game.webp",
    features: [
      { icon: "fa-users", text: "2 Players" },
      { icon: "fa-clock", text: "45 min sessions" },
      { icon: "fa-star", text: "Professional Table" }
    ]
  },
  {
    slug: "shooting",
    title: "Shooting Games",
    description:
      "Immerse yourself in our collection of action-packed shooting games with high-end gaming setups.",
    imagePath: "/images/shooting games.avif",
    features: [
      { icon: "fa-users", text: "1-4 Players" },
      { icon: "fa-clock", text: "1 hour sessions" },
      { icon: "fa-tv", text: "4K Display" }
    ]
  },
  {
    slug: "uno",
    title: "UNO",
    description:
      "Enjoy the classic card game UNO with friends and family in our comfortable gaming environment.",
    imagePath: "/images/uno game.jpeg",
    features: [
      { icon: "fa-users", text: "2-8 Players" },
      { icon: "fa-clock", text: "30 min sessions" },
      { icon: "fa-cards", text: "Premium Cards" }
    ]
  }
];

async function main() {
  for (const game of games) {
    await prisma.game.upsert({
      where: { slug: game.slug },
      update: {
        title: game.title,
        description: game.description,
        imagePath: game.imagePath,
        features: game.features
      },
      create: game
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

