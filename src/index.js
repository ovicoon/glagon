/**
 * Glagon - Cloudflare Worker
 *
 * Routes:
 *   /        -> static landing page
 *   /chat    -> static chat page
 *   /api/key -> proxy backend public key
 *   /api/chat -> proxy encrypted chat request
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
