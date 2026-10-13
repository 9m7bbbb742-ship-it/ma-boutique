// Cloudflare Pages "advanced mode" worker: the whole server in ONE file.
// It serves the API (/api/...) and hands every other request to the static pages.

// Shared helpers for all server functions (Cloudflare Pages Functions).
// Uses only the Web Crypto API, so there is nothing to install.

const enc = new TextEncoder();
const SESSION_COOKIE = "__Host-nk_session";

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
}

const fail = (message, status = 400) => json({ error: message }, status);

function configError(message) {
  const e = new Error(message);
  e.isConfig = true;
  return e;
}

function toB64Url(buf) {
  let s = "";
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmacRaw(secret, message) {
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  return crypto.subtle.sign("HMAC", key, enc.encode(message));
}

// Constant-time string comparison.
function safeEqual(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function needSecret(env) {
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32)
    throw configError("SESSION_SECRET is missing or too short (use 32+ random characters).");
}

async function passwordMatches(env, given) {
  needSecret(env);
  if (!env.ADMIN_PASSWORD || env.ADMIN_PASSWORD.length < 12)
    throw configError("ADMIN_PASSWORD is missing or too short (use 12+ characters).");
  // Hash both sides first so the comparison does not leak the password length.
  const a = toB64Url(await hmacRaw(env.SESSION_SECRET, "pw:" + given));
  const b = toB64Url(await hmacRaw(env.SESSION_SECRET, "pw:" + env.ADMIN_PASSWORD));
  return safeEqual(a, b);
}

async function createSession(env) {
  needSecret(env);
  const payload = String(Date.now() + 8 * 3600 * 1000); // valid for 8 hours
  const sig = toB64Url(await hmacRaw(env.SESSION_SECRET, "s:" + payload));
  return `${payload}.${sig}`;
}

async function isAdmin(request, env) {
  needSecret(env);
  const m = (request.headers.get("Cookie") || "").match(/(?:^|;\s*)__Host-nk_session=([^;]+)/);
  if (!m) return false;
  const [payload, sig] = m[1].split(".");
  if (!payload || !sig || !/^\d+$/.test(payload)) return false;
  if (Number(payload) < Date.now()) return false;
  const expected = toB64Url(await hmacRaw(env.SESSION_SECRET, "s:" + payload));
  return safeEqual(sig, expected);
}

const sessionCookie = (value, maxAge) =>
  `${SESSION_COOKIE}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`;

// Verifies the "Stripe-Signature" header of a webhook call.
async function verifyStripeSignature(payload, header, secret) {
  if (!secret || !header) return false;
  const items = header.split(",").map((p) => p.trim().split("="));
  const t = items.find((i) => i[0] === "t")?.[1];
  const sigs = items.filter((i) => i[0] === "v1").map((i) => i[1]);
  if (!t || !sigs.length) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false; // reject replays older than 5 min
  const mac = await hmacRaw(secret, `${t}.${payload}`);
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return sigs.some((s) => safeEqual(s, hex));
}

async function getSettings(env) {
  const { results } = await env.DB.prepare("SELECT key, value FROM settings").all();
  return Object.fromEntries(results.map((r) => [r.key, r.value]));
}

const toCents = (v) => Math.round(Number(v) * 100);

const M_store = (() => {

// Public data used by the storefront. Never expose private settings here.
const PUBLIC_SETTINGS = [
  "store_name", "promo", "contact_email", "shipping_flat", "free_shipping_from", "currency",
  "policy_shipping", "policy_returns", "policy_privacy", "policy_terms",
];

async function onRequestGet({ env }) {
  try {
    const all = await getSettings(env);
    const settings = Object.fromEntries(PUBLIC_SETTINGS.map((k) => [k, all[k] ?? ""]));
    const cats = await env.DB.prepare(
      "SELECT id, label, emoji, bg, fg FROM categories ORDER BY sort, label"
    ).all();
    const prods = await env.DB.prepare(
      `SELECT id, category_id, name, description, price_cents, compare_at_cents, badge, emoji, stock, image_id
       FROM products WHERE active = 1 ORDER BY sort, id`
    ).all();

    const products = prods.results.map((p) => ({
      id: p.id,
      niche: p.category_id,
      name: p.name,
      desc: p.description,
      price: p.price_cents / 100,
      compareAt: p.compare_at_cents ? p.compare_at_cents / 100 : null,
      badge: p.badge || "",
      emoji: p.emoji || "",
      image: p.image_id ? `/api/img/${p.image_id}` : "",
      soldOut: p.stock !== null && p.stock <= 0,
    }));

    return json({ settings, categories: cats.results, products }, 200, {
      "Cache-Control": "public, max-age=20",
    });
  } catch (e) {
    console.error(e);
    return fail("Store data unavailable", 500);
  }
}

return { onRequestGet };
})();
const M_checkout = (() => {

// The browser only sends product ids and quantities.
// Prices ALWAYS come from the database, so nobody can change a price from their browser.
async function onRequestPost({ request, env }) {
  try {
    if (!env.STRIPE_SECRET_KEY) return fail("Payments are not configured yet.", 503);

    let body;
    try { body = await request.json(); } catch { return fail("Invalid request."); }

    const wanted = new Map();
    for (const it of (Array.isArray(body.items) ? body.items.slice(0, 50) : [])) {
      const id = parseInt(it.id, 10);
      const qty = Math.max(1, Math.min(20, parseInt(it.qty, 10) || 0));
      if (Number.isInteger(id) && qty) wanted.set(id, Math.min(20, (wanted.get(id) || 0) + qty));
    }
    if (!wanted.size) return fail("Your cart is empty.");

    const ids = [...wanted.keys()];
    const { results } = await env.DB.prepare(
      `SELECT id, name, price_cents, stock, active FROM products WHERE id IN (${ids.map(() => "?").join(",")})`
    ).bind(...ids).all();

    const byId = new Map(results.map((p) => [p.id, p]));
    const lines = [];
    let subtotal = 0;
    for (const [id, qty] of wanted) {
      const p = byId.get(id);
      if (!p || !p.active) return fail("A product in your cart is no longer available.");
      if (p.stock !== null && qty > p.stock)
        return fail(p.stock <= 0 ? `${p.name} is sold out.` : `Only ${p.stock} left of ${p.name}.`);
      lines.push({ id, name: p.name, qty, price_cents: p.price_cents });
      subtotal += p.price_cents * qty;
    }

    const s = await getSettings(env);
    const currency = (s.currency || "cad").toLowerCase();
    const flat = toCents(s.shipping_flat || 0);
    const freeFrom = toCents(s.free_shipping_from || 0);
    const shipping = freeFrom > 0 && subtotal >= freeFrom ? 0 : flat;
    const total = subtotal + shipping;

    // Save the order first (status "pending"). The webhook marks it as paid.
    const ins = await env.DB.prepare(
      `INSERT INTO orders (status, items, subtotal_cents, shipping_cents, total_cents, created_at)
       VALUES ('pending', ?, ?, ?, ?, ?)`
    ).bind(JSON.stringify(lines), subtotal, shipping, total, new Date().toISOString()).run();
    const orderId = ins.meta.last_row_id;

    const base = (env.SITE_URL || new URL(request.url).origin).replace(/\/$/, "");
    const p = new URLSearchParams();
    p.set("mode", "payment");
    p.set("success_url", `${base}/?order=success`);
    p.set("cancel_url", `${base}/?order=cancelled`);
    p.set("client_reference_id", String(orderId));
    p.set("metadata[order_id]", String(orderId));
    p.set("allow_promotion_codes", "true");
    p.set("locale", "en");
    (s.countries || "CA,US").split(",").map((c) => c.trim()).filter(Boolean).forEach((c, i) =>
      p.set(`shipping_address_collection[allowed_countries][${i}]`, c));
    if (env.STRIPE_AUTOMATIC_TAX === "true") p.set("automatic_tax[enabled]", "true");

    lines.forEach((l, i) => {
      p.set(`line_items[${i}][quantity]`, String(l.qty));
      p.set(`line_items[${i}][price_data][currency]`, currency);
      p.set(`line_items[${i}][price_data][unit_amount]`, String(l.price_cents));
      p.set(`line_items[${i}][price_data][product_data][name]`, l.name.slice(0, 200));
    });
    p.set("shipping_options[0][shipping_rate_data][type]", "fixed_amount");
    p.set("shipping_options[0][shipping_rate_data][display_name]", shipping ? "Shipping" : "Free shipping");
    p.set("shipping_options[0][shipping_rate_data][fixed_amount][amount]", String(shipping));
    p.set("shipping_options[0][shipping_rate_data][fixed_amount][currency]", currency);

    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Idempotency-Key": `order-${orderId}`,
      },
      body: p,
    });
    const session = await res.json();

    if (!res.ok || !session.url) {
      console.error("Stripe error", JSON.stringify(session));
      await env.DB.prepare("UPDATE orders SET status='failed' WHERE id=?").bind(orderId).run();
      return fail("We could not start checkout. Please try again.", 502);
    }

    await env.DB.prepare("UPDATE orders SET stripe_session_id=? WHERE id=?").bind(session.id, orderId).run();
    return json({ url: session.url });
  } catch (e) {
    console.error(e);
    return fail("We could not start checkout. Please try again.", 500);
  }
}

