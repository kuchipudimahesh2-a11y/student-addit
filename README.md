# adda — student-addit

A real-time hangout app built with React, TypeScript, Cloudflare Workers, D1, and Durable Objects.

**Live app:** <https://student-addit.pages.dev>

The main app is served at <https://student-addit.pages.dev>. Its API, account data, and WebSocket connections use the Worker at <https://student-addit.mgp899123.workers.dev>. The admin frontend target is <https://student-addit-admin.pages.dev> after its Pages project is deployed. Study file objects are private in R2; the Worker checks the signed-in account before serving them.

## What’s inside

- Create an account with a name, password confirmation, gender, and a recovery question.
- Sign in with an automatically assigned, unique adda ID. Members can change their ID to any available handle.
- Reset a forgotten password by answering the account’s recovery question.
- Open straight into a WhatsApp-style chat list, search conversations, and select one chat at a time. The mobile chat view has a back button to return to the list.
- Join the open Aids 2 group. The migration adds all current accounts, assigns `#mahi2a494` as its admin, and moves the former shared-room conversation and resources into the group without deleting them.
- Find a random conversation partner. The queue pairs two connected people and relays messages without revealing either adda ID.
- Play six games from the Games hub. Dino Run is the only game that adds boys’ and girls’ team points; Quick Tap, Perfect Timing, Dodge Box, Catch It, and Reaction Test keep private personal bests on the signed-in account.
- Read Studies and vote in Polls from inside group chats. Group admins can manage their group's folders, files, and polls.
- Find public groups by name, or join private groups from revocable invite links and QR codes. Group admins can require approval, invite members by adda ID, and approve join requests; group codes and shared passwords are not used.
- Use the separate admin studio to search member profiles, suspend or restore accounts, grant administrator roles, and send notifications.

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

For local feature testing without entering an admin ID or password, set `ADMIN_TEST_MODE="true"` in `.dev.vars` and run the admin frontend at `localhost`. This creates a local-only test admin. The Worker accepts this bypass only when the request reaches it over a loopback hostname; it never grants admin access on the deployed Worker. Run `npm run db:local` first. Do not set `ADMIN_TEST_MODE` as a Cloudflare Worker variable or secret.

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

### Push notification setup

Push notifications require HTTPS, a browser that supports Web Push, and each member's permission. The member app shows a one-time opt-in prompt after sign-in; members can change the setting later in Profile. adda encourages PWA installation but remains usable in a browser. iPhone and iPad users must add adda to the Home Screen before enabling Web Push. Generate a VAPID key pair once and keep the private key secret:

```sh
npx web-push generate-vapid-keys
npx wrangler queues create adda-push-delivery
npx wrangler queues create adda-push-dead-letter
npx wrangler secret put VAPID_PUBLIC_KEY
npx wrangler secret put VAPID_PRIVATE_KEY
npx wrangler secret put VAPID_SUBJECT
```

Paste the generated public and private keys into the matching Wrangler prompts. For `VAPID_SUBJECT`, enter a contact URI such as `mailto:you@example.com`. Use the same VAPID pair for every deployment; changing it invalidates existing device subscriptions. The public key is returned to signed-in members so their browsers can subscribe; the private key is only used by the Worker. Local development can use the same three values in the ignored `.dev.vars` file. Do not commit real keys or put the private key in frontend variables.

The Queue producer and consumers are declared in `wrangler.toml`. Create both Queue resources before deploying the Worker. Apply the latest D1 migrations with `npm run db:remote`, then deploy the Worker and main PWA. Deploy the admin frontend after the Worker is updated. Admins send announcement campaigns from Admin Studio → Notifications. Push copy never includes private chat message text or member identity. WebSockets continue to refresh connected screens immediately.

Polls use migration 0004, applied with `npm run db:remote`. Group admins create and close polls from the Polls tab inside their group chat. Members of that group can vote once per poll; votes and changes refresh connected chats over the Polls Durable Object WebSocket.

Group links and join approvals use migrations 0011 and 0012. Invite links contain a random token in the URL fragment; D1 stores only its hash. Each group has one active share link, and rotating or revoking it invalidates the previous link. The QR code encodes the same invite URL. Public groups appear in name search; private groups do not. Migration 0012 preserves groups, memberships, invitations, and messages while removing the retired group-number and password columns.

Migration 0013 opens Aids 2, adds all accounts that exist when it runs, makes `#mahi2a494` the group admin, and moves the old shared-room chat, Studies, and Polls into that group. New accounts can find the public group by name and join without approval.

Game runs use migration 0005. Each completed Dino Run adds to the team total. Private casual-game bests use migration 0006 and are only returned to their owner; these records never enter team totals or shared leaderboards. Reaction Test stores the lowest reaction time, while the other casual games store each player's highest score.

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
