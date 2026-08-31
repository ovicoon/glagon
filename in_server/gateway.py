# This file should be placed with ngrok-auto.bat
import base64
import json
import os
import traceback
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
import httpx

from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

load_dotenv()

app = FastAPI()
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434").rstrip("/")

# --- 서버 구동 시 영구적인(메모리 상) ECDH 키 페어 생성 ---
server_private_key = ec.generate_private_key(ec.SECP256R1())
server_public_key = server_private_key.public_key()

# 브라우저 WebCrypto(SPKI) 포맷과 호환되도록 DER 포맷으로 추출
server_pub_der = server_public_key.public_bytes(
    encoding=serialization.Encoding.DER,
    format=serialization.PublicFormat.SubjectPublicKeyInfo,
)
server_pub_b64 = base64.b64encode(server_pub_der).decode("utf-8")


def get_aesgcm_for_session(client_pub_b64: str) -> AESGCM:
    """클라이언트 공개키를 기반으로 공유 비밀과 AES-GCM 객체를 생성"""
    client_pub_der = base64.b64decode(client_pub_b64)
    client_public_key = serialization.load_der_public_key(client_pub_der)

    # 1. Diffie-Hellman 키 교환 (공유 비밀 생성)
    shared_secret = server_private_key.exchange(ec.ECDH(), client_public_key)

    # 2. HKDF를 사용하여 256-bit AES 키 파생 (브라우저 로직과 정확히 일치해야 함)
    derived_key = HKDF(
        algorithm=hashes.SHA256(),
        length=32,
        salt=b"",  # 브라우저의 new Uint8Array(0)과 동일
        info=b"e2ee-ai-chat",
    ).derive(shared_secret)

    return AESGCM(derived_key)


@app.get("/api/key")
async def get_public_key():
    """브라우저가 세션을 시작할 때 서버의 공개키를 요청하는 엔드포인트"""
    return JSONResponse({"public_key_b64": server_pub_b64})


@app.post("/api/generate")
async def proxy_generate(request: Request):
    try:
        body = await request.json()
        client_pub_b64 = body.get("client_pub_b64")
        ciphertext_b64 = body.get("ciphertext_b64")

        if not client_pub_b64 or not ciphertext_b64:
            raise ValueError("필수 암호화 파라미터 누락")

        # 1. 암호화 객체 생성 및 복호화
        aesgcm = get_aesgcm_for_session(client_pub_b64)

        enc_data = base64.b64decode(ciphertext_b64)
        nonce = enc_data[:12]
        ciphertext = enc_data[12:]
        decrypted_bytes = aesgcm.decrypt(nonce, ciphertext, None)
        decrypted_payload = decrypted_bytes.decode("utf-8")

        # 2. JSON 파싱 및 Ollama 프롬프트 구성
        try:
            payload_data = json.loads(decrypted_payload)
        except json.JSONDecodeError:
            payload_data = {"prompt": decrypted_payload}

        if not payload_data.get("model"):
            payload_data["model"] = "ministral-3:3b"
        payload_data["stream"] = False

        # 3. Ollama 백엔드 호출
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{OLLAMA_URL}/api/generate",
                json=payload_data,
                headers={"Content-Type": "application/json"},
                timeout=60.0,
            )

        if response.status_code != 200:
            raise Exception(f"Ollama Error ({response.status_code}): {response.text}")

        # 4. Ollama 응답 텍스트 정제
        raw_text = response.text
        final_answer = ""
        try:
            res_json = response.json()
            final_answer = res_json.get("response", raw_text)
        except Exception:
            for line in raw_text.strip().split("\n"):
                if line.strip():
                    try:
                        item = json.loads(line)
                        final_answer += item.get("response", "")
                    except json.JSONDecodeError:
                        pass
        if not final_answer:
            final_answer = raw_text

        # 5. 동일한 세션 키로 답변 암호화
        resp_nonce = os.urandom(12)
        resp_ciphertext = aesgcm.encrypt(resp_nonce, final_answer.encode("utf-8"), None)
        resp_encrypted_b64 = base64.b64encode(resp_nonce + resp_ciphertext).decode(
            "utf-8"
        )

        # 6. 브라우저로 암호문 반환
        return JSONResponse({"ciphertext_b64": resp_encrypted_b64})

    except Exception as e:
        print(f"[E2EE Proxy Error]: {type(e).__name__} - {e}")
        traceback.print_exc()
        raise HTTPException(status_code=400, detail=str(e))
