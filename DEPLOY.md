# Deploying Midnight Eclipse

Two parts: **static frontend** (pages + assets → Vercel) and **realtime backend** (socket.io → your laptop or Railway).

## 1. Deploy the static frontend to Vercel

```bash
npm i -g vercel    # once
vercel             # first time: link project
vercel --prod      # deploy
```

The `vercel-build` script in `package.json` copies `data/*.json` into `public/data/` so the static pages can fetch them.

You will get a stable URL like `https://claws-formal.vercel.app`. That's what you program your NFC tags to.

NFC URL pattern:
```
https://claws-formal.vercel.app/?card=card_001
```

## 2. Run the realtime backend

The socket.io server (`server.js`) powers live voting, NFC pair interactions, the terminal, and the admin panel. Vercel's serverless runtime **can't hold open websockets**, so this has to run somewhere persistent.

### Option A — Your laptop + Cloudflare Tunnel (recommended for event night)

```bash
# on your laptop
npm start                                 # starts server.js on :3000

# in another terminal — install cloudflared once
brew install cloudflared
cloudflared tunnel --url http://localhost:3000
```

Cloudflare prints a public HTTPS URL like `https://something-random.trycloudflare.com`. Paste that into `public/js/config.js`:

```js
BACKEND_URL: isStaticHost
  ? 'https://something-random.trycloudflare.com'
  : '',
```

Commit + `vercel --prod` again. Done — the Vercel pages now talk to your laptop.

> Tip: for a stable hostname that doesn't change on restart, set up a named Cloudflare tunnel (`cloudflared tunnel create midnight-eclipse`) and bind it to a subdomain of a domain you own. Optional but nice.

### Option B — Keep Railway running

The existing `railway.toml` already deploys `server.js`. Just set `BACKEND_URL` in `config.js` to your Railway URL and you're done.

## Why this split?

- **Vercel**: perfect for static HTML/CSS/JS, globally cached, free, gives you a stable custom URL for NFC tags.
- **Laptop + tunnel** (or Railway): holds persistent websocket connections for live voting and NFC interactions.

## Local dev

Just `npm start` and open `http://localhost:3000`. Everything is same-origin, `BACKEND_URL` stays empty, socket.io connects to the same host.
