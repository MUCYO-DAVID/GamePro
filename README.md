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

## Marketplace

- Browse: `/marketplace` · product page: `/marketplace/:id` · seller dashboard: `/sell`
- Sellers set up a profile once, then list items (up to 8 photos, resized in the browser, max 2 MB each).
- With `MARKETPLACE_REQUIRE_APPROVAL=true` (default) new listings wait for an admin (Admin → Marketplace).
- No checkout: buyers contact sellers (message form, phone, WhatsApp). Payments for items happen outside
  GamePro. The data model keeps listings, sellers and inquiries separate so checkout can be added later.

## Advertising

- Advertisers: `/advertise` (create ad, live preview, pay, see views/clicks/CTR).
- Admin → Advertising: approve/decline, suspend/resume, extend, edit, verify payments, set packages,
  prices and how many ads show at once. Packages start switched off: set prices and switch them on.
- An ad is only shown when its payment is verified **and** an admin approved it. It expires automatically.
- Payments: Flutterwave (`FLW_SECRET_KEY`, `FLW_SECRET_HASH`) and/or Mobile Money transfer verified by an
  admin (`MANUAL_PAYMENT_INSTRUCTIONS`). Payments are confirmed server-side with the provider, never by the browser.
- Daily job: Vercel Cron → `/api/cron/daily` (needs `CRON_SECRET`) expires ads, starts queued ones,
  sends "ending soon" emails and cleans up unused uploads.

## Notifications

In-app (bell icon → `/notifications`) plus email for the important ones (uses the SMTP settings).
All admin actions are recorded in Admin → Activity.
