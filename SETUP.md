# The Kitchen — Setup Guide

## 1. Create a Supabase project

1. Go to https://supabase.com and create a new project.
2. Once created, go to **Project Settings → API** and copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon / public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role key** → `SUPABASE_SERVICE_ROLE_KEY`

## 2. Configure environment variables

Edit `.env.local` and fill in the three values:

```
NEXT_PUBLIC_SUPABASE_URL=https://yourproject.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

## 3. Run the database migration

In your Supabase project, go to **SQL Editor** and paste + run the contents of:

```
supabase/migrations/001_initial_schema.sql
```

This creates all tables, enums, RLS policies, and the `handle_new_user` trigger.

## 4. Deploy the Edge Function (optional but recommended)

Install the Supabase CLI and run:

```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase functions deploy process-match-result
```

The Edge Function (`supabase/functions/process-match-result/index.ts`) handles ELO
calculations server-side. The app also includes a client-side fallback in
`submit-score-dialog.tsx` that runs when the Edge Function isn't set up.

### Set Edge Function env vars (in Supabase dashboard → Edge Functions → Secrets):
```
SUPABASE_URL=https://yourproject.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

## 5. Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000

## Project structure

```
src/
  app/
    (auth)/login        — Login page
    (auth)/signup       — Signup page
    (app)/dashboard     — Leagues overview
    (app)/leagues/[id]  — League page (leaderboard, matches, members, settings)
    (app)/profile       — User profile editor
  components/
    leagues/            — League-specific components
    matches/            — Match dialogs
    ui/                 — shadcn/ui primitives
  lib/supabase/         — Client/server/middleware helpers
  types/database.ts     — TypeScript types
supabase/
  migrations/           — SQL schema
  functions/            — Edge Functions
```

## ELO system summary

- Every player starts at **1000 ELO** when joining a league
- K factor: **32**
- Score margin multiplier: `1 + (point_diff / max_points) * 0.5`, clamped to [1.0, 1.5]
- Doubles/Mixed Doubles: team averages are used for ELO calculation; same delta applied to all players on each team
- All ELO changes are recorded in `point_transactions`
