import { PrismaClient } from "@prisma/client";

// Reuse one Prisma client per process (serverless functions on Vercel are reused between requests)
const globalForPrisma = globalThis;
export const prisma = globalForPrisma.__gpPrisma ?? new PrismaClient();
globalForPrisma.__gpPrisma = prisma;
