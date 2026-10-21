/**
 * Glagon - Cloudflare Worker
 *
 * Routes:
 *   /        -> static landing page
 *   /chat    -> static chat page
 *   /api/key -> proxy backend public key
 *   /api/chat -> proxy encrypted chat request
 *   /api/v1/chat -> API-key protected plain JSON chat (Worker does the encryption)
 */

function normalizePath(pathname) {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }

  return pathname;
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      "Cache-Control": "no-store"
    }
  });
}

async function handleKey(request, env) {
  if (request.method !== "GET") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    const targetBase = env.NGROK_URL.trim().replace(/\/+$/, "");
    const backendRes = await fetch(`${targetBase}/api/key`, {
      headers: {
        "ngrok-skip-browser-warning": "true"
      }
    });

    const text = await backendRes.text();

    return new Response(text, {
      status: backendRes.status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    return jsonResponse(
      {
        error: error instanceof Error ? error.message : String(error)
      },
      500
    );
  }
}

async function handleChat(request, env) {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    const targetBase = env.NGROK_URL.trim().replace(/\/+$/, "");
    const bodyText = await request.text();

    const backendRes = await fetch(`${targetBase}/api/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "ngrok-skip-browser-warning": "true"
      },
      body: bodyText
    });

    const resText = await backendRes.text();

    return new Response(resText, {
      status: backendRes.status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    return jsonResponse(
      {
        error: error instanceof Error ? error.message : String(error)
      },
      500
    );
  }
}

function toBase64(buffer) {
  let binary = "";
  for (const byte of new Uint8Array(buffer)) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function fromBase64(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// Compare SHA-256 digests so the check does not leak the key length or prefix.
async function isValidApiKey(request, env) {
  const header = request.headers.get("Authorization") || "";
  const provided = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(provided)),
    crypto.subtle.digest("SHA-256", encoder.encode(env.API_KEY))
  ]);
  return crypto.subtle.timingSafeEqual(a, b);
}

async function handleApiChat(request, env) {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  if (!env.API_KEY) {
    return jsonResponse({ error: "API_KEY is not configured." }, 500);
  }

  if (!(await isValidApiKey(request, env))) {
    return jsonResponse({ error: "Invalid API key." }, 401);
  }

  let input;
  try {
    input = await request.json();
  } catch {
    return jsonResponse({ error: "Body must be JSON." }, 400);
  }

  if (!input || typeof input.prompt !== "string" || !input.prompt.trim()) {
    return jsonResponse({ error: "`prompt` (string) is required." }, 400);
  }

  const payload = { prompt: input.prompt };
  for (const key of ["system", "temperature", "top_p"]) {
    if (input[key] !== undefined) {
      payload[key] = input[key];
    }
  }

  try {
    const targetBase = env.NGROK_URL.trim().replace(/\/+$/, "");
    const headers = { "ngrok-skip-browser-warning": "true" };

    const keyRes = await fetch(`${targetBase}/api/key`, { headers });
    if (!keyRes.ok) {
      return jsonResponse({ error: "Backend key unavailable." }, 502);
    }

    const serverKey = await crypto.subtle.importKey(
      "spki",
      fromBase64((await keyRes.json()).public_key_b64),
      { name: "ECDH", namedCurve: "P-256" },
      false,
      []
    );

    // Same scheme as public/js/chat.js: ECDH -> HKDF -> AES-GCM.
    const clientKeys = await crypto.subtle.generateKey(
      { name: "ECDH", namedCurve: "P-256" },
      true,
      ["deriveBits"]
    );
    const sharedBits = await crypto.subtle.deriveBits(
      { name: "ECDH", public: serverKey },
      clientKeys.privateKey,
      256
    );
    const hkdfKey = await crypto.subtle.importKey("raw", sharedBits, "HKDF", false, ["deriveKey"]);
    const aesKey = await crypto.subtle.deriveKey(
      {
        name: "HKDF",
        hash: "SHA-256",
        salt: new Uint8Array(0),
        info: new TextEncoder().encode("e2ee-ai-chat")
      },
      hkdfKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      aesKey,
      new TextEncoder().encode(JSON.stringify(payload))
    );
    const combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(ciphertext), iv.length);

    const backendRes = await fetch(`${targetBase}/api/generate`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        client_pub_b64: toBase64(await crypto.subtle.exportKey("spki", clientKeys.publicKey)),
        ciphertext_b64: toBase64(combined)
      })
    });

    if (!backendRes.ok) {
      return jsonResponse({ error: "Backend error.", status: backendRes.status }, 502);
    }

    const encrypted = fromBase64((await backendRes.json()).ciphertext_b64);
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: encrypted.slice(0, 12) },
      aesKey,
      encrypted.slice(12)
    );

    return jsonResponse({ response: new TextDecoder().decode(decrypted) });
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : String(error) },
      500
    );
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathname = normalizePath(url.pathname);

    // API routes must be handled by the Worker first.
    if (pathname === "/api/key") {
      if (!env.NGROK_URL) {
        return jsonResponse(
          { error: "NGROK_URL is not configured." },
          500
        );
      }

      return handleKey(request, env);
    }

    if (pathname === "/api/v1/chat") {
      if (!env.NGROK_URL) {
        return jsonResponse(
          { error: "NGROK_URL is not configured." },
          500
        );
      }

      return handleApiChat(request, env);
    }

    if (pathname === "/api/chat") {
      if (!env.NGROK_URL) {
        return jsonResponse(
          { error: "NGROK_URL is not configured." },
          500
        );
      }

      return handleChat(request, env);
    }

    // Keep / and /chat clean even when the browser requests a trailing slash.
    if (request.method === "GET" && pathname === "/") {
      return env.ASSETS.fetch(new Request(new URL("/index.html", url), request));
    }

    if (request.method === "GET" && pathname === "/chat") {
      return env.ASSETS.fetch(new Request(new URL("/chat.html", url), request));
    }

    return new Response("Not Found", {
      status: 404,
      headers: {
        "Content-Type": "text/plain; charset=UTF-8"
      }
    });
  }
};
