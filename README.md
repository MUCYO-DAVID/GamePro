# GamePro

GamePro Kigali: gaming rooms catalog and booking system.

- **Frontend**: static pages in `public/` (served by Vercel's CDN)
- **Backend**: Express app in `server/app.js`, run as one Vercel serverless function (`api/index.js`)
- **Database**: Supabase Postgres via Prisma (`prisma/schema.prisma`)
- **Hosting**: Vercel (`vercel.json`)

## Run locally

```bash
copy .env.example .env      # then fill in the Supabase connection strings
npm install
npm run prisma:deploy       # create/update tables in Supabase
npm run seed                # add the rooms/games
npm run dev
```

## Database changes

1. Edit `prisma/schema.prisma`
2. `npm run prisma:migrate -- --name what_changed` (creates a migration in `prisma/migrations/`)
3. Commit and push. Vercel runs `prisma migrate deploy` on every build.

## Make someone an admin

They sign up first, then: `node --env-file=.env scripts/make-admin.cjs their@email.com`

## Deploy (Vercel)

Import the GitHub repo in Vercel and set these environment variables:
`DATABASE_URL`, `DIRECT_URL`, `SESSION_SECRET`, `APP_BASE_URL`, `REQUIRE_LOGIN_TO_BOOK`,
`SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`.
