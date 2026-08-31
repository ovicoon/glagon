# Glagon

A free, open-source, non-profit AI service.

## Structure

- `src/index.js` — Cloudflare Worker routing and backend proxy
- `public/index.html` — landing page
- `public/chat.html` — chat page
- `public/css/common.css` — shared styles
- `public/css/landing.css` — landing styles
- `public/css/chat.css` — chat styles
- `public/js/chat.js` — chat UI and E2EE client code
- `wrangler.jsonc` — Cloudflare Workers configuration

## Local setup

1. Install dependencies:
   `npm install`

2. Configure the backend URL as `NGROK_URL`.

   For local development, create `.dev.vars`:

   `NGROK_URL=https://your-ngrok-url.ngrok-free.app`

3. Start Wrangler:
   `npm run dev`

## Deploy

`npm run deploy`

The Worker serves:

- `/` — landing page
- `/chat` — chat UI
- `/api/key` — backend key proxy
- `/api/chat` — encrypted chat proxy
