(() => {
  "use strict";

  /* Shop name, products, categories, prices, shipping and policies come from your admin panel (/admin). */
  const VALUES = [
    { icon: "🚚", title: "Fast shipping", text: "Free once your order reaches the free-shipping amount." },
    { icon: "↩️", title: "Easy returns", text: "Changed your mind? Our returns policy has you covered." },
    { icon: "🔒", title: "Secure checkout", text: "Card details never touch our site. Payments run on Stripe." },
    { icon: "💬", title: "Real support", text: "Questions? Our team answers by email." },
  ];

  const PAGE = document.body.dataset.page || "home";
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const norm = (s) => String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const paras = (t) => String(t || "").split(/\n{2,}/).filter(Boolean).map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("");

  let CONFIG = { shopName: "Store", currency: "CAD", locale: "en-CA", freeShippingFrom: 0, shippingFlat: 0, contactEmail: "", promo: "" };
  let POLICIES = {};
  let NICHES = [], PRODUCTS = [], nicheById = {}, prodById = {};
  let MAXP = 60;
  const params = new URLSearchParams(location.search);
  let state = { niche: params.get("cat") || "all", q: params.get("q") || "", sort: "pop", max: 60 };
  let cart = loadCart();
  let pageQty = 1;

  const money = (n) => new Intl.NumberFormat(CONFIG.locale, { style: "currency", currency: CONFIG.currency }).format(n);
  function loadCart() { try { return JSON.parse(localStorage.getItem("nk_cart")) || {}; } catch (e) { return {}; } }
  function saveCart() { try { localStorage.setItem("nk_cart", JSON.stringify(cart)); } catch (e) {} }

  /* ---------- shared layout ---------- */
  const NAV = [
    ["Home", "/index.html", "home"], ["Shop", "/shop.html", "shop"], ["About", "/about.html", "about"],
    ["FAQ", "/faq.html", "faq"], ["Contact", "/contact.html", "contact"],
  ];
  function buildLayout() {
    const cur = PAGE === "product" ? "shop" : PAGE;
    $("#site-header").innerHTML = `
      <div class="promo" id="promo" hidden></div>
      <header class="top"><div class="wrap bar">
        <a class="logo" href="/index.html" aria-label="Home"><span class="mark"></span><span class="shopName">Store</span></a>
        <nav class="nav" id="nav" aria-label="Main">${NAV.map(([l, h, k]) => `<a href="${h}"${k === cur ? ' aria-current="page"' : ""}>${l}</a>`).join("")}</nav>
        <div class="tools">
          <form class="search" role="search" action="/shop.html" method="get">
            <label class="sr" for="q">Search products</label>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
            <input id="q" name="q" type="search" placeholder="Search products" autocomplete="off" value="${esc(PAGE === "shop" ? state.q : "")}">
          </form>
          <button class="cartbtn" id="openCart" aria-label="Open cart"><span class="ct">Cart</span><b id="count">0</b></button>
          <button class="menubtn" id="menuBtn" aria-label="Menu" aria-expanded="false">☰</button>
        </div>
      </div></header>`;
    $("#site-footer").innerHTML = `
      <footer><div class="wrap">
        <div class="fgrid">
          <div><a class="logo" href="/index.html"><span class="mark"></span><span class="shopName">Store</span></a>
            <p>Smart, useful products for every part of your day.</p></div>
          <div><h4>Shop</h4><ul id="fshop"></ul></div>
          <div><h4>Help</h4><ul>
            <li><a href="/policy.html?p=shipping">Shipping</a></li>
            <li><a href="/policy.html?p=returns">Returns</a></li>
            <li><a href="/faq.html">FAQ</a></li>
            <li><a href="/contact.html">Contact</a></li></ul></div>
          <div><h4>Company</h4><ul>
            <li><a href="/about.html">About</a></li>
            <li><a href="/policy.html?p=privacy">Privacy policy</a></li>
            <li><a href="/policy.html?p=terms">Terms of sale</a></li></ul></div>
        </div>
        <div class="legal"><span>© <span id="year"></span> <span class="shopName">Store</span>. All rights reserved.</span><span>Payments processed securely by Stripe.</span></div>
      </div></footer>`;
    document.body.insertAdjacentHTML("beforeend", `
      <div class="veil" id="veil"></div>
      <aside class="drawer" id="drawer" aria-label="Cart" aria-hidden="true">
        <header><h2 class="h">Your cart</h2><button class="x" id="closeCart" aria-label="Close cart">✕</button></header>
        <div id="shipbar"></div><div class="lines" id="lines"></div><div class="sum" id="sum"></div>
      </aside>
      <dialog id="infoDialog"><div class="info" id="infoBody"></div></dialog>
      <div class="toast" id="toast" role="status"></div>`);
    $("#year").textContent = new Date().getFullYear();
  }

  /* ---------- data ---------- */
  function applyData(d) {
    const s = d.settings || {};
    CONFIG = {
      shopName: s.store_name || "Store", currency: (s.currency || "cad").toUpperCase(), locale: "en-CA",
      freeShippingFrom: Number(s.free_shipping_from) || 0, shippingFlat: Number(s.shipping_flat) || 0,
      contactEmail: s.contact_email || "", promo: s.promo || "",
    };
    POLICIES = { shipping: ["Shipping", s.policy_shipping], returns: ["Returns", s.policy_returns], privacy: ["Privacy policy", s.policy_privacy], terms: ["Terms of sale", s.policy_terms] };
    NICHES = d.categories || [];
    PRODUCTS = d.products || [];
    nicheById = Object.fromEntries(NICHES.map((n) => [n.id, n]));
    prodById = Object.fromEntries(PRODUCTS.map((p) => [p.id, p]));
    MAXP = Math.max(10, Math.ceil(Math.max(0, ...PRODUCTS.map((p) => p.price))));
    state.max = MAXP;
    if (state.niche !== "all" && !nicheById[state.niche]) state.niche = "all";
  }

  function applyShell() {
    $$(".shopName").forEach((e) => (e.textContent = CONFIG.shopName));
    const promo = CONFIG.promo || (CONFIG.freeShippingFrom ? `Free shipping on orders over ${money(CONFIG.freeShippingFrom)}` : "");
    $("#promo").textContent = promo; $("#promo").hidden = !promo;
    $("#fshop").innerHTML = NICHES.map((n) => `<li><a href="/shop.html?cat=${esc(n.id)}">${esc(n.label)}</a></li>`).join("");
    const base = document.title.split("|").pop().trim();
    document.title = PAGE === "home" ? `${CONFIG.shopName} | ${base}` : `${base} | ${CONFIG.shopName}`;
  }

  /* ---------- product pieces ---------- */
  function media(p, { link = false, badge = false } = {}) {
    const n = nicheById[p.niche] || {};
    const inner = p.image
      ? `<img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy">`
      : `<span class="emoji" aria-hidden="true">${esc(p.emoji || n.emoji || "🛍️")}</span>`;
    const text = p.soldOut ? "Sold out" : p.badge;
    const b = badge && text ? `<span class="badge${p.soldOut ? " out" : ""}">${esc(text)}</span>` : "";
    const attrs = `class="media${p.soldOut ? " is-out" : ""}" style="--accent:${esc(n.bg || "#4D8BFF")}"`;
    return link ? `<a ${attrs} href="/product.html?id=${p.id}" aria-label="View ${esc(p.name)}">${inner}${b}</a>` : `<div ${attrs}>${inner}${b}</div>`;
  }
  function cardHTML(p) {
    const n = nicheById[p.niche] || { label: "" };
    const old = p.compareAt ? `<s>${money(p.compareAt)}</s>` : "";
    return `<article class="card">
      <div class="mw">${media(p, { link: true, badge: true })}${p.soldOut ? "" : `<button class="quick" data-add="${p.id}" aria-label="Add ${esc(p.name)} to cart">+</button>`}</div>
      <div class="meta"><span class="cname">${esc(n.label)}</span>
        <h3><a href="/product.html?id=${p.id}">${esc(p.name)}</a></h3>
        <span class="price">${money(p.price)}${old}</span></div></article>`;
  }

  /* ---------- pages ---------- */
  function pageHome() {
    const t = $("#hero-stats");
    if (t) t.innerHTML = `<div class="stat"><b>${PRODUCTS.length}</b><span>Products</span></div>
      <div class="stat"><b>${NICHES.length}</b><span>Categories</span></div>
      <div class="stat"><b>Stripe</b><span>Secure payments</span></div>`;
    const orb = NICHES.slice(0, 6);
    $("#orbit").innerHTML = `<div class="ring r1"></div><div class="ring r2"></div>
      <div class="spin">${orb.map((n, i) => `<a class="sat" href="/shop.html?cat=${esc(n.id)}" style="--a:${Math.round((360 / orb.length) * i)}deg;--c:${esc(n.bg)}" aria-label="Shop ${esc(n.label)}"><span>${esc(n.emoji)}</span></a>`).join("")}</div>
      <div class="core" aria-hidden="true">⚡</div>`;
    const names = NICHES.map((n) => `<span>${esc(n.label)}</span>`).join("");
    $("#marquee").innerHTML = `<div class="track">${names}${names}${names}${names}</div>`;
    $("#bento").innerHTML = NICHES.map((n) => {
      const c = PRODUCTS.filter((p) => p.niche === n.id).length;
      return `<a class="cat" style="--accent:${esc(n.bg)}" href="/shop.html?cat=${esc(n.id)}"><span class="em" aria-hidden="true">${esc(n.emoji)}</span><strong>${esc(n.label)}</strong><span class="n">${c} product${c === 1 ? "" : "s"}</span></a>`;
    }).join("");
    let trending = PRODUCTS.filter((p) => p.badge && !p.soldOut).slice(0, 10);
    if (!trending.length) trending = PRODUCTS.slice(0, 10);
    $("#rail").innerHTML = trending.map(cardHTML).join("");
    $("#trending").hidden = !trending.length;
    $("#values").innerHTML = VALUES.map((v) => `<div class="f"><i aria-hidden="true">${v.icon}</i><strong>${esc(v.title)}</strong><span>${esc(v.text)}</span></div>`).join("");
  }

  function filtered() {
    let list = PRODUCTS.filter((p) => (state.niche === "all" || p.niche === state.niche) && p.price <= state.max);
    if (state.q) {
      const q = norm(state.q);
      list = list.filter((p) => norm(p.name + " " + p.desc + " " + (nicheById[p.niche]?.label || "")).includes(q));
    }
    if (state.sort === "asc") list = [...list].sort((a, b) => a.price - b.price);
    if (state.sort === "desc") list = [...list].sort((a, b) => b.price - a.price);
    return list;
  }
  function pageShop() {
    const m = $("#max"); m.min = 0; m.max = MAXP; m.value = MAXP;
    $("#cats").innerHTML = [{ id: "all", label: "All products" }, ...NICHES].map((n) => {
      const c = n.id === "all" ? PRODUCTS.length : PRODUCTS.filter((p) => p.niche === n.id).length;
      return `<button class="chip" data-chip="${esc(n.id)}" aria-pressed="false">${esc(n.label)}<small>${c}</small></button>`;
    }).join("");
    renderShop();
  }
  function renderShop() {
    const list = filtered();
    $("#title").textContent = state.q ? `Results for "${state.q}"` : (state.niche === "all" ? "All products" : nicheById[state.niche].label);
    $("#found").textContent = `${list.length} product${list.length === 1 ? "" : "s"}`;
    $("#maxOut").textContent = state.max >= MAXP ? "Any price" : `Up to ${money(state.max)}`;
    $$("[data-chip]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.chip === state.niche)));
    $("#grid").innerHTML = list.length ? list.map(cardHTML).join("")
      : `<div class="empty"><strong>${PRODUCTS.length ? "No products match your search." : "Products are coming soon."}</strong>${PRODUCTS.length ? '<p>Try another word, raise the price limit or pick another category.</p><button class="btn primary" data-reset>Show all products</button>' : ""}</div>`;
    const u = new URL(location.href);
    state.niche !== "all" ? u.searchParams.set("cat", state.niche) : u.searchParams.delete("cat");
    state.q ? u.searchParams.set("q", state.q) : u.searchParams.delete("q");
    history.replaceState(null, "", u);
  }

  function pageProduct() {
    const p = prodById[parseInt(params.get("id"), 10)];
    const box = $("#product");
    if (!p) {
      box.innerHTML = `<div class="empty"><strong>We could not find this product.</strong><p>It may have been removed.</p><a class="btn primary" href="/shop.html">Back to the shop</a></div>`;
      return;
    }
    const n = nicheById[p.niche] || { label: "", id: "" };
    document.title = `${p.name} | ${CONFIG.shopName}`;
    const old = p.compareAt ? `<s>${money(p.compareAt)}</s>` : "";
    box.innerHTML = `
      <nav class="crumbs" aria-label="Breadcrumb"><a href="/index.html">Home</a> / <a href="/shop.html">Shop</a> / <a href="/shop.html?cat=${esc(n.id)}">${esc(n.label)}</a></nav>
      <div class="pgrid">
        ${media(p, { badge: true })}
        <div class="pinfo">
          <span class="cname">${esc(n.label)}</span>
          <h1 class="h">${esc(p.name)}</h1>
          <div class="big">${money(p.price)}${old}</div>
          ${paras(p.desc)}
          <ul class="perks"><li>Secure checkout with Stripe</li><li>Shipping and returns details in the footer</li><li>${p.soldOut ? "Currently sold out" : "In stock"}</li></ul>
          <div class="buy">${p.soldOut ? '<button class="btn primary" disabled>Sold out</button>' : `
            <div class="qty"><button data-pq="-1" aria-label="Fewer">−</button><span id="pq" aria-live="polite">1</span><button data-pq="1" aria-label="More">+</button></div>
            <button class="btn primary" data-add-page="${p.id}">Add to cart</button>`}</div>
        </div>
      </div>`;
    const rel = PRODUCTS.filter((x) => x.niche === p.niche && x.id !== p.id).slice(0, 4);
    $("#related").hidden = !rel.length;
    $("#relatedGrid").innerHTML = rel.map(cardHTML).join("");
  }

  function pagePolicy() {
    const key = params.get("p");
    const [title, text] = POLICIES[key] || ["Information", ""];
    $("#policy-title").textContent = title;
    $("#policy-body").innerHTML = text ? paras(text) : "<p>This page is not available.</p>";
    document.title = `${title} | ${CONFIG.shopName}`;
  }

  function pageContact() {
    const el = $("#contactEmail");
    if (el) el.innerHTML = CONFIG.contactEmail ? `<a href="mailto:${esc(CONFIG.contactEmail)}">${esc(CONFIG.contactEmail)}</a>` : "Use the form";
    $("#contactForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.target, out = $("#formNote"), btn = f.querySelector("button[type=submit]");
      btn.disabled = true; out.hidden = true;
      try {
        const r = await fetch("/api/contact", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: f.name.value, email: f.email.value, message: f.message.value, website: f.website.value }) });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Could not send your message.");
        f.reset(); out.className = "note ok"; out.textContent = "Message sent. We will get back to you by email.";
      } catch (err) { out.className = "note bad"; out.textContent = err.message; }
      out.hidden = false; btn.disabled = false;
    });
  }

  /* ---------- cart ---------- */
  const subtotal = () => Object.entries(cart).reduce((s, [id, q]) => s + (prodById[id]?.price || 0) * q, 0);
  const shipping = (sub) => (sub === 0 ? 0 : (CONFIG.freeShippingFrom > 0 && sub >= CONFIG.freeShippingFrom ? 0 : CONFIG.shippingFlat));

  function renderCart() {
    const ids = Object.keys(cart).filter((id) => prodById[id]);
    $("#count").textContent = ids.reduce((a, id) => a + cart[id], 0);
    const sub = subtotal();
    if (!ids.length) {
      $("#shipbar").innerHTML = "";
      $("#lines").innerHTML = `<div class="noitems"><p><strong>Your cart is empty.</strong></p><p>Add a product to get started.</p></div>`;
      $("#sum").innerHTML = `<button class="pay" disabled>Checkout</button>`;
      return;
    }
    if (CONFIG.freeShippingFrom > 0) {
      const left = CONFIG.freeShippingFrom - sub;
      const pct = Math.min(100, Math.round((sub / CONFIG.freeShippingFrom) * 100));
      $("#shipbar").innerHTML = `<div class="ship">${left > 0 ? `You are <b>${money(left)}</b> away from free shipping.` : "<b>You unlocked free shipping.</b>"}<div class="bar2"><i style="width:${pct}%"></i></div></div>`;
    } else $("#shipbar").innerHTML = "";
    $("#lines").innerHTML = ids.map((id) => {
      const p = prodById[id], q = cart[id];
      return `<div class="line">${media(p)}
        <div><b class="n">${esc(p.name)}</b>
          <div class="qty"><button data-dec="${id}" aria-label="Remove one">−</button><span aria-live="polite">${q}</span><button data-inc="${id}" aria-label="Add one">+</button></div>
          <button class="rm" data-rm="${id}">Remove</button></div><b>${money(p.price * q)}</b></div>`;
    }).join("");
    const ship = shipping(sub);
    $("#sum").innerHTML = `
      <div><span>Subtotal</span><span>${money(sub)}</span></div>
      <div><span>Shipping</span><span>${ship ? money(ship) : "Free"}</span></div>
      <div class="total"><span>Total</span><span>${money(sub + ship)}</span></div>
      <button class="pay" id="pay">Checkout</button>
      <small>Taxes and final shipping are shown at checkout.</small>`;
  }
  function setCart(id, qty) { if (qty <= 0) delete cart[id]; else cart[id] = Math.min(qty, 20); saveCart(); renderCart(); }
  function addToCart(id, n = 1) { const p = prodById[id]; if (!p || p.soldOut) return; setCart(id, (cart[id] || 0) + n); toast("Added to cart"); }
  function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("on"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("on"), 2200); }
  function openCart() { $("#drawer").classList.add("on"); $("#veil").classList.add("on"); $("#drawer").setAttribute("aria-hidden", "false"); $("#closeCart").focus(); }
  function closeCart() { $("#drawer").classList.remove("on"); $("#veil").classList.remove("on"); $("#drawer").setAttribute("aria-hidden", "true"); }
  function showMsg(title, html) {
    $("#infoBody").innerHTML = `<button class="x" data-close aria-label="Close">✕</button><h2 class="h">${esc(title)}</h2>${html}`;
    $("#infoDialog").showModal();
  }

  /* Only ids and quantities are sent. The server looks up the real prices. */
  async function checkout() {
    const btn = $("#pay"); if (btn) { btn.disabled = true; btn.textContent = "Redirecting to secure payment..."; }
    const items = Object.entries(cart).filter(([id]) => prodById[id]).map(([id, q]) => ({ id: +id, qty: q }));
    try {
      const r = await fetch("/api/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items }) });
      const d = await r.json();
      if (!r.ok || !d.url) throw new Error(d.error || "Checkout unavailable");
      location.href = d.url;
    } catch (e) {
      renderCart();
      showMsg("Checkout unavailable", `<p>${esc(e.message || "We could not start checkout. Please try again.")}</p>`);
    }
  }
  function handleReturn() {
    const o = params.get("order");
    if (!o) return;
    const u = new URL(location.href); u.searchParams.delete("order"); history.replaceState(null, "", u);
    if (o === "success") { cart = {}; saveCart(); renderCart(); showMsg("Thank you for your order!", "<p>Your payment was received. A receipt is on its way to your email.</p>"); }
    else if (o === "cancelled") toast("Checkout cancelled. Your cart is saved.");
  }

  /* ---------- events ---------- */
  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-add],[data-add-page],[data-inc],[data-dec],[data-rm],[data-close],[data-chip],[data-reset],[data-pq],#pay,#openCart,#closeCart,#veil,#menuBtn");
    if (!t) return;
    if (t.id === "openCart") return openCart();
    if (t.id === "closeCart" || t.id === "veil") return closeCart();
    if (t.id === "menuBtn") { const o = $("#nav").classList.toggle("open"); return t.setAttribute("aria-expanded", String(o)); }
    if (t.id === "pay") return checkout();
    if (t.dataset.add) return addToCart(+t.dataset.add);
    if (t.dataset.addPage) return addToCart(+t.dataset.addPage, pageQty);
    if (t.dataset.pq) { pageQty = Math.max(1, Math.min(20, pageQty + +t.dataset.pq)); return ($("#pq").textContent = pageQty); }
    if (t.dataset.inc) return setCart(t.dataset.inc, (cart[t.dataset.inc] || 0) + 1);
    if (t.dataset.dec) return setCart(t.dataset.dec, (cart[t.dataset.dec] || 0) - 1);
    if (t.dataset.rm) return setCart(t.dataset.rm, 0);
    if (t.hasAttribute("data-close")) return t.closest("dialog").close();
    if (t.dataset.chip) { state.niche = t.dataset.chip; return renderShop(); }
    if (t.hasAttribute("data-reset")) { state = { niche: "all", q: "", sort: "pop", max: MAXP }; $("#q").value = ""; $("#sort").value = "pop"; $("#max").value = MAXP; return renderShop(); }
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeCart(); });

  /* ---------- start ---------- */
  (async function init() {
    buildLayout();
    document.addEventListener("click", (e) => { if (e.target.id === "infoDialog") e.target.close(); });
    let data;
    try {
      const r = await fetch("/api/store");
      if (!r.ok) throw new Error("store");
      data = await r.json();
    } catch (e) {
      const main = $("#main");
      if (main) main.innerHTML = `<div class="wrap sec"><div class="empty"><strong>The store is temporarily unavailable.</strong><p>Please refresh the page in a moment.</p></div></div>`;
      return;
    }
    applyData(data); applyShell(); renderCart();
    if (PAGE === "home") pageHome();
    if (PAGE === "shop") {
      pageShop();
      $("#sort").addEventListener("change", (e) => { state.sort = e.target.value; renderShop(); });
      $("#max").addEventListener("input", (e) => { state.max = +e.target.value; renderShop(); });
    }
    if (PAGE === "product") pageProduct();
    if (PAGE === "policy") pagePolicy();
    if (PAGE === "contact") pageContact();
    handleReturn();
  })();
})();
