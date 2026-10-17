"""Official Sign in with ChatGPT public-client flow; local credentials only."""
from __future__ import annotations

import asyncio
import hashlib
import json
import os
import secrets
import subprocess
import time
import uuid
from pathlib import Path
from urllib.parse import urlencode, urlparse

import httpx
import jwt

AUTH = "https://auth.openai.com"
RESOURCE = "https://api.openai.com/v1"
ORIGIN = "http://127.0.0.1:8000"
CALLBACK = ORIGIN + "/auth/callback"
ROOT = Path(__file__).resolve().parent


class AuthError(Exception):
    def __init__(self, message: str, status: int = 400, code: str = "auth_error"):
        super().__init__(message)
        self.message, self.status, self.code = message, status, code


class ChatGPTAuth:
    def __init__(self):
        self.folder = ROOT / ".local"
        self.file = self.folder / "chatgpt-auth.json"
        self.record = {"host_id": "urn:uuid:" + str(uuid.uuid4()), "accounts": [], "active": None}
        self.pending = {}
        self.lock = asyncio.Lock()
        self.metadata = None
        self.auth_error = None
        self.protected = False
        try:
            saved = json.loads(self.file.read_text("utf-8"))
            if saved.get("host_id") and isinstance(saved.get("accounts"), list):
                self.record = saved
        except FileNotFoundError:
            pass
        except (ValueError, OSError):
            self.auth_error = "The saved connection could not be loaded. Please sign in again."

    @property
    def active(self):
        return next((item for item in self.record["accounts"] if item["id"] == self.record["active"]), None)

    def save(self):
        self.folder.mkdir(mode=0o700, exist_ok=True)
        if not self.protected:
            if os.name == "nt":
                identity = os.environ.get("USERDOMAIN", "") + "\\" + os.environ.get("USERNAME", "")
                try:
                    subprocess.run(["icacls.exe", str(self.folder), "/inheritance:r", "/grant:r",
                                    identity + ":(OI)(CI)F", "SYSTEM:(OI)(CI)F"],
                                   check=True, timeout=10, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                   creationflags=subprocess.CREATE_NO_WINDOW)
                except (OSError, subprocess.SubprocessError):
                    raise AuthError("Could not protect local sign-in storage. Check the project folder permissions.", 500, "credential_storage") from None
            else:
                self.folder.chmod(0o700)
            self.protected = True
        temporary = self.folder / ("auth-" + secrets.token_hex(8) + ".tmp")
        with os.fdopen(os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "w", encoding="utf-8") as handle:
            json.dump(self.record, handle)
        temporary.replace(self.file)

    async def _json(self, url, **kwargs):
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                response = await client.request("POST" if "data" in kwargs else "GET", url, **kwargs)
            payload = response.json()
        except (httpx.HTTPError, ValueError):
            raise AuthError("Could not reach ChatGPT sign-in. Check your connection and try again.", 502, "connection_error") from None
        if response.status_code >= 400:
            code = payload.get("error", "")
            code = code if isinstance(code, str) else code.get("code", "")
            if code == "invalid_grant":
                raise AuthError("This sign-in expired. Continue with ChatGPT again.", 401, "sign_in_required")
            if response.status_code == 429:
                raise AuthError("ChatGPT sign-in is busy. Wait briefly and try again.", 429, "rate_limit")
            raise AuthError("ChatGPT did not complete sign-in. Please try again and allow plan usage.", 401, "sign_in_failed")
        return payload

    async def discovery(self):
        if not self.metadata:
            self.metadata = await self._json(AUTH + "/.well-known/openid-configuration")
        if self.metadata.get("issuer") != AUTH or urlparse(self.metadata.get("jwks_uri", "")).netloc != "auth.openai.com":
            raise AuthError("ChatGPT's identity configuration could not be verified.", 502, "identity_error")
        return self.metadata

    async def validate_token(self, token, client_id, nonce=None, previous=None):
        try:
            header = jwt.get_unverified_header(token)
            if header.get("alg") not in ("RS256", "ES256"):
                raise ValueError()
            metadata = await self.discovery()
            keys = await self._json(metadata["jwks_uri"])
            key = next(item for item in keys["keys"] if item.get("kid") == header.get("kid")
                       and item.get("use", "sig") == "sig" and item.get("alg", header["alg"]) == header["alg"])
            claims = jwt.decode(token, jwt.PyJWK.from_dict(key).key, algorithms=[header["alg"]],
                                audience=client_id, issuer=AUTH, leeway=30,
                                options={"require": ["exp", "iss", "aud", "sub"]})
            if nonce and not secrets.compare_digest(str(claims.get("nonce", "")), nonce):
                raise ValueError()
            if isinstance(claims["aud"], list) and len(claims["aud"]) > 1 and claims.get("azp") != client_id:
                raise ValueError()
            if previous and (previous["subject"] != claims["sub"] or previous["issuer"] != claims["iss"]):
                raise AuthError("That is a different ChatGPT account. Choose Add account to connect it.", 401, "account_mismatch")
            return claims
        except AuthError:
            raise
        except (ValueError, KeyError, StopIteration, jwt.PyJWTError, TypeError):
            raise AuthError("The ChatGPT identity could not be verified. Please sign in again.", 401, "identity_error") from None

    def start(self, account_id=None):
        previous = None if account_id == "new" else next((item for item in self.record["accounts"] if item["id"] == account_id), self.active)
        state, nonce, verifier, cookie = [secrets.token_urlsafe(32) for _ in range(4)]
        self.pending = {key: item for key, item in self.pending.items() if time.time() - item["created"] < 600}
        self.pending[state] = {"nonce": nonce, "verifier": verifier, "cookie": cookie, "previous": previous, "created": time.time()}
        self.save()
        import base64
        challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
        params = {"client_id": previous["client_id"] if previous else "dynamic_agent_client",
                  "ext_agent_host_id": self.record["host_id"], "response_type": "code", "redirect_uri": CALLBACK,
                  "scope": "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct",
                  "resource": RESOURCE, "state": state, "nonce": nonce,
                  "code_challenge_method": "S256", "code_challenge": challenge}
        if previous:
            if previous.get("id_token"):
                params["id_token_hint"] = previous["id_token"]
            if previous.get("email"):
                params["login_hint"] = previous["email"]
        else:
            params["agent_name_hint"] = "Margin"
        return AUTH + "/api/accounts/authorize?" + urlencode(params), cookie

    async def finish(self, params, cookie):
        attempt = self.pending.pop(params.get("state", ""), None)
        if not attempt or not cookie or not secrets.compare_digest(attempt["cookie"], cookie) or time.time() - attempt["created"] > 600:
            raise AuthError("This sign-in attempt expired. Continue with ChatGPT again.", 400, "invalid_state")
        if params.get("error"):
            raise AuthError("ChatGPT sign-in was cancelled or plan usage was not allowed. You can try again.", 403, "access_denied")
        previous = attempt["previous"]
        client_id = params.get("client_id") or (previous or {}).get("client_id")
        if not client_id or client_id == "dynamic_agent_client" or (previous and previous["client_id"] != client_id):
            raise AuthError("ChatGPT registration did not finish. Please try again.", 400, "registration_incomplete")
        if not params.get("code"):
            raise AuthError("No authorization code was returned. Please sign in again.", 400)
        token = await self._json(AUTH + "/api/accounts/oauth/token", data={"grant_type": "authorization_code",
                                "client_id": client_id, "code": params["code"], "code_verifier": attempt["verifier"],
                                "redirect_uri": CALLBACK, "resource": RESOURCE})
        claims = await self.validate_token(token.get("id_token"), client_id, attempt["nonce"], previous)
        granted = token.get("scope", "").split()
        if "chatgpt.tokens.use.direct" not in granted:
            raise AuthError("Allow Margin to use your ChatGPT plan during sign-in to enable the tutor.", 403, "plan_permission_missing")
        if not token.get("access_token") or token.get("token_type", "Bearer").lower() != "bearer":
            raise AuthError("ChatGPT did not return a usable connection.", 401)
        account = {"id": hashlib.sha256((claims["iss"] + "|" + claims["sub"] + "|" + client_id).encode()).hexdigest()[:24],
                   "issuer": claims["iss"], "subject": claims["sub"], "email": claims.get("email"), "name": claims.get("name"),
                   "client_id": client_id, "access_token": token["access_token"], "id_token": token["id_token"],
                   "refresh_token": token.get("refresh_token"), "scopes": granted,
                   "expires_at": time.time() + token.get("expires_in", 3600)}
        self.record["accounts"] = [item for item in self.record["accounts"] if item["id"] != account["id"]] + [account]
        self.record["active"] = account["id"]
        self.save()
        self.auth_error = None

    async def credential(self):
        account = self.active
        if not account or not account.get("access_token"):
            return None
        async with self.lock:
            if account.get("expires_at", 0) < time.time() + 60:
                if not account.get("refresh_token"):
                    raise AuthError("Your ChatGPT connection expired. Please sign in again.", 401, "sign_in_required")
                token = await self._json(AUTH + "/api/accounts/oauth/token", data={"grant_type": "refresh_token",
                                        "client_id": account["client_id"], "refresh_token": account["refresh_token"], "resource": RESOURCE})
                if token.get("id_token"):
                    await self.validate_token(token["id_token"], account["client_id"], previous=account)
                if not token.get("access_token") or (token.get("scope") and "chatgpt.tokens.use.direct" not in token["scope"].split()):
                    raise AuthError("ChatGPT plan usage is no longer enabled. Please sign in again.", 401, "sign_in_required")
                account.update(access_token=token["access_token"], refresh_token=token.get("refresh_token", account["refresh_token"]),
                               id_token=token.get("id_token", account.get("id_token")), expires_at=time.time() + token.get("expires_in", 3600))
                self.save()
        return {"token": account["access_token"], "identity": account["id"]}

    def status(self):
        account = self.active
        return {"connected": bool(account and account.get("access_token")), "provider": "chatgpt" if account and account.get("access_token") else None,
                "account": {"id": account["id"], "email": account.get("email"), "name": account.get("name")} if account else None,
                "accounts": [{"id": item["id"], "label": item.get("email") or item.get("name") or "ChatGPT account", "active": item["id"] == self.record["active"]} for item in self.record["accounts"]],
                "authError": self.auth_error}

    async def logout(self):
        account, revoked = self.active, True
        if account and account.get("refresh_token"):
            try:
                metadata = await self.discovery()
                endpoint = metadata.get("revocation_endpoint", "")
                if urlparse(endpoint).netloc != "auth.openai.com":
                    raise ValueError()
                async with httpx.AsyncClient(timeout=10) as client:
                    response = await client.post(endpoint, data={"token": account["refresh_token"], "token_type_hint": "refresh_token", "client_id": account["client_id"]})
                    revoked = response.is_success
            except (AuthError, httpx.HTTPError, ValueError):
                revoked = False
        if account:
            for key in ("access_token", "refresh_token", "id_token", "expires_at"):
                account.pop(key, None)
        self.save()
        self.auth_error = None if revoked else "Signed out locally. Remote revocation was not confirmed; disconnect Margin in ChatGPT Settings if needed."
        return {**self.status(), "revoked": revoked}


chatgpt = ChatGPTAuth()
