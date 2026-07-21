"use strict";

const crypto = require("node:crypto");
const { BillingError, timingSafeEqualText } = require("./billing-core.cjs");

function parseStripeSignature(value) {
  const result = { timestamp: null, signatures: [] };
  for (const part of String(value || "").split(",")) {
    const [key, raw] = part.split("=", 2);
    if (key === "t") result.timestamp = Number(raw);
    if (key === "v1" && raw) result.signatures.push(raw);
  }
  return result;
}

function verifyStripeWebhook(rawBody, signatureHeader, secret, options = {}) {
  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody || "");
  if (body.length === 0 || body.length > Number(options.maxBytes || 1_000_000)) {
    throw new BillingError("Webhook body пуст или превышает лимит.", "WEBHOOK_INVALID", 400);
  }
  const parsed = parseStripeSignature(signatureHeader);
  const toleranceSeconds = Number(options.toleranceSeconds || 300);
  const nowSeconds = Math.floor((options.nowMs || Date.now()) / 1000);
  if (!Number.isFinite(parsed.timestamp) || Math.abs(nowSeconds - parsed.timestamp) > toleranceSeconds) {
    throw new BillingError("Webhook timestamp недействителен.", "WEBHOOK_TIMESTAMP_INVALID", 400);
  }
  const expected = crypto.createHmac("sha256", String(secret || ""))
    .update(`${parsed.timestamp}.`)
    .update(body)
    .digest("hex");
  if (!parsed.signatures.some((candidate) => timingSafeEqualText(candidate, expected))) {
    throw new BillingError("Webhook signature недействительна.", "WEBHOOK_SIGNATURE_INVALID", 400);
  }
  let event;
  try {
    event = JSON.parse(body.toString("utf8"));
  } catch {
    throw new BillingError("Webhook payload повреждён.", "WEBHOOK_INVALID", 400);
  }
  if (!event?.id || !event?.type || !event?.data?.object) {
    throw new BillingError("Webhook payload имеет неверную структуру.", "WEBHOOK_INVALID", 400);
  }
  return event;
}

function appendForm(form, key, value) {
  if (value == null) return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => appendForm(form, `${key}[${index}]`, item));
    return;
  }
  if (typeof value === "object") {
    for (const [nestedKey, nestedValue] of Object.entries(value)) appendForm(form, `${key}[${nestedKey}]`, nestedValue);
    return;
  }
  form.append(key, String(value));
}

class StripeProvider {
  constructor({ secretKey, webhookSecret, apiBase = "https://api.stripe.com", fetchImpl = fetch }) {
    this.secretKey = String(secretKey || "");
    this.webhookSecret = String(webhookSecret || "");
    this.apiBase = String(apiBase || "https://api.stripe.com").replace(/\/+$/, "");
    this.fetchImpl = fetchImpl;
    if (!this.secretKey.startsWith("sk_")) throw new BillingError("PAYMENT_SECRET_KEY не настроен.", "PULSE_CLOUD_MISCONFIGURED", 503);
    if (!this.webhookSecret.startsWith("whsec_")) throw new BillingError("PAYMENT_WEBHOOK_SECRET не настроен.", "PULSE_CLOUD_MISCONFIGURED", 503);
  }

  async request(path, params, { idempotencyKey, method = "POST" } = {}) {
    const form = new URLSearchParams();
    for (const [key, value] of Object.entries(params || {})) appendForm(form, key, value);
    const response = await this.fetchImpl(`${this.apiBase}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
        ...(idempotencyKey ? { "Idempotency-Key": String(idempotencyKey) } : {}),
      },
      body: method === "GET" ? undefined : form,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new BillingError("Платёжный provider отклонил операцию.", "PAYMENT_PROVIDER_ERROR", 502, {
        providerCode: payload?.error?.code || null,
        requestId: response.headers.get("request-id") || null,
      });
    }
    return payload;
  }

  createCheckoutSession({ order, price, successUrl, cancelUrl, customerEmail = null }) {
    const mode = price.product_type === "subscription" ? "subscription" : "payment";
    return this.request("/v1/checkout/sessions", {
      mode,
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: order.id,
      customer_email: customerEmail,
      line_items: [{ price: price.provider_price_id, quantity: 1 }],
      metadata: {
        order_id: order.id,
        cloud_account_id: order.cloudAccountId,
        server_id: order.serverId,
        local_user_id: order.localUserId,
        product_code: order.productCode,
      },
      subscription_data: mode === "subscription" ? {
        metadata: {
          order_id: order.id,
          cloud_account_id: order.cloudAccountId,
          server_id: order.serverId,
          local_user_id: order.localUserId,
          product_code: order.productCode,
        },
      } : null,
    }, { idempotencyKey: `checkout:${order.id}` });
  }

  retrieveSubscription(subscriptionId) {
    const id = String(subscriptionId || "").trim();
    if (!/^sub_[A-Za-z0-9]+$/.test(id)) throw new BillingError("Stripe subscription ID недействителен.", "VALIDATION_FAILED", 400);
    return this.request(`/v1/subscriptions/${encodeURIComponent(id)}`, {}, { method: "GET" });
  }

  retrievePaymentIntent(paymentIntentId) {
    const id = String(paymentIntentId || "").trim();
    if (!/^pi_[A-Za-z0-9]+$/.test(id)) throw new BillingError("Stripe payment intent ID недействителен.", "VALIDATION_FAILED", 400);
    return this.request(`/v1/payment_intents/${encodeURIComponent(id)}`, {}, { method: "GET" });
  }

  createRefund({ paymentIntentId, amountMinor = null, reason = "requested_by_customer", idempotencyKey }) {
    return this.request("/v1/refunds", {
      payment_intent: paymentIntentId,
      amount: amountMinor,
      reason,
    }, { idempotencyKey });
  }

  createBillingPortalSession({ customerId, returnUrl, idempotencyKey }) {
    return this.request("/v1/billing_portal/sessions", {
      customer: customerId,
      return_url: returnUrl,
    }, { idempotencyKey });
  }

  verifyWebhook(rawBody, signatureHeader, options = {}) {
    return verifyStripeWebhook(rawBody, signatureHeader, this.webhookSecret, options);
  }
}

module.exports = {
  StripeProvider,
  parseStripeSignature,
  verifyStripeWebhook,
};
