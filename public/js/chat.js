const chatLog = document.getElementById("chatLog");
const statusText = document.getElementById("statusText");
const statusBadge = document.getElementById("statusBadge");
const promptEl = document.getElementById("prompt");
const sendBtn = document.getElementById("sendBtn");

const termsBtn = document.getElementById("termsBtn");
const termsModal = document.getElementById("termsModal");
const termsClose = document.getElementById("termsClose");

let serverPublicKey = null;

function updateStatus(text, state = "") {
  statusText.textContent = text.toUpperCase();
  statusBadge.className = `status-badge ${state}`.trim();
}

function updateSendButton() {
  sendBtn.disabled =
    promptEl.value.trim().length === 0 ||
    !serverPublicKey ||
    promptEl.disabled;
}

function addMessage(role, text) {
  const msgDiv = document.createElement("div");
  msgDiv.className = `message ${role}`;
  msgDiv.textContent = text;
  chatLog.appendChild(msgDiv);
  chatLog.scrollTop = chatLog.scrollHeight;
  return msgDiv;
}

function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);

  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }

  return btoa(binary);
}

function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes.buffer;
}

async function initSecureSession() {
  try {
    const res = await fetch("/api/key", {
      method: "GET",
      headers: { Accept: "application/json" }
    });

    if (!res.ok) {
      throw new Error("Failed to fetch server key");
    }

    const data = await res.json();
    const serverKeyBuffer = base64ToArrayBuffer(data.public_key_b64);

    serverPublicKey = await window.crypto.subtle.importKey(
      "spki",
      serverKeyBuffer,
      { name: "ECDH", namedCurve: "P-256" },
      true,
      []
    );

    updateStatus("E2EE Active", "ready");
    updateSendButton();
  } catch (error) {
    serverPublicKey = null;
    updateStatus("Connection Error", "error");
    updateSendButton();
    console.error(error);
  }
}

async function sendPrompt() {
  const promptText = promptEl.value.trim();

  if (!promptText || !serverPublicKey) {
    return;
  }

  addMessage("user", promptText);

  promptEl.value = "";
  promptEl.style.height = "auto";
  promptEl.disabled = true;
  updateSendButton();
  updateStatus("Processing...", "ready");

  try {
    // 1. Generate a temporary browser key pair.
    const clientKeyPair = await window.crypto.subtle.generateKey(
      { name: "ECDH", namedCurve: "P-256" },
      true,
      ["deriveBits"]
    );

    // 2. Export the client public key.
    const clientPubBuffer = await window.crypto.subtle.exportKey(
      "spki",
      clientKeyPair.publicKey
    );

    const clientPubB64 = arrayBufferToBase64(clientPubBuffer);

    // 3. Shared secret -> HKDF -> AES-GCM key.
    const sharedBits = await window.crypto.subtle.deriveBits(
      {
        name: "ECDH",
        public: serverPublicKey
      },
      clientKeyPair.privateKey,
      256
    );

    const hkdfKey = await window.crypto.subtle.importKey(
      "raw",
      sharedBits,
      "HKDF",
      false,
      ["deriveKey"]
    );

    const aesKey = await window.crypto.subtle.deriveKey(
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

    // 4. Encrypt the prompt.
    const iv = window.crypto.getRandomValues(new Uint8Array(12));

    const payloadData = {
      prompt: promptText,
      system: "You are Glagon, made by Zero Dragaon.",
      temperature: 0.1,
      top_p: 0.9
    };

    const encodedPrompt = new TextEncoder().encode(
      JSON.stringify(payloadData)
    );

    const ciphertextBuffer = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      aesKey,
      encodedPrompt
    );

    const combined = new Uint8Array(
      iv.length + ciphertextBuffer.byteLength
    );

    combined.set(iv, 0);
    combined.set(new Uint8Array(ciphertextBuffer), iv.length);

    const ciphertextB64 = arrayBufferToBase64(combined);

    // 5. Send the encrypted payload to the Worker.
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        client_pub_b64: clientPubB64,
        ciphertext_b64: ciphertextB64
      })
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    const respData = await response.json();

    // 6. Decrypt the server response.
    const encRespBuffer = base64ToArrayBuffer(
      respData.ciphertext_b64
    );

    const respIv = new Uint8Array(
      encRespBuffer.slice(0, 12)
    );

    const respCiphertext = new Uint8Array(
      encRespBuffer.slice(12)
    );

    const decryptedBuffer = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: respIv },
      aesKey,
      respCiphertext
    );

    addMessage(
      "ai",
      new TextDecoder().decode(decryptedBuffer)
    );

    updateStatus("E2EE Active", "ready");
  } catch (error) {
    updateStatus("Connection Error", "error");
    console.error(error);
  } finally {
    promptEl.disabled = false;
    promptEl.focus();
    updateSendButton();
  }
}

function closeTerms() {
  termsModal.classList.remove("open");
  termsModal.setAttribute("aria-hidden", "true");
}

promptEl.addEventListener("input", function () {
  this.style.height = "auto";
  this.style.height = `${Math.min(this.scrollHeight, 150)}px`;
  updateSendButton();
});

promptEl.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendPrompt();
  }
});

sendBtn.addEventListener("click", sendPrompt);

termsBtn.addEventListener("click", () => {
  termsModal.classList.add("open");
  termsModal.setAttribute("aria-hidden", "false");
});

termsClose.addEventListener("click", closeTerms);

termsModal.addEventListener("click", (event) => {
  if (event.target === termsModal) {
    closeTerms();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && termsModal.classList.contains("open")) {
    closeTerms();
  }
});

initSecureSession();
