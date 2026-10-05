# adda — student-addit

A real-time hangout app built with React, TypeScript, Cloudflare Workers, D1, and Durable Objects.

**Live app:** <https://student-addit.mgp899123.workers.dev>

## What’s inside

- Create an account with a name, password confirmation, gender, and a recovery question.
- Sign in with an automatically assigned, unique adda ID. Members can change their ID to any available handle.
- Reset a forgotten password by answering the account’s recovery question.
- Post in the shared adda room. Messages are saved in D1 and delivered live over a Durable Object WebSocket.
- Find a random conversation partner. The queue pairs two connected people and relays messages without revealing either adda ID.
- Play the dino runner and see individual best runs and combined boys’ and girls’ scores. The highest scorer receives the **THAGGEDELE** badge.

## Run locally

Requirements: Node.js 20 or newer and npm.

```sh
npm install
npm run db:local
```

Make a local secret file before starting Wrangler: copy `.dev.vars.example` to `.dev.vars` and replace its value with a private random string. Keep `.dev.vars` out of Git.

Start the Worker (with local D1 and Durable Objects) in one terminal:

```sh
npx wrangler dev
```

Then start Vite in a second terminal:

```sh
npm run dev
```

Open `http://localhost:5173`. Vite proxies `/api` requests and WebSockets to Wrangler on port `8787`.

## Deploy to Cloudflare

1. Sign in to Wrangler: `npx wrangler login`.
2. Create the production D1 database: `npx wrangler d1 create student-addit-db`.
3. Copy the returned database ID into `wrangler.toml` in place of the all-zero placeholder.
4. Apply the schema: `npm run db:remote`.
5. Set a private session-signing secret: `npx wrangler secret put SESSION_SECRET` and enter a long random value.
6. Build and deploy: `npm run deploy`.

The first deploy creates the Worker and Durable Object classes. Cloudflare serves the React build through Workers Static Assets; API requests, D1 queries, and both WebSocket services run on the Worker platform.

## Account recovery and privacy

Passwords and recovery answers are stored as salted PBKDF2 hashes. The recovery question itself is stored so it can be shown during reset. Choose an answer that is hard for other people to guess, and use a unique password. The session signing secret must be set in Cloudflare before production use.

## Project structure

```text
src/                  React application and styles
worker/index.ts       API, auth, chat WebSockets, random pairing
migrations/           D1 schema migrations
wrangler.toml         Cloudflare Worker, D1, assets, and Durable Objects
```
