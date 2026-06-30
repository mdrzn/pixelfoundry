## PixelFoundry Studio

PixelFoundry is a full-stack Next.js 14 application that provides a marketing site, authenticated dashboard, credit-based billing, and mock integrations for AI image/video generation APIs. The current build ships:

- Marketing homepage with pricing, workflow overview, and CTA flows
- Authentication (sign-up/sign-in) backed by NextAuth + Prisma + PostgreSQL
- Credit ledger with starter grants, usage tracking, and billing history views
- Dashboard workflows for create image/edit image/create video powered by server actions and a mock inference runner
- Asset library populated from job results and ready to swap with real provider outputs

The app runs entirely on this server—Apache can reverse-proxy to the Node process once deployed.

## Prerequisites

- Node.js 18+
- PostgreSQL database (already installed on this server)
- `npm` for dependency management
- Environment variables configured in `.env` (see `.env.example`)

## Local Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Configure your environment:

   ```bash
   cp .env.example .env
   # edit DATABASE_URL, NEXTAUTH_SECRET, and optional vendor API tokens
   ```

3. Apply the Prisma schema to your database (creates tables without destroying data):

   ```bash
   npx prisma db push
   ```

   > Tip: run `npx prisma migrate dev --name init` if you prefer tracked migrations.

4. Generate the Prisma client (already run in the repo but safe to repeat after schema edits):

   ```bash
   npx prisma generate
   ```

5. Start the dev server:

   ```bash
   npm run dev
   ```

6. Visit [http://localhost:3000](http://localhost:3000). Sign up to receive 100 starter credits and exercise the dashboard flows. All generation endpoints are mocked locally until you wire real vendor APIs.

## Integrating Real Model Vendors

- Replace the mock runner in `src/lib/jobs.ts` with calls to Replicate/Stability/Luma.
- Update credit pricing in `src/lib/constants.ts` to match actual API costs.
- Store generated assets in S3/MinIO and update the asset creation logic accordingly.
- Add webhook/email handling in `settings` once you choose a provider.

## Deployment Notes

- Build with `npm run build` and launch via `npm run start` behind Apache (reverse proxy on a subdomain/Virtualmin).
- Use PM2 or a systemd service to keep the Next.js server alive.
- Ensure `NEXTAUTH_URL` reflects the public domain and HTTPS configuration.
