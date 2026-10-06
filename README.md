# adda — student-addit

A real-time hangout app built with React, TypeScript, Cloudflare Workers, D1, and Durable Objects.

**Live app:** <https://student-addit.pages.dev>

The main app is served at <https://student-addit.pages.dev>. Its API, account data, and WebSocket connections use the Worker at <https://student-addit.mgp899123.workers.dev>. The admin frontend target is <https://student-addit-admin.pages.dev> after its Pages project is deployed. Study file objects are private in R2; the Worker checks the signed-in account before serving them.

## What’s inside

- Create an account with a name, password confirmation, gender, and a recovery question.
- Sign in with an automatically assigned, unique adda ID. Members can change their ID to any available handle.
- Reset a forgotten password by answering the account’s recovery question.
- Post in the shared adda room. Messages are saved in D1 and delivered live over a Durable Object WebSocket.
- Find a random conversation partner. The queue pairs two connected people and relays messages without revealing either adda ID.
- Play the dino runner and see individual best runs and combined boys’ and girls’ scores. The highest scorer receives the **THAGGEDELE** badge.
- Browse the read-only Studies room, where admins publish live notes and private file attachments in named sections.
- Use the separate admin studio to search member profiles, suspend or restore accounts, grant administrator roles, and manage Studies.

## Run locally

Requirements: Node.js 20 or newer and npm.

```sh
npm install
npm run db:local
```

Make a local secret file before starting Wrangler: copy `.dev.vars.example` to `.dev.vars` and replace both values with private random strings. Keep `.dev.vars` out of Git.

Start the Worker (with local D1 and Durable Objects) in one terminal:

```sh
npx wrangler dev
```

Then start Vite in a second terminal:

```sh
npm run dev
```

Open `http://localhost:5173`. Vite proxies `/api` requests and WebSockets to Wrangler on port `8787`.

To preview the admin site locally, use `npx vite --config vite.admin.config.ts`. Its API requests proxy to the same local Worker.

## Deploy to Cloudflare

1. Sign in to Wrangler: `npx wrangler login`.
2. Apply the new schema to the configured D1 database: `npm run db:remote`.
3. Create the private Studies file bucket: `npx wrangler r2 bucket create student-addit-studies`.
4. Set `SESSION_SECRET` if it is not already configured: `npx wrangler secret put SESSION_SECRET` and enter a long random value.
5. Set the one-time admin bootstrap secret: `npx wrangler secret put ADMIN_BOOTSTRAP_SECRET`. Use a different long random value and keep it private.
6. Build and deploy the Worker/API: `npm run deploy`.
7. Deploy the main frontend to its existing Pages project: `npm run deploy:app-pages`.
8. Create the separate Pages project on the `main` production branch: `npx wrangler pages project create student-addit-admin --production-branch main`.
9. Deploy the admin frontend: `npm run deploy:admin`.
10. Open `https://student-addit-admin.pages.dev`, sign in with the account that should become the first admin, and enter the bootstrap secret once. After the claim succeeds, remove the secret with `npx wrangler secret delete ADMIN_BOOTSTRAP_SECRET`.

The first deploy creates the Worker and Durable Object classes. Cloudflare serves the React build through Workers Static Assets; API requests, D1 queries, and WebSocket services run on the Worker platform. `dist/` is the app/Worker asset build and `dist-admin/` is the separate Pages build. If Cloudflare assigns a different admin Pages hostname, add that origin to `ALLOWED_ORIGINS` in `worker/index.ts` before deploying the Worker.

## Account recovery and privacy

Passwords and recovery answers are stored as salted PBKDF2 hashes. The recovery question itself is stored so it can be shown during reset. Choose an answer that is hard for other people to guess, and use a unique password. The session signing secret must be set in Cloudflare before production use.

## Project structure

```text
src/                  React application and styles
worker/index.ts       API, auth, chat WebSockets, random pairing
migrations/           D1 schema migrations
wrangler.toml         Cloudflare Worker, D1, assets, and Durable Objects
```
