"use strict";

const express = require("express");
const { BillingError } = require("./billing-core.cjs");

function safeJson(value) {
  return value == null ? null : JSON.parse(JSON.stringify(value));
}

function parseCookies(header) {
  const result = {};
  for (const item of String(header || "").split(";")) {
    const index = item.indexOf("=");
    if (index <= 0) continue;
    const key = item.slice(0, index).trim();
    const value = item.slice(index + 1).trim();
    try { result[key] = decodeURIComponent(value); } catch { result[key] = value; }
  }
  return result;
}

function bearerToken(request) {
  return String(request.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
}

function sessionToken(request) {
  return bearerToken(request) || parseCookies(request.headers.cookie).nexora_cloud_session || "";
}

function setSessionCookie(response, token, maxAgeSeconds = 12 * 60 * 60) {
  response.setHeader("Set-Cookie", `nexora_cloud_session=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.max(0, Math.trunc(maxAgeSeconds))}`);
}

function clearSessionCookie(response) {
  response.setHeader("Set-Cookie", "nexora_cloud_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0");
}

function htmlEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function authorizeHtml({ flow, error = "", mfa = false, email = "" }) {
  const title = mfa ? "Подтвердите второй фактор" : "Подключить Cloud Account";
  const detail = mfa
    ? "Введите код из приложения-аутентификатора или одноразовый recovery code."
    : "Войдите в Nexora Cloud. Local Server получит только идентификатор аккаунта и подписанное подтверждение связи.";
  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${htmlEscape(title)} · Nexora</title>
<style>
:root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,sans-serif;background:#07060b;color:#f6f1ff}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:radial-gradient(circle at 20% 0,#49236d55,transparent 42%),radial-gradient(circle at 90% 80%,#562b8055,transparent 44%),#07060b;padding:24px}
main{width:min(100%,460px);border:1px solid #ffffff18;border-radius:28px;padding:32px;background:linear-gradient(155deg,#17111fef,#0d0a13f5);box-shadow:0 28px 90px #0009;backdrop-filter:blur(24px)}
.brand{display:flex;align-items:center;gap:12px;color:#c89cff;font-weight:800;letter-spacing:.12em}.orb{width:34px;height:34px;border-radius:13px;background:linear-gradient(135deg,#b86cff,#6b39ff);box-shadow:0 0 38px #9a53ff88}
h1{font-size:30px;line-height:1.05;margin:28px 0 12px}p{color:#b7adc5;line-height:1.55;margin:0 0 24px}.error{padding:12px 14px;border-radius:14px;background:#ff58731a;border:1px solid #ff6c8460;color:#ffc1cb;margin-bottom:16px}
label{display:grid;gap:8px;margin:15px 0;color:#d9cfe5;font-size:13px;font-weight:700}input{width:100%;border:1px solid #ffffff20;border-radius:14px;background:#08060d;color:#fff;padding:14px 15px;font:inherit;outline:none}input:focus{border-color:#a96cff;box-shadow:0 0 0 3px #9c5cff22}
button{width:100%;border:0;border-radius:15px;padding:14px 18px;margin-top:10px;background:linear-gradient(135deg,#b66aff,#7650ff);color:#fff;font-weight:800;font-size:15px;cursor:pointer;box-shadow:0 12px 30px #7a43e744}small{display:block;color:#82778f;line-height:1.5;margin-top:18px}.scope{display:flex;gap:8px;flex-wrap:wrap;margin:16px 0}.scope span{font-size:11px;padding:7px 9px;border-radius:999px;background:#ffffff0c;border:1px solid #ffffff12;color:#c9bdd7}
</style></head><body><main>
<div class="brand"><span class="orb"></span>NEXORA CLOUD</div>
<h1>${htmlEscape(title)}</h1><p>${htmlEscape(detail)}</p>
<div class="scope"><span>Профиль</span><span>Связь с Local Server</span><span>Без доступа к сообщениям</span></div>
${error ? `<div class="error" role="alert">${htmlEscape(error)}</div>` : ""}
<form method="post" action="/v1/identity/browser-login" autocomplete="on">
<input type="hidden" name="flowId" value="${htmlEscape(flow.id)}"><input type="hidden" name="csrf" value="${htmlEscape(flow.csrf)}">
${mfa ? `<label>Код подтверждения<input name="mfaCode" inputmode="numeric" autocomplete="one-time-code" required autofocus></label>` : `<label>Email<input type="email" name="email" value="${htmlEscape(email)}" autocomplete="email" required autofocus></label><label>Пароль<input type="password" name="password" autocomplete="current-password" required></label>`}
<button type="submit">${mfa ? "Подтвердить" : "Продолжить"}</button>
</form><small>Пароль Cloud Account не передаётся Local Server. Связь можно отозвать в настройках Nexora.</small>
</main></body></html>`;
}

function completionHtml(result) {
  const params = new URLSearchParams();
  if (result.type === "link") {
    params.set("linkId", result.linkId);
    params.set("attestation", Buffer.from(JSON.stringify(result.attestation), "utf8").toString("base64url"));
  } else params.set("code", result.code);
  if (result.state) params.set("state", result.state);
  const target = `${result.redirectUri}${result.redirectUri.includes("?") ? "&" : "?"}${params.toString()}`;
  const escaped = htmlEscape(target);
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="0;url=${escaped}"><title>Связь подтверждена · Nexora</title><style>:root{color-scheme:dark;font-family:system-ui;background:#08060d;color:#fff}body{min-height:100vh;margin:0;display:grid;place-items:center;text-align:center;padding:24px}main{max-width:520px}a{color:#c997ff}</style></head><body><main><h1>Связь подтверждена</h1><p>Возвращаем вас в Nexora.</p><a href="${escaped}">Продолжить вручную</a></main><script>location.replace(${JSON.stringify(target)})</script></body></html>`;
}

function mountIdentityRoutes({ app, identity, log = () => {} }) {
  if (!app || !identity) throw new Error("Identity routes require app and identity service.");

  function requestId(request, response, next) {
    const incoming = String(request.headers["x-request-id"] || "").trim();
    request.identityRequestId = /^[A-Za-z0-9_.:-]{8,128}$/.test(incoming) ? incoming : globalThis.crypto.randomUUID();
    response.setHeader("X-Request-ID", request.identityRequestId);
    next();
  }

  function errorResponse(response, error) {
    const known = error instanceof BillingError;
    return response.status(known ? error.status : 500).json({
      ok: false,
      code: known ? error.code : "INTERNAL_ERROR",
      message: known ? error.message : "Временная ошибка Cloud Identity.",
      requestId: response.getHeader("X-Request-ID"),
      details: known ? safeJson(error.details || {}) : {},
    });
  }

  function asyncRoute(handler) {
    return async (request, response) => {
      try { await handler(request, response); } catch (error) {
        log(`Cloud Identity request failed: ${error.code || error.message}`, "warn");
        errorResponse(response, error);
      }
    };
  }

  app.use(requestId);
  const jsonBody = express.json({ limit: "64kb", strict: true });
  const formBody = express.urlencoded({ limit: "32kb", extended: false });

  app.post("/v1/identity/register", jsonBody, asyncRoute(async (request, response) => {
    const result = identity.register({
      email: request.body?.email,
      displayName: request.body?.displayName,
      password: request.body?.password,
      country: request.body?.country,
      ip: request.ip,
      userAgent: request.headers["user-agent"],
    });
    response.status(201).json({ ok: true, ...result, requestId: request.identityRequestId });
  }));

  app.post("/v1/identity/email/verify", jsonBody, asyncRoute(async (request, response) => {
    const account = identity.verifyEmail(request.body?.token);
    response.json({ ok: true, account, requestId: request.identityRequestId });
  }));

  app.post("/v1/identity/login", jsonBody, asyncRoute(async (request, response) => {
    const result = identity.login({ email: request.body?.email, password: request.body?.password, ip: request.ip, userAgent: request.headers["user-agent"] });
    setSessionCookie(response, result.session.token, Math.max(1, Math.floor((Date.parse(result.session.expiresAt) - Date.now()) / 1000)));
    response.json({ ok: true, ...result, requestId: request.identityRequestId });
  }));

  app.post("/v1/identity/mfa/verify", jsonBody, asyncRoute(async (request, response) => {
    const token = sessionToken(request);
    const result = identity.verifyMfaSession(token, request.body?.code);
    setSessionCookie(response, token);
    response.json({ ok: true, ...result, requestId: request.identityRequestId });
  }));

  app.get("/v1/identity/me", asyncRoute(async (request, response) => {
    const session = identity.sessionFromToken(sessionToken(request));
    response.json({ ok: true, account: { id: session.account_id, email: session.email, displayName: session.display_name, emailVerified: Boolean(session.email_verified_at), mfaEnabled: Boolean(session.mfa_enabled) }, requestId: request.identityRequestId });
  }));

  app.post("/v1/identity/mfa/enroll", jsonBody, asyncRoute(async (request, response) => {
    const result = identity.beginMfaEnrollment(sessionToken(request));
    response.status(201).json({ ok: true, ...result, requestId: request.identityRequestId });
  }));

  app.post("/v1/identity/mfa/confirm", jsonBody, asyncRoute(async (request, response) => {
    const result = identity.confirmMfaEnrollment(sessionToken(request), request.body?.code);
    response.json({ ok: true, ...result, requestId: request.identityRequestId });
  }));

  app.delete("/v1/identity/mfa", jsonBody, asyncRoute(async (request, response) => {
    const result = identity.disableMfa(sessionToken(request), request.body?.password);
    response.json({ ok: true, ...result, requestId: request.identityRequestId });
  }));

  app.post("/v1/identity/logout", jsonBody, asyncRoute(async (request, response) => {
    identity.logout(sessionToken(request));
    clearSessionCookie(response);
    response.json({ ok: true, requestId: request.identityRequestId });
  }));

  app.get("/v1/oauth/authorize", asyncRoute(async (request, response) => {
    if (request.query.response_type !== "code") throw new BillingError("Поддерживается только response_type=code.", "OAUTH_UNSUPPORTED_RESPONSE_TYPE", 400);
    const flow = identity.createBrowserFlow({
      clientId: request.query.client_id,
      redirectUri: request.query.redirect_uri,
      scopes: String(request.query.scope || "openid profile link:account").split(/\s+/),
      serverId: request.query.server_id,
      localUserId: request.query.local_user_id,
      linkId: request.query.link_id,
      nonce: request.query.nonce,
      state: request.query.state,
      codeChallenge: request.query.code_challenge,
      codeChallengeMethod: request.query.code_challenge_method,
    });
    response.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
    response.setHeader("Cache-Control", "no-store");
    const token = sessionToken(request);
    if (token) {
      try {
        const result = identity.completeBrowserFlow({ flowId: flow.id, csrf: flow.csrf, sessionToken: token });
        return response.type("html").send(completionHtml(result));
      } catch (error) {
        if (error.code !== "IDENTITY_SESSION_INVALID" && error.code !== "MFA_REQUIRED") throw error;
      }
    }
    response.type("html").send(authorizeHtml({ flow }));
  }));

  app.post("/v1/identity/browser-login", formBody, async (request, response) => {
    let flow;
    try {
      flow = identity.db.prepare("SELECT * FROM oauth_browser_flows WHERE id=?").get(String(request.body?.flowId || ""));
      if (!flow) throw new BillingError("Authorization flow не найден.", "OAUTH_FLOW_INVALID", 400);
      const flowView = { id: flow.id, csrf: String(request.body?.csrf || "") };
      let token = sessionToken(request);
      if (request.body?.mfaCode) {
        identity.verifyMfaSession(token, request.body.mfaCode);
      } else {
        const login = identity.login({ email: request.body?.email, password: request.body?.password, ip: request.ip, userAgent: request.headers["user-agent"] });
        token = login.session.token;
        setSessionCookie(response, token);
        if (login.mfaRequired) {
          response.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
          return response.status(401).type("html").send(authorizeHtml({ flow: flowView, mfa: true, email: request.body?.email }));
        }
      }
      const result = identity.completeBrowserFlow({ flowId: request.body?.flowId, csrf: request.body?.csrf, sessionToken: token });
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'");
      return response.type("html").send(completionHtml(result));
    } catch (error) {
      const flowView = { id: String(request.body?.flowId || ""), csrf: String(request.body?.csrf || "") };
      response.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
      return response.status(error instanceof BillingError ? error.status : 500).type("html").send(authorizeHtml({ flow: flowView, error: error instanceof BillingError ? error.message : "Временная ошибка Cloud Identity.", mfa: Boolean(request.body?.mfaCode), email: request.body?.email }));
    }
  });

  app.post("/v1/oauth/token", jsonBody, asyncRoute(async (request, response) => {
    const grantType = String(request.body?.grant_type || "");
    let result;
    if (grantType === "authorization_code") {
      result = identity.exchangeAuthorizationCode({
        code: request.body?.code,
        clientId: request.body?.client_id,
        clientSecret: request.body?.client_secret,
        redirectUri: request.body?.redirect_uri,
        codeVerifier: request.body?.code_verifier,
      });
    } else if (grantType === "refresh_token") {
      result = identity.rotateRefreshToken({ refreshToken: request.body?.refresh_token, clientId: request.body?.client_id, clientSecret: request.body?.client_secret });
    } else throw new BillingError("OAuth grant type не поддерживается.", "OAUTH_UNSUPPORTED_GRANT_TYPE", 400);
    response.setHeader("Cache-Control", "no-store");
    response.json({ access_token: result.accessToken, refresh_token: result.refreshToken, token_type: result.tokenType, expires_in: result.expiresIn, scope: result.scope });
  }));

  app.get("/v1/oauth/userinfo", asyncRoute(async (request, response) => {
    response.json(identity.userInfo(bearerToken(request)));
  }));
}

module.exports = {
  authorizeHtml,
  bearerToken,
  clearSessionCookie,
  completionHtml,
  htmlEscape,
  mountIdentityRoutes,
  parseCookies,
  sessionToken,
  setSessionCookie,
};
