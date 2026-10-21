# Glagon

**Glass Clear AI.** Free. Open-source. Non-profit. Runs on a real person's computer.

The AI model behind Glagon runs on the developer's own computer, not in a big company's AI cloud. The code for the website and for the server that talks to the model is public, so you can check how it works yourself.

> Glagon may be offline at times, because it runs on a personal computer.

## Privacy

- Your browser encrypts each message before sending it. The website host (Cloudflare) and the tunnel (ngrok) pass along only encrypted data.
- The server on the developer's computer decrypts your message so the AI can read it. The developer's computer can therefore see your messages; the encryption does not protect you from the developer.
- The published server code (`in_server/gateway.py`) does not save messages. It only prints error messages.
- Glagon does not remember earlier messages. Each message is answered on its own.
- The server's public key is fetched through the same relay and is not verified, so the encryption does not protect against a malicious relay.

Please don't send passwords, personal data, or anything else sensitive. Glagon uses a small model (Ministral 3, 3B) and can give wrong answers.

## Structure

- `src/index.js` — Cloudflare Worker routing and backend proxy
- `public/index.html` — landing page
- `public/chat.html` — chat page
- `public/css/common.css` — shared styles
- `public/css/landing.css` — landing styles
- `public/css/chat.css` — chat styles
- `public/js/chat.js` — chat UI and client-side encryption code
- `public/js/landing.js` — landing page effects
- `in_server/gateway.py` — server on the developer's computer: decrypts requests and calls the model (Ollama)
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
