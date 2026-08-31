/**
 * Glagon - Secure AI Chat (E2EE)
 * AI Forwarding Worker
 */

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Glagon - Secure E2EE Chat</title>
  <style>
    :root {
      --bg-color: #0a0a0c;
      --text-main: #e2e2e2;
      --text-muted: #888888;
      --glass-bg: rgba(255, 255, 255, 0.04);
      --glass-border: rgba(255, 255, 255, 0.08);
      --glass-hover: rgba(255, 255, 255, 0.08);
      --accent: rgba(255, 255, 255, 0.8);
      --radius: 12px;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: var(--bg-color);
      color: var(--text-main);
      display: flex;
      justify-content: center;
      height: 100vh;
      overflow: hidden;
    }

    /* 레이아웃 */
    .app-container {
      display: flex;
      flex-direction: column;
      width: 100%;
      max-width: 800px;
      height: 100%;
      padding: 20px;
    }

    /* 헤더 */
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 15px;
      border-bottom: 1px solid var(--glass-border);
      margin-bottom: 20px;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    h1 {
      font-size: 1.5rem;
      font-weight: 600;
      letter-spacing: 1px;
    }

    .open-source-tag {
      font-size: 0.7rem;
      padding: 2px 6px;
      background: var(--glass-bg);
      border: 1px solid var(--glass-border);
      border-radius: 4px;
      color: var(--text-muted);
    }

    .status-badge {
      font-size: 0.85rem;
      padding: 6px 12px;
      border-radius: 20px;
      background: var(--glass-bg);
      border: 1px solid var(--glass-border);
      color: var(--text-muted);
      display: flex;
      align-items: center;
      gap: 6px;
      transition: color 0.3s ease;
    }
    .status-badge.ready { color: #4ade80; }
    .status-badge.error { color: #f87171; }

    /* 채팅 영역 */
    .chat-container {
      flex: 1;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 16px;
      padding-right: 5px;
      margin-bottom: 20px;
    }

    /* 스크롤바 커스텀 */
    .chat-container::-webkit-scrollbar { width: 6px; }
    .chat-container::-webkit-scrollbar-track { background: transparent; }
    .chat-container::-webkit-scrollbar-thumb { background: var(--glass-border); border-radius: 3px; }

    .message {
      max-width: 85%;
      padding: 14px 18px;
      border-radius: var(--radius);
      line-height: 1.5;
      font-size: 0.95rem;
      word-wrap: break-word;
      white-space: pre-wrap;
    }

    .message.system {
      align-self: center;
      background: transparent;
      color: var(--text-muted);
      font-size: 0.85rem;
      padding: 5px;
    }

    .message.user {
      align-self: flex-end;
      background: var(--glass-bg);
      border: 1px solid var(--glass-border);
    }

    .message.ai {
      align-self: flex-start;
      background: rgba(0, 0, 0, 0.2);
      border: 1px solid var(--glass-border);
    }

    /* 입력 영역 (Glass Effect) */
    .input-wrapper {
      background: var(--glass-bg);
      border: 1px solid var(--glass-border);
      backdrop-filter: blur(10px);
      border-radius: var(--radius);
      padding: 12px;
      display: flex;
      gap: 10px;
      align-items: flex-end;
    }

    textarea {
      flex: 1;
      background: transparent;
      border: none;
      color: var(--text-main);
      font-family: inherit;
      font-size: 1rem;
      resize: none;
      min-height: 24px;
      max-height: 150px;
      padding: 8px;
      outline: none;
    }
    
    textarea::placeholder {
      color: var(--text-muted);
    }

    button {
      background: var(--glass-bg);
      border: 1px solid var(--glass-border);
      color: var(--text-main);
      width: 42px;
      height: 42px;
      border-radius: 8px;
      cursor: pointer;
      display: flex;
      justify-content: center;
      align-items: center;
      transition: all 0.2s;
    }

    button svg {
      fill: var(--text-main);
      width: 18px;
      height: 18px;
      transition: fill 0.2s;
    }

    button:hover:not(:disabled) {
      background: var(--glass-hover);
      border-color: var(--accent);
    }

    button:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
  </style>
</head>
<body>
  <div class="app-container">
    <header>
      <div class="brand">
        <h1>Glagon</h1>
        <span class="open-source-tag">OSS</span>
      </div>
      <div id="statusBadge" class="status-badge">
        <span id="statusIcon">⚪</span> <span id="statusText">Connecting...</span>
      </div>
    </header>

    <div class="chat-container" id="chatLog">
      <div class="message system">Establishing E2EE secure connection...</div>
    </div>

    <div class="input-wrapper">
      <textarea id="prompt" rows="1" placeholder="Type a message to Glagon..."></textarea>
      <button id="sendBtn" disabled>
        <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
      </button>
    </div>
  </div>

  <script>
    const chatLog = document.getElementById("chatLog");
    const statusText = document.getElementById("statusText");
    const statusIcon = document.getElementById("statusIcon");
    const statusBadge = document.getElementById("statusBadge");
    const promptEl = document.getElementById("prompt");
    const sendBtn = document.getElementById("sendBtn");

    let serverPublicKey = null;

    // --- UI 헬퍼 함수 ---
    function updateStatus(text, state) {
      statusText.textContent = text;
      statusBadge.className = 'status-badge ' + state;
      if (state === 'ready') statusIcon.textContent = '🔒';
      else if (state === 'error') statusIcon.textContent = '⚠️';
      else statusIcon.textContent = '⚪';
    }

    function addMessage(role, text) {
      const msgDiv = document.createElement("div");
      msgDiv.className = \`message \${role}\`;
      msgDiv.textContent = text;
      chatLog.appendChild(msgDiv);
      chatLog.scrollTop = chatLog.scrollHeight;
      return msgDiv; // 나중에 내용 수정(로딩 표시 등)을 위해 반환
    }

    // --- UX: 입력창 감지 및 자동 높이 조절 ---
    promptEl.addEventListener("input", function() {
      // 버튼 활성화/비활성화
      const isEmpty = this.value.trim().length === 0;
      sendBtn.disabled = isEmpty || !serverPublicKey;

      // Textarea 자동 높이 조절
      this.style.height = "auto";
      this.style.height = (this.scrollHeight < 150 ? this.scrollHeight : 150) + "px";
    });

    // --- 유틸리티 함수 ---
    function arrayBufferToBase64(buffer) {
      let binary = "";
      const bytes = new Uint8Array(buffer);
      for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
      return btoa(binary);
    }

    function base64ToArrayBuffer(base64) {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return bytes.buffer;
    }

    // --- E2EE 암호화 코어 ---
    async function initSecureSession() {
      try {
        const res = await fetch("/api/key");
        if (!res.ok) throw new Error("Failed to fetch server key");
        const data = await res.json();
        
        const serverKeyBuffer = base64ToArrayBuffer(data.public_key_b64);
        serverPublicKey = await window.crypto.subtle.importKey(
          "spki", serverKeyBuffer, { name: "ECDH", namedCurve: "P-256" }, true, []
        );
        
        updateStatus("E2EE Active", "ready");
        
        // 입력창에 내용이 있으면 버튼 활성화
        if (promptEl.value.trim().length > 0) {
          sendBtn.disabled = false;
        }
      } catch (e) {
        updateStatus("Connection Error", "error");
        addMessage("system", "Failed to connect to the secure server.");
      }
    }

    async function sendPrompt() {
      const promptText = promptEl.value.trim();
      if (!promptText || !serverPublicKey) return;

      // UI 처리: 사용자 메시지 추가 및 입력창 초기화
      addMessage("user", promptText);
      promptEl.value = "";
      promptEl.style.height = "auto"; // 높이 초기화
      sendBtn.disabled = true;
      promptEl.disabled = true;

      const loadingMsg = addMessage("system", "Encrypting & Sending...");

      try {
        // 1. 브라우저 임시 KeyPair 생성
        const clientKeyPair = await window.crypto.subtle.generateKey(
          { name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]
        );
        
        // 2. 클라이언트 공개키 추출
        const clientPubBuffer = await window.crypto.subtle.exportKey("spki", clientKeyPair.publicKey);
        const clientPubB64 = arrayBufferToBase64(clientPubBuffer);

        // 3. Shared Secret 도출 -> HKDF -> AES-GCM Key 생성
        const sharedBits = await window.crypto.subtle.deriveBits(
          { name: "ECDH", public: serverPublicKey }, clientKeyPair.privateKey, 256
        );
        
        const hkdfKey = await window.crypto.subtle.importKey("raw", sharedBits, "HKDF", false, ["deriveKey"]);
        const aesKey = await window.crypto.subtle.deriveKey(
          { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: new TextEncoder().encode("e2ee-ai-chat") },
          hkdfKey, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
        );

        // 4. 데이터 암호화 (IV + Ciphertext)
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const encodedPrompt = new TextEncoder().encode(JSON.stringify({ prompt: promptText }));
        const ciphertextBuffer = await window.crypto.subtle.encrypt(
          { name: "AES-GCM", iv: iv }, aesKey, encodedPrompt
        );
        
        const combined = new Uint8Array(iv.length + ciphertextBuffer.byteLength);
        combined.set(iv, 0);
        combined.set(new Uint8Array(ciphertextBuffer), iv.length);
        const ciphertextB64 = arrayBufferToBase64(combined);

        // 5. 서버로 전송
        loadingMsg.textContent = "Waiting for response...";
        
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ client_pub_b64: clientPubB64, ciphertext_b64: ciphertextB64 })
        });

        if (!response.ok) throw new Error(await response.text());
        const respData = await response.json();

        // 6. 서버 응답 복호화
        const encRespBuffer = base64ToArrayBuffer(respData.ciphertext_b64);
        const respIv = new Uint8Array(encRespBuffer.slice(0, 12));
        const respCiphertext = new Uint8Array(encRespBuffer.slice(12));
        
        const decryptedBuffer = await window.crypto.subtle.decrypt(
          { name: "AES-GCM", iv: respIv }, aesKey, respCiphertext
        );
        
        loadingMsg.remove(); // 로딩 메시지 제거
        addMessage("ai", new TextDecoder().decode(decryptedBuffer));
        
      } catch (error) {
        loadingMsg.textContent = "Error: " + error.message;
        console.error(error);
      } finally {
        promptEl.disabled = false;
        promptEl.focus();
        // 입력창 내용이 있으면 버튼 다시 활성화
        sendBtn.disabled = promptEl.value.trim().length === 0;
      }
    }

    // 초기화 및 이벤트 리스너
    initSecureSession();

    sendBtn.addEventListener("click", sendPrompt);
    promptEl.addEventListener("keydown", function(e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendPrompt();
      }
    });
  </script>
</body>
</html>`;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // HTML UI 서빙
    if (url.pathname === "/") {
      return new Response(html, { headers: { "Content-Type": "text/html;charset=UTF-8" } });
    }

    // NGROK 환경변수 체크 (공통)
    if (!env.NGROK_URL) {
      return new Response("NGROK_URL 환경변수가 설정되지 않았습니다.", { status: 500 });
    }
    const targetBase = env.NGROK_URL.trim().replace(/\/$/, "");

    // 공개키 요청 중계 (GET)
    if (url.pathname === "/api/key" && request.method === "GET") {
      try {
        const backendRes = await fetch(`${targetBase}/api/key`, { headers: { "ngrok-skip-browser-warning": "true" } });
        const text = await backendRes.text();
        return new Response(text, { status: backendRes.status, headers: { "Content-Type": "application/json" } });
      } catch (e) {
        return new Response(e.message, { status: 500 });
      }
    }

    // 암호화된 채팅 데이터 중계 (POST)
    if (url.pathname === "/api/chat" && request.method === "POST") {
      try {
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
        return new Response(resText, { status: backendRes.status, headers: { "Content-Type": "application/json" } });
      } catch (e) {
        return new Response(e.message, { status: 500 });
      }
    }

    return new Response("Not Found", { status: 404 });
  }
};