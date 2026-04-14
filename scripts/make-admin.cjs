const { PrismaClient } = require("@prisma/client");

async function main() {
  const email = (process.argv[2] || "").toLowerCase().trim();
  if (!email) {
    console.error("Usage: node scripts/make-admin.cjs <email>");
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.update({
      where: { email },
      data: { isAdmin: true }
    });
    console.log(`OK: ${user.email} is now admin`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

