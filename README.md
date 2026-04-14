# GamePro (Database-backed)

This repo reconstructs your original Netlify-deployed site and upgrades it to a real backend + database so it can scale.

### What you have now

- **Frontend**: static pages in `public/` (Home, Games, Booking)
- **Backend**: Express server in `server/`
- **Database**: Prisma + SQLite for local dev (easy to switch to Postgres for production)

### Run locally

1) Copy env file:

```bash
copy .env.example .env
```

2) Install dependencies:

```bash
npm install
```

3) Create DB + seed games:

```bash
npx prisma migrate dev
npm run seed
```

4) Start:

```bash
npm run dev
```

Open:
- `/` Home
- `/games` Games list (loaded from DB)
- `/booking` Booking form (writes to DB)