return { onRequestPost };
})();
const M_webhook = (() => {

// Stripe calls this URL after a payment. Every call is checked with the signing secret,
// so nobody else can fake a "paid" order.
async function onRequestPost({ request, env }) {
  const payload = await request.text();
  const valid = await verifyStripeSignature(
    payload, request.headers.get("Stripe-Signature") || "", env.STRIPE_WEBHOOK_SECRET
  );
  if (!valid) return new Response("Invalid signature", { status: 400 });

  let event;
  try { event = JSON.parse(payload); } catch { return new Response("Bad payload", { status: 400 }); }

  try {
    const s = event.data?.object || {};
    const orderId = parseInt(s.client_reference_id, 10);

    if (
      (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") &&
      s.payment_status === "paid" && Number.isInteger(orderId)
    ) {
      const ship = s.collected_information?.shipping_details || s.shipping_details || null;
      const address = ship ? JSON.stringify({ name: ship.name, ...ship.address }) : null;

      const res = await env.DB.prepare(
        `UPDATE orders SET status='paid', email=?, name=?, phone=?, shipping_address=?,
           total_cents=?, tax_cents=?, stripe_session_id=?, paid_at=?
         WHERE id=? AND status='pending'`
      ).bind(
        s.customer_details?.email || null,
        s.customer_details?.name || ship?.name || null,
        s.customer_details?.phone || null,
        address,
        s.amount_total ?? 0,
        s.total_details?.amount_tax ?? 0,
        s.id || null,
        new Date().toISOString(),
        orderId
      ).run();

      // Only the first successful update decreases stock (webhooks can be delivered twice).
      if (res.meta.changes === 1) {
        const order = await env.DB.prepare("SELECT items FROM orders WHERE id=?").bind(orderId).first();
        for (const it of JSON.parse(order?.items || "[]")) {
          await env.DB.prepare(
            "UPDATE products SET stock = MAX(stock - ?, 0) WHERE id = ? AND stock IS NOT NULL"
          ).bind(it.qty, it.id).run();
        }
      }
    }

    if (event.type === "checkout.session.expired" && Number.isInteger(orderId)) {
      await env.DB.prepare("UPDATE orders SET status='expired' WHERE id=? AND status='pending'").bind(orderId).run();
    }
  } catch (e) {
    console.error(e);
    return new Response("Error", { status: 500 }); // Stripe will retry
  }

  return new Response("ok");
}

return { onRequestPost };
})();
const M_contact = (() => {

// Contact form: saves the message so you can read it in the admin panel (Messages tab).
async function onRequestPost({ request, env }) {
  try {
    let b;
    try { b = await request.json(); } catch { return fail("Invalid request."); }
    const name = String(b.name || "").trim().slice(0, 100);
    const email = String(b.email || "").trim().slice(0, 150);
    const message = String(b.message || "").trim().slice(0, 3000);
    if (!name || !message || message.length < 5) return fail("Please fill in your name and message.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return fail("Please enter a valid email address.");
    if (b.website) return json({ ok: true }); // hidden spam trap field: bots fill it, humans do not

    // Simple anti-spam: max 5 messages per hour per visitor.
    const ip = "contact:" + (request.headers.get("CF-Connecting-IP") || "unknown");
    const since = new Date(Date.now() - 3600e3).toISOString();
    const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM login_attempts WHERE ip=? AND ts>?").bind(ip, since).first();
    if (row.n >= 5) return fail("Too many messages. Please try again later.", 429);
    await env.DB.prepare("INSERT INTO login_attempts (ip, ts) VALUES (?, ?)").bind(ip, new Date().toISOString()).run();

    await env.DB.prepare("INSERT INTO messages (name, email, message, created_at) VALUES (?,?,?,?)")
      .bind(name, email, message, new Date().toISOString()).run();
    return json({ ok: true });
  } catch (e) {
    console.error(e);
    return fail("Could not send your message. Please try again.", 500);
  }
}

return { onRequestPost };
})();
const M_img = (() => {
async function onRequestGet({ env, params }) {
  const id = parseInt(params.id, 10);
  if (!Number.isInteger(id)) return new Response("Not found", { status: 404 });

  const row = await env.DB.prepare("SELECT data FROM images WHERE id = ?").bind(id).first();
  if (!row) return new Response("Not found", { status: 404 });

  const bin = atob(row.data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

  return new Response(bytes, {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, max-age=31536000, immutable", // a new upload gets a new id
      "X-Content-Type-Options": "nosniff",
    },
  });
}

return { onRequestGet };
})();
const M_admin = (() => {

async function onRequest({ request, env, params }) {
  try {
    return await route(request, env, params.path || []);
  } catch (e) {
    console.error(e);
    return fail(e.isConfig ? e.message : "Server error", 500);
  }
}

async function route(request, env, parts) {
  const [a, b] = parts;
  const method = request.method;

  if (a === "login" && method === "POST") return login(request, env);
  if (a === "logout" && method === "POST") return json({ ok: true }, 200, { "Set-Cookie": sessionCookie("", 0) });

  // Everything below requires a valid admin session.
  if (!(await isAdmin(request, env))) return fail("Please sign in.", 401);
  // Extra CSRF protection: a custom header cannot be sent by another website.
  if (method !== "GET" && request.headers.get("X-Requested-With") !== "nookly-admin") return fail("Forbidden", 403);

  switch (a) {
    case "me": return json({ ok: true });
    case "products": return products(request, env, method, b);
    case "categories": return categories(request, env, method, b);
    case "orders": return orders(request, env, method, b);
    case "settings": return settings(request, env, method);
    case "messages": return messages(env, method, b);
    case "image": return method === "POST" ? uploadImage(request, env) : fail("Not found", 404);
  }
  return fail("Not found", 404);
}

/* ---------- login (with a basic brute-force lock) ---------- */
async function login(request, env) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const now = Date.now();
  await env.DB.prepare("DELETE FROM login_attempts WHERE ts < ?").bind(new Date(now - 24 * 3600e3).toISOString()).run();
  const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM login_attempts WHERE ip=? AND ts>?")
    .bind(ip, new Date(now - 15 * 60e3).toISOString()).first();
  if (row.n >= 8) return fail("Too many attempts. Try again in 15 minutes.", 429);

  let body;
  try { body = await request.json(); } catch { return fail("Invalid request."); }
  if (!(await passwordMatches(env, String(body.password || "")))) {
    await env.DB.prepare("INSERT INTO login_attempts (ip, ts) VALUES (?, ?)").bind(ip, new Date().toISOString()).run();
    return fail("Wrong password.", 401);
  }
  await env.DB.prepare("DELETE FROM login_attempts WHERE ip=?").bind(ip).run();
  return json({ ok: true }, 200, { "Set-Cookie": sessionCookie(await createSession(env), 8 * 3600) });
}

/* ---------- products ---------- */
const BADGES = ["", "New", "Popular", "Sale"];

async function readProduct(env, b) {
  const name = String(b.name || "").trim();
  if (!name || name.length > 120) return { error: "Name is required (max 120 characters)." };
  const price = Number(b.price);
  if (!(price > 0) || price > 100000) return { error: "Enter a valid price." };
  let compare = null;
  if (b.compareAt !== "" && b.compareAt != null) {
    compare = Number(b.compareAt);
    if (!(compare > price)) return { error: "The 'before' price must be higher than the price." };
  }
  let stock = null;
  if (b.stock !== "" && b.stock != null) {
    stock = Number(b.stock);
    if (!Number.isInteger(stock) || stock < 0 || stock > 100000) return { error: "Stock must be a whole number, or empty for unlimited." };
  }
  const cat = await env.DB.prepare("SELECT id FROM categories WHERE id=?").bind(String(b.category || "")).first();
  if (!cat) return { error: "Choose a category." };
  const description = String(b.description || "").slice(0, 2000);
  const badge = BADGES.includes(b.badge) ? b.badge : "";
  const emoji = String(b.emoji || "").slice(0, 8);
  const imageId = b.imageId ? parseInt(b.imageId, 10) : null;
  return {
    v: {
      name, description, badge, emoji, stock,
      category: cat.id,
      price_cents: toCents(price),
      compare_cents: compare ? toCents(compare) : null,
      image_id: Number.isInteger(imageId) ? imageId : null,
      active: b.active === false ? 0 : 1,
    },
  };
}

async function products(request, env, method, id) {
  if (method === "GET" && !id) {
    const { results } = await env.DB.prepare("SELECT * FROM products ORDER BY sort, id").all();
    return json({ products: results });
  }
  if (method === "POST" && !id) {
    const r = await readProduct(env, await request.json());
    if (r.error) return fail(r.error);
    const v = r.v;
    const ins = await env.DB.prepare(
      `INSERT INTO products (category_id, name, description, price_cents, compare_at_cents, badge, emoji, stock, active, image_id, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(v.category, v.name, v.description, v.price_cents, v.compare_cents, v.badge, v.emoji, v.stock, v.active, v.image_id, new Date().toISOString()).run();
    return json({ id: ins.meta.last_row_id });
  }
  const pid = parseInt(id, 10);
  if (!Number.isInteger(pid)) return fail("Not found", 404);
  if (method === "PUT") {
    const r = await readProduct(env, await request.json());
    if (r.error) return fail(r.error);
    const v = r.v;
    await env.DB.prepare(
      `UPDATE products SET category_id=?, name=?, description=?, price_cents=?, compare_at_cents=?, badge=?, emoji=?, stock=?, active=?, image_id=? WHERE id=?`
    ).bind(v.category, v.name, v.description, v.price_cents, v.compare_cents, v.badge, v.emoji, v.stock, v.active, v.image_id, pid).run();
    return json({ ok: true });
  }
  if (method === "DELETE") {
    await env.DB.prepare("DELETE FROM products WHERE id=?").bind(pid).run();
    await env.DB.prepare("DELETE FROM images WHERE id NOT IN (SELECT image_id FROM products WHERE image_id IS NOT NULL)").run();
    return json({ ok: true });
  }
  return fail("Not found", 404);
}

/* ---------- categories ---------- */
async function categories(request, env, method, id) {
  if (method === "GET") {
    const { results } = await env.DB.prepare("SELECT * FROM categories ORDER BY sort, label").all();
    return json({ categories: results });
  }
  if (method === "POST") {
    const b = await request.json();
    const slug = String(b.id || "").trim().toLowerCase();
    const label = String(b.label || "").trim();
    if (!/^[a-z0-9-]{2,30}$/.test(slug)) return fail("Category id: 2-30 lowercase letters, numbers or dashes.");
    if (!label || label.length > 60) return fail("Category name is required (max 60 characters).");
    const hex = /^#[0-9a-fA-F]{6}$/;
    if (!hex.test(b.bg) || !hex.test(b.fg)) return fail("Colors must look like #FFD3E4.");
    const sort = Number.isInteger(Number(b.sort)) ? Number(b.sort) : 0;
    await env.DB.prepare(
      `INSERT INTO categories (id, label, emoji, bg, fg, sort) VALUES (?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET label=excluded.label, emoji=excluded.emoji, bg=excluded.bg, fg=excluded.fg, sort=excluded.sort`
    ).bind(slug, label, String(b.emoji || "").slice(0, 8), b.bg, b.fg, sort).run();
    return json({ ok: true });
  }
  if (method === "DELETE" && id) {
    const used = await env.DB.prepare("SELECT COUNT(*) AS n FROM products WHERE category_id=?").bind(id).first();
    if (used.n > 0) return fail("Move or delete the products in this category first.");
    await env.DB.prepare("DELETE FROM categories WHERE id=?").bind(id).run();
    return json({ ok: true });
  }
  return fail("Not found", 404);
}

/* ---------- orders ---------- */
const ORDER_STATUSES = ["paid", "shipped", "delivered", "cancelled"];

async function orders(request, env, method, id) {
  if (method === "GET") {
    const { results } = await env.DB.prepare(
      "SELECT * FROM orders WHERE status NOT IN ('pending','expired','failed') ORDER BY id DESC LIMIT 200"
    ).all();
    return json({ orders: results });
  }
  if (method === "PUT" && id) {
    const b = await request.json();
    if (!ORDER_STATUSES.includes(b.status)) return fail("Invalid status.");
    await env.DB.prepare("UPDATE orders SET status=?, tracking=? WHERE id=? AND status NOT IN ('pending','expired','failed')")
      .bind(b.status, String(b.tracking || "").slice(0, 200), parseInt(id, 10)).run();
    return json({ ok: true });
  }
  return fail("Not found", 404);
}

/* ---------- settings ---------- */
const SETTING_RULES = {
  store_name: 80, promo: 160, contact_email: 120,
  shipping_flat: "num", free_shipping_from: "num",
  policy_shipping: 3000, policy_returns: 3000, policy_privacy: 6000, policy_terms: 6000,
};

async function settings(request, env, method) {
  if (method === "GET") {
    const { results } = await env.DB.prepare("SELECT key, value FROM settings").all();
    return json({ settings: Object.fromEntries(results.map((r) => [r.key, r.value])) });
  }
  if (method === "PUT") {
    const b = await request.json();
    const stmts = [];
    for (const [key, rule] of Object.entries(SETTING_RULES)) {
      if (!(key in b)) continue;
      let val = String(b[key] ?? "").trim();
      if (rule === "num") {
        if (val === "" || !(Number(val) >= 0) || Number(val) > 100000) return fail(`Enter a valid amount for ${key.replace(/_/g, " ")}.`);
        val = String(Number(val));
      } else {
        val = val.slice(0, rule);
      }
      stmts.push(env.DB.prepare(
        "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value"
      ).bind(key, val));
    }
    if (stmts.length) await env.DB.batch(stmts);
    return json({ ok: true });
  }
  return fail("Not found", 404);
}

/* ---------- image upload (the browser sends a resized JPEG) ---------- */
async function uploadImage(request, env) {
  const body = await request.json();
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(body.dataUrl || ""));
  if (!m || m[1].length > 1_000_000) return fail("Use a JPEG or PNG photo (it is resized automatically).");
  const head = atob(m[1].slice(0, 8));
  if (head.charCodeAt(0) !== 0xff || head.charCodeAt(1) !== 0xd8) return fail("This file is not a valid image.");
  const ins = await env.DB.prepare("INSERT INTO images (data, created_at) VALUES (?, ?)").bind(m[1], new Date().toISOString()).run();
  return json({ id: ins.meta.last_row_id });
}

/* ---------- contact messages ---------- */
async function messages(env, method, id) {
  if (method === "GET") {
    const { results } = await env.DB.prepare("SELECT * FROM messages ORDER BY id DESC LIMIT 200").all();
    return json({ messages: results });
  }
  if (method === "DELETE" && id) {
    await env.DB.prepare("DELETE FROM messages WHERE id=?").bind(parseInt(id, 10)).run();
    return json({ ok: true });
  }
  return fail("Not found", 404);
}

return { onRequest };
})();

/* ---------- the database prepares itself on first use ---------- */
const SCHEMA = ["CREATE TABLE IF NOT EXISTS settings (\n  key TEXT PRIMARY KEY,\n  value TEXT NOT NULL\n);", "CREATE TABLE IF NOT EXISTS categories (\n  id TEXT PRIMARY KEY,\n  label TEXT NOT NULL,\n  emoji TEXT NOT NULL DEFAULT '',\n  bg TEXT NOT NULL DEFAULT '#E9E6FF',\n  fg TEXT NOT NULL DEFAULT '#12103A',\n  sort INTEGER NOT NULL DEFAULT 0\n);", "CREATE TABLE IF NOT EXISTS images (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  data TEXT NOT NULL,\n  created_at TEXT NOT NULL\n);", "CREATE TABLE IF NOT EXISTS products (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  category_id TEXT NOT NULL,\n  name TEXT NOT NULL,\n  description TEXT NOT NULL DEFAULT '',\n  price_cents INTEGER NOT NULL,\n  compare_at_cents INTEGER,\n  badge TEXT NOT NULL DEFAULT '',\n  emoji TEXT NOT NULL DEFAULT '',\n  stock INTEGER,\n  active INTEGER NOT NULL DEFAULT 1,\n  image_id INTEGER,\n  sort INTEGER NOT NULL DEFAULT 0,\n  created_at TEXT NOT NULL\n);", "CREATE TABLE IF NOT EXISTS orders (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  status TEXT NOT NULL,\n  items TEXT NOT NULL,\n  subtotal_cents INTEGER NOT NULL,\n  shipping_cents INTEGER NOT NULL,\n  total_cents INTEGER NOT NULL,\n  tax_cents INTEGER NOT NULL DEFAULT 0,\n  email TEXT,\n  name TEXT,\n  phone TEXT,\n  shipping_address TEXT,\n  stripe_session_id TEXT,\n  tracking TEXT NOT NULL DEFAULT '',\n  created_at TEXT NOT NULL,\n  paid_at TEXT\n);", "CREATE TABLE IF NOT EXISTS login_attempts (\n  ip TEXT NOT NULL,\n  ts TEXT NOT NULL\n);", "CREATE INDEX IF NOT EXISTS idx_products_cat ON products(category_id);", "CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);", "CREATE INDEX IF NOT EXISTS idx_attempts_ip ON login_attempts(ip);", "CREATE TABLE IF NOT EXISTS messages (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  name TEXT NOT NULL,\n  email TEXT NOT NULL,\n  message TEXT NOT NULL,\n  created_at TEXT NOT NULL\n);"];
const SEED = ["INSERT OR REPLACE INTO settings (key, value) VALUES ('store_name', 'NEXORA');", "INSERT OR REPLACE INTO settings (key, value) VALUES ('promo', 'Free shipping on orders over $75 | Secure checkout');", "INSERT OR REPLACE INTO settings (key, value) VALUES ('contact_email', 'hello@example.com');", "INSERT OR REPLACE INTO settings (key, value) VALUES ('shipping_flat', '7.99');", "INSERT OR REPLACE INTO settings (key, value) VALUES ('free_shipping_from', '75');", "INSERT OR REPLACE INTO settings (key, value) VALUES ('currency', 'cad');", "INSERT OR REPLACE INTO settings (key, value) VALUES ('countries', 'CA,US');", "INSERT OR REPLACE INTO settings (key, value) VALUES ('policy_shipping', 'We ship across Canada and the US. Shipping is $7.99, and free on orders over $75.\n\nReplace this text with your real delivery times (for example, 5 to 10 business days).');", "INSERT OR REPLACE INTO settings (key, value) VALUES ('policy_returns', 'You can return an item within 30 days if it is unused and in its original packaging.\n\nReplace this text with your actual return policy.');", "INSERT OR REPLACE INTO settings (key, value) VALUES ('policy_privacy', 'We only use your information to process your order and contact you about it. Payments are handled by our payment provider: we never see or store your card details.\n\nHave this text reviewed before launch.');", "INSERT OR REPLACE INTO settings (key, value) VALUES ('policy_terms', 'Placeholder. Add your terms of sale here (prices, taxes, delivery, returns, liability). Have them reviewed before launch.');", "INSERT OR REPLACE INTO categories (id, label, emoji, bg, fg, sort) VALUES ('baby', 'Baby', '\ud83c\udf7c', '#FF7AB6', '#FF7AB6', 0);", "INSERT OR REPLACE INTO categories (id, label, emoji, bg, fg, sort) VALUES ('pets', 'Pets', '\ud83d\udc36', '#4ADE80', '#4ADE80', 1);", "INSERT OR REPLACE INTO categories (id, label, emoji, bg, fg, sort) VALUES ('kitchen', 'Kitchen & Home', '\ud83c\udf73', '#FFB84D', '#FFB84D', 2);", "INSERT OR REPLACE INTO categories (id, label, emoji, bg, fg, sort) VALUES ('tech', 'Tech', '\ud83c\udfa7', '#4D8BFF', '#4D8BFF', 3);", "INSERT OR REPLACE INTO categories (id, label, emoji, bg, fg, sort) VALUES ('auto', 'Auto', '\ud83d\ude97', '#9AA9D1', '#9AA9D1', 4);", "INSERT OR REPLACE INTO categories (id, label, emoji, bg, fg, sort) VALUES ('everyday', 'Everyday Solutions', '\ud83d\udca1', '#FFE14D', '#FFE14D', 5);", "INSERT OR REPLACE INTO categories (id, label, emoji, bg, fg, sort) VALUES ('fashion', 'Fashion & Shoes', '\ud83d\udc5f', '#B58CFF', '#B58CFF', 6);", "INSERT OR REPLACE INTO products (id, category_id, name, description, price_cents, badge, emoji, stock, active, created_at) VALUES (1, 'baby', 'Soft-touch silicone night light', 'A gentle glow that changes color with a tap. Rechargeable by USB.', 2499, 'Popular', '\ud83c\udf19', NULL, 1, '2026-10-12T00:00:00Z');", "INSERT OR REPLACE INTO products (id, category_id, name, description, price_cents, badge, emoji, stock, active, created_at) VALUES (2, 'baby', 'Silicone bibs, set of 3', 'Food-catching pocket. Wipes clean in seconds.', 1699, '', '\ud83c\udf7c', NULL, 1, '2026-10-12T00:00:00Z');", "INSERT OR REPLACE INTO products (id, category_id, name, description, price_cents, badge, emoji, stock, active, created_at) VALUES (3, 'baby', 'Bath thermometer', 'Check the water temperature at a glance before bath time.', 1299, '', '\ud83d\udec1', NULL, 1, '2026-10-12T00:00:00Z');", "INSERT OR REPLACE INTO products (id, category_id, name, description, price_cents, badge, emoji, stock, active, created_at) VALUES (4, 'baby', 'Foldable toy basket', 'Folds flat when you do not need it.', 2999, 'New', '\ud83e\uddf8', NULL, 1, '2026-10-12T00:00:00Z');", "INSERT OR REPLACE INTO products (id, category_id, name, description, price_cents, badge, emoji, stock, active, created_at) VALUES (5, 'pets', 'Non-slip pet bowl', 'Rubber base keeps the bowl exactly where you put it.', 1499, '', '\ud83d\udc36', NULL, 1, '2026-10-12T00:00:00Z');", "INSERT OR REPLACE INTO products (id, category_id, name, description, price_cents, badge, emoji, stock, active, created_at) VALUES (6, 'pets', 'Self-cleaning slicker brush', 'Press one button to release the fur from the brush.', 1899, 'Popular', '\ud83d\udc31', NULL, 1, '2026-10-12T00:00:00Z');", "INSERT OR REPLACE INTO products (id, category_id, name, description, price_cents, badge, emoji, stock, active, created_at) VALUES (7, 'pets', 'Treat-dispensing toy', 'Keeps your dog busy while you get things done.', 1599, '', '\ud83e\uddb4', NULL, 1, '2026-10-12T00:00:00Z');", "INSERT OR REPLACE INTO products (id, category_id, name, description, price_cents, badge, emoji, stock, active, created_at) VALUES (8, 'pets', 'Retractable leash, 16 ft', 'Non-slip handle with a one-touch lock.', 2199, '', '\ud83d\udc15', NULL, 1, '2026-10-12T00:00:00Z');", "INSERT OR REPLACE INTO products (id, category_id, name, description, price_cents, badge, emoji, stock, active, created_at) VALUES (9, 'kitchen', '5-in-1 mandoline slicer', 'Slice, grate and julienne in seconds.', 2799, 'Popular', '\ud83e\udd55', NULL, 1, '2026-10-12T00:00:00Z');", "INSERT OR REPLACE INTO products (id, category_id, name, description, price_cents, badge, emoji, stock, active, created_at) VALUES (10, 'kitchen', 'Rotating spice rack', 'Keep every spice within reach on the counter.', 3299, '', '\ud83e\uddc2', NULL, 1, '2026-10-12T00:00:00Z');", "INSERT OR REPLACE INTO products (id, category_id, name, description, price_cents, badge, emoji, stock, active, created_at) VALUES (11, 'kitchen', 'Digital kitchen scale', 'Accurate to the gram, with a tare function.', 1999, '', '\u2696\ufe0f', NULL, 1, '2026-10-12T00:00:00Z');", "INSERT OR REPLACE INTO products (id, category_id, name, description, price_cents, badge, emoji, stock, active, created_at) VALUES (12, 'kitchen', 'Stretch silicone lids', 'Fit bowls and pots of almost any size.', 1799, 'New', '\ud83c\udf72', NULL, 1, '2026-10-12T00:00:00Z');", "INSERT OR REPLACE INTO products (id, category_id, name, description, price_cents, badge, emoji, stock, active, created_at) VALUES (13, 'tech', '15W wireless charger', 'Place your phone down and it charges.', 2999, 'Popular', '\ud83d\udd0b', NULL, 1, '2026-10-12T00:00:00Z');", "INSERT OR REPLACE INTO products (id, category_id, name, description, price_cents, badge, emoji, stock, active, created_at) VALUES (14, 'tech', 'Flexible phone stand', 'Bendable neck for the desk, nightstand or kitchen.', 1899, '', '\ud83d\udcf1', NULL, 1, '2026-10-12T00:00:00Z');", "INSERT OR REPLACE INTO products (id, category_id, name, description, price_cents, badge, emoji, stock, active, created_at) VALUES (15, 'tech', 'Bluetooth earbuds', 'Charging case and built-in microphone included.', 3999, 'New', '\ud83c\udfa7', NULL, 1, '2026-10-12T00:00:00Z');", "INSERT OR REPLACE INTO products (id, category_id, name, description, price_cents, badge, emoji, stock, active, created_at) VALUES (16, 'tech', 'Braided USB-C cable, 6 ft', 'Reinforced braid that resists everyday wear.', 1299, '', '\ud83d\udd0c', NULL, 1, '2026-10-12T00:00:00Z');", "INSERT OR REPLACE INTO products (id, category_id, name, description, price_cents, badge, emoji, stock, active, created_at) VALUES (17, 'auto', 'Cordless car vacuum', 'Picks up crumbs and sand from seats and mats.', 4499, 'Popular', '\ud83d\ude97', NULL, 1, '2026-10-12T00:00:00Z');", "INSERT OR REPLACE INTO products (id, category_id, name, description, price_cents, badge, emoji, stock, active, created_at) VALUES (18, 'auto', 'Trunk organizer', 'Foldable compartments so nothing rolls around.', 3499, '', '\ud83e\uddf0', NULL, 1, '2026-10-12T00:00:00Z');", "INSERT OR REPLACE INTO products (id, category_id, name, description, price_cents, badge, emoji, stock, active, created_at) VALUES (19, 'auto', 'Ice scraper with glove', 'Clear the windshield without freezing your fingers.', 1399, '', '\u2744\ufe0f', NULL, 1, '2026-10-12T00:00:00Z');", "INSERT OR REPLACE INTO products (id, category_id, name, description, price_cents, badge, emoji, stock, active, created_at) VALUES (20, 'auto', 'Portable tire inflator', 'Inflate on the go. Stops automatically at your target pressure.', 4999, 'New', '\ud83d\udca8', NULL, 1, '2026-10-12T00:00:00Z');", "INSERT OR REPLACE INTO products (id, category_id, name, description, price_cents, badge, emoji, stock, active, created_at) VALUES (21, 'everyday', 'Adhesive hooks, 20 pack', 'No drilling. Removes cleanly without marks.', 1199, '', '\ud83e\ude9d', NULL, 1, '2026-10-12T00:00:00Z');", "INSERT OR REPLACE INTO products (id, category_id, name, description, price_cents, badge, emoji, stock, active, created_at) VALUES (22, 'everyday', 'Under-bed storage bins', 'Set of 2 rolling bins with lids.', 3699, '', '\ud83d\udce6', NULL, 1, '2026-10-12T00:00:00Z');", "INSERT OR REPLACE INTO products (id, category_id, name, description, price_cents, badge, emoji, stock, active, created_at) VALUES (23, 'everyday', 'Motion-sensor LED light', 'Lights up as you walk by. Perfect for closets and stairs.', 2199, 'Popular', '\ud83d\udca1', NULL, 1, '2026-10-12T00:00:00Z');", "INSERT OR REPLACE INTO products (id, category_id, name, description, price_cents, badge, emoji, stock, active, created_at) VALUES (24, 'everyday', 'Lint roller', 'Refresh clothes and couches in seconds.', 999, '', '\ud83e\uddf9', NULL, 1, '2026-10-12T00:00:00Z');", "INSERT OR REPLACE INTO products (id, category_id, name, description, price_cents, badge, emoji, stock, active, created_at) VALUES (25, 'fashion', 'Thermal socks, 3 pack', 'Keep your feet warm all winter long.', 1999, '', '\ud83e\udde6', NULL, 1, '2026-10-12T00:00:00Z');", "INSERT OR REPLACE INTO products (id, category_id, name, description, price_cents, badge, emoji, stock, active, created_at) VALUES (26, 'fashion', 'Adjustable cap', 'Lightweight cotton with an adjustable back strap.', 2299, '', '\ud83e\udde2', NULL, 1, '2026-10-12T00:00:00Z');", "INSERT OR REPLACE INTO products (id, category_id, name, description, price_cents, badge, emoji, stock, active, created_at) VALUES (27, 'fashion', 'Lightweight walking sneakers', 'A flexible sole for all-day comfort.', 5499, 'New', '\ud83d\udc5f', NULL, 1, '2026-10-12T00:00:00Z');", "INSERT OR REPLACE INTO products (id, category_id, name, description, price_cents, badge, emoji, stock, active, created_at) VALUES (28, 'fashion', 'Touchscreen winter gloves', 'Use your phone without taking your gloves off.', 2499, 'Popular', '\ud83e\udde4', NULL, 1, '2026-10-12T00:00:00Z');"];
let dbReady = null;
function ensureDb(env) {
  if (!dbReady) {
    dbReady = (async () => {
      const has = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='settings'").first();
      if (!has) await env.DB.batch([...SCHEMA, ...SEED].map((s) => env.DB.prepare(s)));
    })().catch((e) => { dbReady = null; throw e; });
  }
  return dbReady;
}

/* ---------- security headers on every response ---------- */
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'";
function secure(res, url) {
  const r = new Response(res.body, res);
  const h = r.headers;
  h.set("X-Content-Type-Options", "nosniff");
  h.set("X-Frame-Options", "DENY");
  h.set("Referrer-Policy", "strict-origin-when-cross-origin");
  h.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  h.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  if ((h.get("Content-Type") || "").includes("text/html")) h.set("Content-Security-Policy", CSP);
  if (url.pathname.startsWith("/admin")) { h.set("X-Robots-Tag", "noindex, nofollow"); h.set("Cache-Control", "no-store"); }
  return r;
}

async function api(request, env, url) {
  if (!env.DB) return json({ error: "The database is not connected yet. In Cloudflare, add a D1 binding named DB, then redeploy." }, 503);
  await ensureDb(env);
  const parts = url.pathname.replace(/^\/api\//, "").split("/");
  const m = request.method;
  if (parts[0] === "store" && m === "GET") return M_store.onRequestGet({ env });
  if (parts[0] === "checkout" && m === "POST") return M_checkout.onRequestPost({ request, env });
  if (parts[0] === "contact" && m === "POST") return M_contact.onRequestPost({ request, env });
  if (parts[0] === "stripe-webhook" && m === "POST") return M_webhook.onRequestPost({ request, env });
  if (parts[0] === "img" && m === "GET") return M_img.onRequestGet({ env, params: { id: parts[1] } });
  if (parts[0] === "admin") return M_admin.onRequest({ request, env, params: { path: parts.slice(1) } });
  return json({ error: "Not found" }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    let res;
    try {
      res = url.pathname.startsWith("/api/") ? await api(request, env, url) : await env.ASSETS.fetch(request);
    } catch (e) {
      console.error(e);
      res = json({ error: e.isConfig ? e.message : "Server error" }, 500);
    }
    return secure(res, url);
  },
};
