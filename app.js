(() => {
  "use strict";

  /* ---------- languages: English, French, Spanish, Arabic ---------- */
  const LANGS = { en: "English", fr: "Français", es: "Español", ar: "العربية" };
  const qs0 = new URLSearchParams(location.search);
  const storedLang = () => { try { return localStorage.getItem("nk_lang"); } catch (e) { return null; } };
  let LANG = qs0.get("lang") || storedLang() || (navigator.language || "en").toLowerCase().slice(0, 2);
  if (!LANGS[LANG]) LANG = "en";
  try { localStorage.setItem("nk_lang", LANG); } catch (e) {}
  const RTL = LANG === "ar";
  document.documentElement.lang = { en: "en-CA", fr: "fr-CA", es: "es", ar: "ar" }[LANG];
  document.documentElement.dir = RTL ? "rtl" : "ltr";
  let PACK = {}; // language pack (page texts, titles and, for es/ar, the UI dictionary)
  // L(english, french): French is inline; Spanish and Arabic come from the pack, keyed by the English text.
  const L = (en, fr) => (LANG === "en" ? en : LANG === "fr" ? fr : (PACK.ui && PACK.ui[en]) || en);
  const Lt = (en, fr, ...a) => { let t = L(en, fr); a.forEach((v, i) => (t = t.split("{" + i + "}").join(v))); return t; };
  const loadPack = () => new Promise((res) => {
    if (LANG === "en") return res();
    if (RTL) { const f = document.createElement("link"); f.rel = "stylesheet"; f.href = "https://fonts.googleapis.com/css2?family=Cairo:wght@500;600;700;800&display=swap"; document.head.appendChild(f); }
    const sc = document.createElement("script");
    sc.src = "/" + LANG + ".js";
    sc.onload = () => { PACK = window.__PACK || {}; res(); };
    sc.onerror = () => res();
    document.head.appendChild(sc);
  });

  /* Shop name, products, categories, prices, shipping and policies come from your admin panel (/admin). */
  let CHAT_ON = false;
  const values = () => [
    { icon: "🚚", title: L("Free shipping that kicks in fast", "Une livraison gratuite qui arrive vite"), text: L("Reach the free-shipping amount and delivery is on us. Your cart shows exactly how close you are.", "Atteignez le montant de livraison gratuite et la livraison est à nos frais. Votre panier vous montre exactement où vous en êtes.") },
    { icon: "🔒", title: L("Checkout you can trust", "Un paiement en toute confiance"), text: L("Payments run on Stripe with industry-standard encryption. We never see or store your card details.", "Les paiements passent par Stripe, avec un chiffrement conforme aux normes de l'industrie. Nous ne voyons ni ne conservons jamais les détails de votre carte.") },
    { icon: "📦", title: L("Track it like a pro", "Suivez-la comme un pro"), text: L("Enter your order number and email to watch your order go from paid to shipped to delivered.", "Entrez votre numéro de commande et votre courriel pour voir votre commande passer de payée à expédiée, puis livrée.") },
    CHAT_ON
      ? { icon: "💬", title: L("Answers on demand", "Des réponses à la demande"), text: L("Ask our AI assistant about products, shipping or returns any time, or write to a real person on the contact page.", "Posez vos questions sur les produits, la livraison ou les retours à notre assistant IA en tout temps, ou écrivez à une vraie personne sur la page de contact.") }
      : { icon: "💬", title: L("Real people, real replies", "De vraies personnes, de vraies réponses"), text: L("Questions about a product or an order? Write to us on the contact page. We read every message.", "Une question sur un produit ou une commande? Écrivez-nous sur la page de contact. Nous lisons chaque message.") },
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
  const NAV = () => [
    [L("Home", "Accueil"), "/index.html", "home"], [L("Shop", "Boutique"), "/shop.html", "shop"], [L("About", "À propos"), "/about.html", "about"],
    [L("FAQ", "FAQ"), "/faq.html", "faq"], [L("Contact", "Contact"), "/contact.html", "contact"], [L("Track order", "Suivi de commande"), "/track.html", "track"],
  ];
  function buildLayout() {
    const cur = PAGE === "product" ? "shop" : PAGE;
    $("#site-header").innerHTML = `
      <div class="promo" id="promo" hidden></div>
      <header class="top"><div class="wrap bar">
        <a class="logo" href="/index.html" aria-label="${L("Home", "Accueil")}"><span class="mark"></span><span class="shopName">Store</span></a>
        <nav class="nav" id="nav" aria-label="${L("Main", "Principale")}">${NAV().map(([l, h, k]) => `<a href="${h}"${k === cur ? ' aria-current="page"' : ""}>${l}</a>`).join("")}</nav>
        <div class="tools">
          <form class="search" role="search" action="/shop.html" method="get">
            <label class="sr" for="q">${L("Search products", "Rechercher un produit")}</label>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
            <input id="q" name="q" type="search" placeholder="${L("Search products", "Rechercher un produit")}" autocomplete="off" value="${esc(PAGE === "shop" ? state.q : "")}">
          </form>
          <button class="cartbtn" id="openCart" aria-label="${L("Open cart", "Ouvrir le panier")}"><span class="ct">${L("Cart", "Panier")}</span><b id="count">0</b></button>
          <div class="lang"><button class="langbtn" id="langBtn" aria-haspopup="true" aria-expanded="false" aria-label="${L("Language", "Langue")}">${LANG.toUpperCase()} ▾</button><ul class="langmenu" id="langMenu" hidden>${Object.entries(LANGS).map(([k, v]) => `<li><button data-lang="${k}" lang="${k}"${k === LANG ? ' aria-current="true"' : ""}>${v}</button></li>`).join("")}</ul></div>
          <button class="menubtn" id="menuBtn" aria-label="Menu" aria-expanded="false">☰</button>
        </div>
      </div></header>`;
    $("#site-footer").innerHTML = `
      <footer><div class="wrap">
        <div class="fgrid">
          <div><a class="logo" href="/index.html"><span class="mark"></span><span class="shopName">Store</span></a>
            <p>${L("Small upgrades, big difference. Everything for home, car, kids, pets and style, in one cart with secure checkout.", "Petites améliorations, grande différence. Tout pour la maison, l'auto, les enfants, les animaux et le style, dans un seul panier avec paiement sécurisé.")}</p></div>
          <div><h4>${L("Shop", "Boutique")}</h4><ul id="fshop"></ul></div>
          <div><h4>${L("Help", "Aide")}</h4><ul>
            <li><a href="/policy.html?p=shipping">${L("Shipping", "Livraison")}</a></li>
            <li><a href="/policy.html?p=returns">${L("Returns", "Retours")}</a></li>
            <li><a href="/track.html">${L("Track your order", "Suivre ma commande")}</a></li>
            <li><a href="/faq.html">${L("FAQ", "FAQ")}</a></li>
            <li><a href="/contact.html">${L("Contact", "Contact")}</a></li></ul></div>
          <div><h4>${L("Company", "Entreprise")}</h4><ul>
            <li><a href="/about.html">${L("About", "À propos")}</a></li>
            <li><a href="/policy.html?p=privacy">${L("Privacy policy", "Politique de confidentialité")}</a></li>
            <li><a href="/policy.html?p=terms">${L("Terms of sale", "Conditions de vente")}</a></li></ul></div>
        </div>
        <div class="legal"><span>© <span id="year"></span> <span class="shopName">Store</span>. ${L("All rights reserved.", "Tous droits réservés.")}</span><span>${L("Payments processed securely by Stripe.", "Paiements traités de façon sécurisée par Stripe.")}</span></div>
      </div></footer>`;
    document.body.insertAdjacentHTML("beforeend", `
      <div class="veil" id="veil"></div>
      <aside class="drawer" id="drawer" aria-label="${L("Cart", "Panier")}" aria-hidden="true">
        <header><h2 class="h">${L("Your cart", "Votre panier")}</h2><button class="x" id="closeCart" aria-label="${L("Close cart", "Fermer le panier")}">✕</button></header>
        <div id="shipbar"></div><div class="lines" id="lines"></div><div class="sum" id="sum"></div>
      </aside>
      <dialog id="infoDialog"><div class="info" id="infoBody"></div></dialog>
      <div class="toast" id="toast" role="status"></div>`);
    $("#year").textContent = new Date().getFullYear();
  }

  /* ---------- data ---------- */
  function applyData(d) {
    const s = d.settings || {};
    const pick = (k) => (LANG !== "en" && s[k + "_" + LANG]) || s[k];
    CONFIG = {
      shopName: s.store_name || "Store", currency: (s.currency || "cad").toUpperCase(), locale: { en: "en-CA", fr: "fr-CA", es: "es", ar: "ar-u-nu-latn" }[LANG],
      freeShippingFrom: Number(s.free_shipping_from) || 0, shippingFlat: Number(s.shipping_flat) || 0,
      contactEmail: s.contact_email || "", promo: pick("promo") || "",
    };
    POLICIES = { shipping: [L("Shipping", "Livraison"), pick("policy_shipping")], returns: [L("Returns", "Retours"), pick("policy_returns")], privacy: [L("Privacy policy", "Politique de confidentialité"), pick("policy_privacy")], terms: [L("Terms of sale", "Conditions de vente"), pick("policy_terms")] };
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
    const promo = CONFIG.promo || (CONFIG.freeShippingFrom ? Lt("Free shipping on orders over {0}", "Livraison gratuite dès {0} d'achats", money(CONFIG.freeShippingFrom)) : "");
    $("#promo").textContent = promo; $("#promo").hidden = !promo;
    $("#fshop").innerHTML = NICHES.map((n) => `<li><a href="/shop.html?cat=${esc(n.id)}">${esc(n.label)}</a></li>`).join("");
    const base = (PACK.titles && PACK.titles[PAGE]) || document.title.split("|").pop().trim();
    document.title = PAGE === "home" ? `${CONFIG.shopName} | ${base}` : `${base} | ${CONFIG.shopName}`;
  }

  /* ---------- product pieces ---------- */
  function media(p, { link = false, badge = false } = {}) {
    const n = nicheById[p.niche] || {};
    const inner = p.image
      ? `<img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy">`
      : `<span class="emoji" aria-hidden="true">${esc(p.emoji || n.emoji || "🛍️")}</span>`;
    const text = p.soldOut ? L("Sold out", "Épuisé") : ({ New: L("New", "Nouveau"), Popular: L("Popular", "Populaire"), Sale: L("Sale", "En solde") }[p.badge] || p.badge);
    const b = badge && text ? `<span class="badge${p.soldOut ? " out" : ""}">${esc(text)}</span>` : "";
    const attrs = `class="media${p.soldOut ? " is-out" : ""}" style="--accent:${esc(n.bg || "#4D8BFF")}"`;
    return link ? `<a ${attrs} href="/product.html?id=${p.id}" aria-label="${L("View", "Voir")} ${esc(p.name)}">${inner}${b}</a>` : `<div ${attrs}>${inner}${b}</div>`;
  }
  function cardHTML(p) {
    const n = nicheById[p.niche] || { label: "" };
    const old = p.compareAt ? `<s>${money(p.compareAt)}</s>` : "";
    return `<article class="card">
      <div class="mw">${media(p, { link: true, badge: true })}${p.soldOut ? "" : `<button class="quick" data-add="${p.id}" aria-label="${L("Add", "Ajouter")} ${esc(p.name)} ${L("to cart", "au panier")}">+</button>`}</div>
      <div class="meta"><span class="cname">${esc(n.label)}</span>
        <h3><a href="/product.html?id=${p.id}">${esc(p.name)}</a></h3>
        <span class="price">${money(p.price)}${old}</span></div></article>`;
  }

  /* ---------- pages ---------- */
  function pageHome() {
    const t = $("#hero-stats");
    if (t) t.innerHTML = `<div class="stat"><b>${PRODUCTS.length}</b><span>${L("Products", "Produits")}</span></div>
      <div class="stat"><b>${NICHES.length}</b><span>${L("Categories", "Catégories")}</span></div>
      <div class="stat"><b>Stripe</b><span>${L("Secure payments", "Paiements sécurisés")}</span></div>`;
    const orb = NICHES.slice(0, 6);
    if (!$(".hero .spot")) $(".hero").insertAdjacentHTML("afterbegin", '<div class="spot" aria-hidden="true"></div>');
    $("#orbit").innerHTML = `<div class="ring r1"></div><div class="ring r2"></div>
      <div class="spin">${orb.map((n, i) => `<a class="sat" href="/shop.html?cat=${esc(n.id)}" style="--a:${Math.round((360 / orb.length) * i)}deg;--c:${esc(n.bg)}" aria-label="${L("Shop", "Voir")} ${esc(n.label)}"><span>${esc(n.emoji)}</span></a>`).join("")}</div>
      <div class="core" aria-hidden="true">⚡</div>`;
    const names = NICHES.map((n) => `<span>${esc(n.label)}</span>`).join("");
    $("#marquee").innerHTML = `<div class="track">${names}${names}${names}${names}</div>`;
    $("#bento").innerHTML = NICHES.map((n) => {
      const c = PRODUCTS.filter((p) => p.niche === n.id).length;
      return `<a class="cat" style="--accent:${esc(n.bg)}" href="/shop.html?cat=${esc(n.id)}"><span class="em" aria-hidden="true">${esc(n.emoji)}</span><strong>${esc(n.label)}</strong><span class="n">${c} ${L(c === 1 ? "product" : "products", c === 1 ? "produit" : "produits")}</span></a>`;
    }).join("");
    let trending = PRODUCTS.filter((p) => p.badge && !p.soldOut).slice(0, 10);
    if (!trending.length) trending = PRODUCTS.slice(0, 10);
    $("#rail").innerHTML = trending.map(cardHTML).join("");
    $("#trending").hidden = !trending.length;
    $("#values").innerHTML = values().map((v) => `<div class="f"><i aria-hidden="true">${v.icon}</i><strong>${esc(v.title)}</strong><span>${esc(v.text)}</span></div>`).join("");
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
    $("#cats").innerHTML = [{ id: "all", label: L("All products", "Tous les produits") }, ...NICHES].map((n) => {
      const c = n.id === "all" ? PRODUCTS.length : PRODUCTS.filter((p) => p.niche === n.id).length;
      return `<button class="chip" data-chip="${esc(n.id)}" aria-pressed="false">${esc(n.label)}<small>${c}</small></button>`;
    }).join("");
    renderShop();
  }
  function renderShop() {
    const list = filtered();
    $("#title").textContent = state.q ? Lt('Results for "{0}"', "Résultats pour « {0} »", state.q) : (state.niche === "all" ? L("All products", "Tous les produits") : nicheById[state.niche].label);
    $("#found").textContent = `${list.length} ${L(list.length === 1 ? "product" : "products", list.length === 1 ? "produit" : "produits")}`;
    $("#maxOut").textContent = state.max >= MAXP ? L("Any price", "Tous les prix") : Lt("Up to {0}", "Jusqu'à {0}", money(state.max));
    $$("[data-chip]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.chip === state.niche)));
    $("#grid").innerHTML = list.length ? list.map(cardHTML).join("")
      : `<div class="empty"><strong>${PRODUCTS.length ? L("No products match your search.", "Aucun produit ne correspond à votre recherche.") : L("Products are coming soon.", "Les produits arrivent bientôt.")}</strong>${PRODUCTS.length ? `<p>${L("Try another word, raise the price limit or pick another category.", "Essayez un autre mot, augmentez la limite de prix ou choisissez une autre catégorie.")}</p><button class="btn primary" data-reset>${L("Show all products", "Voir tous les produits")}</button>` : ""}</div>`;
    const u = new URL(location.href);
    state.niche !== "all" ? u.searchParams.set("cat", state.niche) : u.searchParams.delete("cat");
    state.q ? u.searchParams.set("q", state.q) : u.searchParams.delete("q");
    history.replaceState(null, "", u);
    reveal();
  }

  function pageProduct() {
    const p = prodById[parseInt(params.get("id"), 10)];
    const box = $("#product");
    if (!p) {
      box.innerHTML = `<div class="empty"><strong>${L("We could not find this product.", "Nous n'avons pas trouvé ce produit.")}</strong><p>${L("It may have been removed.", "Il a peut-être été retiré.")}</p><a class="btn primary" href="/shop.html">${L("Back to the shop", "Retour à la boutique")}</a></div>`;
      return;
    }
    const n = nicheById[p.niche] || { label: "", id: "" };
    document.title = `${p.name} | ${CONFIG.shopName}`;
    const old = p.compareAt ? `<s>${money(p.compareAt)}</s>` : "";
    box.innerHTML = `
      <nav class="crumbs" aria-label="${L("Breadcrumb", "Fil d'Ariane")}"><a href="/index.html">${L("Home", "Accueil")}</a> / <a href="/shop.html">${L("Shop", "Boutique")}</a> / <a href="/shop.html?cat=${esc(n.id)}">${esc(n.label)}</a></nav>
      <div class="pgrid">
        ${media(p, { badge: true })}
        <div class="pinfo">
          <span class="cname">${esc(n.label)}</span>
          <h1 class="h">${esc(p.name)}</h1>
          <div class="big">${money(p.price)}${old}</div>
          ${paras(p.desc)}
          <ul class="perks"><li>${L("Secure checkout powered by Stripe", "Paiement sécurisé propulsé par Stripe")}</li><li>${L("Follow your order on the tracking page, any time", "Suivez votre commande sur la page de suivi, en tout temps")}</li><li>${L("Clear shipping and returns details before you buy", "Des détails clairs sur la livraison et les retours avant d'acheter")}</li><li>${p.soldOut ? L("Currently sold out, check back soon", "Actuellement épuisé, revenez bientôt") : L("In stock and ready for your cart", "En stock et prêt pour votre panier")}</li></ul>
          <div class="buy">${p.soldOut ? '<button class="btn primary" disabled>${L("Sold out", "Épuisé")}</button>' : `
            <div class="qty"><button data-pq="-1" aria-label="${L("Fewer", "Moins")}">−</button><span id="pq" aria-live="polite">1</span><button data-pq="1" aria-label="${L("More", "Plus")}">+</button></div>
            <button class="btn primary" data-add-page="${p.id}">${L("Add to cart", "Ajouter au panier")}</button>`}</div>
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
    $("#policy-body").innerHTML = text ? paras(text) : `<p>${L("This page is not available.", "Cette page n'est pas disponible.")}</p>`;
    document.title = `${title} | ${CONFIG.shopName}`;
  }

  function pageContact() {
    const el = $("#contactEmail");
    if (el) el.innerHTML = CONFIG.contactEmail ? `<a href="mailto:${esc(CONFIG.contactEmail)}">${esc(CONFIG.contactEmail)}</a>` : L("Use the form", "Utilisez le formulaire");
    $("#contactForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.target, out = $("#formNote"), btn = f.querySelector("button[type=submit]");
      btn.disabled = true; out.hidden = true;
      try {
        const r = await fetch("/api/contact", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: f.name.value, email: f.email.value, message: f.message.value, website: f.website.value, lang: LANG }) });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || L("Could not send your message.", "Impossible d'envoyer votre message."));
        f.reset(); out.className = "note ok"; out.textContent = L("Message sent. We will get back to you by email.", "Message envoyé. Nous vous répondrons par courriel.");
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
      $("#lines").innerHTML = `<div class="noitems"><p><strong>${L("Your cart is empty.", "Votre panier est vide.")}</strong></p><p>${L("Add a product to get started.", "Ajoutez un produit pour commencer.")}</p></div>`;
      $("#sum").innerHTML = `<button class="pay" disabled>${L("Checkout", "Passer à la caisse")}</button>`;
      return;
    }
    if (CONFIG.freeShippingFrom > 0) {
      const left = CONFIG.freeShippingFrom - sub;
      const pct = Math.min(100, Math.round((sub / CONFIG.freeShippingFrom) * 100));
      $("#shipbar").innerHTML = `<div class="ship">${left > 0 ? Lt("You are <b>{0}</b> away from free shipping.", "Il vous manque <b>{0}</b> pour la livraison gratuite.", money(left)) : L("<b>You unlocked free shipping.</b>", "<b>Vous avez débloqué la livraison gratuite.</b>")}<div class="bar2"><i style="width:${pct}%"></i></div></div>`;
    } else $("#shipbar").innerHTML = "";
    $("#lines").innerHTML = ids.map((id) => {
      const p = prodById[id], q = cart[id];
      return `<div class="line">${media(p)}
        <div><b class="n">${esc(p.name)}</b>
          <div class="qty"><button data-dec="${id}" aria-label="${L("Remove one", "En retirer un")}">−</button><span aria-live="polite">${q}</span><button data-inc="${id}" aria-label="${L("Add one", "En ajouter un")}">+</button></div>
          <button class="rm" data-rm="${id}">${L("Remove", "Retirer")}</button></div><b>${money(p.price * q)}</b></div>`;
    }).join("");
    const ship = shipping(sub);
    $("#sum").innerHTML = `
      <div><span>${L("Subtotal", "Sous-total")}</span><span>${money(sub)}</span></div>
      <div><span>${L("Shipping", "Livraison")}</span><span>${ship ? money(ship) : L("Free", "Gratuite")}</span></div>
      <div class="total"><span>${L("Total", "Total")}</span><span>${money(sub + ship)}</span></div>
      <button class="pay" id="pay">${L("Checkout", "Passer à la caisse")}</button>
      <small>${L("Taxes and final shipping are shown at checkout.", "Les taxes et la livraison finale sont affichées à la caisse.")}</small>`;
  }
  function setCart(id, qty) { if (qty <= 0) delete cart[id]; else cart[id] = Math.min(qty, 20); saveCart(); renderCart(); }
  function addToCart(id, n = 1, src) { const p = prodById[id]; if (!p || p.soldOut) return; setCart(id, (cart[id] || 0) + n); toast(L("Added to cart", "Ajouté au panier")); if (src) flyToCart(src); else bump(); }
  function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("on"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("on"), 2200); }
  function openCart() { $("#drawer").classList.add("on"); $("#veil").classList.add("on"); $("#drawer").setAttribute("aria-hidden", "false"); $("#closeCart").focus(); }
  function closeCart() { $("#drawer").classList.remove("on"); $("#veil").classList.remove("on"); $("#drawer").setAttribute("aria-hidden", "true"); }
  function showMsg(title, html) {
    $("#infoBody").innerHTML = `<button class="x" data-close aria-label="${L("Close", "Fermer")}">✕</button><h2 class="h">${esc(title)}</h2>${html}`;
    $("#infoDialog").showModal();
  }

  /* Only ids and quantities are sent. The server looks up the real prices. */
  async function checkout() {
    const btn = $("#pay"); if (btn) { btn.disabled = true; btn.textContent = L("Redirecting to secure payment...", "Redirection vers le paiement sécurisé..."); }
    const items = Object.entries(cart).filter(([id]) => prodById[id]).map(([id, q]) => ({ id: +id, qty: q }));
    try {
      const r = await fetch("/api/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items, lang: LANG }) });
      const d = await r.json();
      if (!r.ok || !d.url) throw new Error(d.error || L("Checkout unavailable", "Paiement indisponible"));
      location.href = d.url;
    } catch (e) {
      renderCart();
      showMsg(L("Checkout unavailable", "Paiement indisponible"), `<p>${esc(e.message || L("We could not start checkout. Please try again.", "Nous n'avons pas pu démarrer le paiement. Veuillez réessayer."))}</p>`);
    }
  }
  function handleReturn() {
    const o = params.get("order");
    if (!o) return;
    const u = new URL(location.href); u.searchParams.delete("order"); history.replaceState(null, "", u);
    if (o === "success") {
      cart = {}; saveCart(); renderCart();
      const n = parseInt(params.get("n"), 10);
      showMsg(L("Thank you for your order!", "Merci pour votre commande!"), `<p>${L("Your payment was received. A receipt is on its way to your email.", "Votre paiement a été reçu. Un reçu est en route vers votre courriel.")}</p>${n ? `<p>${Lt('Your order number is <b>#{0}</b>. Keep it: you can follow your order any time on the <a href="/track.html?n={0}">tracking page</a>.', 'Votre numéro de commande est le <b>n° {0}</b>. Conservez-le : vous pouvez suivre votre commande en tout temps sur la <a href="/track.html?n={0}">page de suivi</a>.', n)}</p>` : ""}`);
      confetti();
    }
    else if (o === "cancelled") toast(L("Checkout cancelled. Your cart is saved.", "Paiement annulé. Votre panier est conservé."));
  }

  /* ---------- events ---------- */
  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-add],[data-add-page],[data-inc],[data-dec],[data-rm],[data-close],[data-chip],[data-reset],[data-pq],#pay,#openCart,#closeCart,#veil,#menuBtn,#langBtn,[data-lang]");
    if (!t) return;
    if (t.id === "langBtn") { const m = $("#langMenu"); m.hidden = !m.hidden; return t.setAttribute("aria-expanded", String(!m.hidden)); }
    if (t.dataset.lang) { try { localStorage.setItem("nk_lang", t.dataset.lang); } catch (err) {} const u = new URL(location.href); u.searchParams.delete("lang"); return (location.href = u.toString()); }
    if (t.id === "openCart") return openCart();
    if (t.id === "closeCart" || t.id === "veil") return closeCart();
    if (t.id === "menuBtn") { const o = $("#nav").classList.toggle("open"); return t.setAttribute("aria-expanded", String(o)); }
    if (t.id === "pay") return checkout();
    if (t.dataset.add) return addToCart(+t.dataset.add, 1, t.closest(".mw") && t.closest(".mw").querySelector(".media"));
    if (t.dataset.addPage) return addToCart(+t.dataset.addPage, pageQty, $(".pgrid .media"));
    if (t.dataset.pq) { pageQty = Math.max(1, Math.min(20, pageQty + +t.dataset.pq)); return ($("#pq").textContent = pageQty); }
    if (t.dataset.inc) return setCart(t.dataset.inc, (cart[t.dataset.inc] || 0) + 1);
    if (t.dataset.dec) return setCart(t.dataset.dec, (cart[t.dataset.dec] || 0) - 1);
    if (t.dataset.rm) return setCart(t.dataset.rm, 0);
    if (t.hasAttribute("data-close")) return t.closest("dialog").close();
    if (t.dataset.chip) { state.niche = t.dataset.chip; return renderShop(); }
    if (t.hasAttribute("data-reset")) { state = { niche: "all", q: "", sort: "pop", max: MAXP }; $("#q").value = ""; $("#sort").value = "pop"; $("#max").value = MAXP; return renderShop(); }
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeCart(); const m = $("#langMenu"); if (m) m.hidden = true; } });
  document.addEventListener("click", (e) => { const m = $("#langMenu"); if (m && !m.hidden && !e.target.closest(".lang")) m.hidden = true; });


  /* ---------- order tracking page ---------- */
  function pageTrack() {
    const f = $("#trackForm"), note = $("#trackNote"), out = $("#trackResult");
    if (params.get("n")) f.order.value = params.get("n");
    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = f.querySelector("button[type=submit]");
      btn.disabled = true; note.hidden = true;
      try {
        const r = await fetch("/api/track", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ order: f.order.value, email: f.email.value, lang: LANG }) });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || L("We could not find your order.", "Nous n'avons pas trouvé votre commande."));
        out.innerHTML = trackHTML(d.order);
        requestAnimationFrame(() => requestAnimationFrame(() => { const i = out.querySelector(".track-bar i"); if (i) i.style.width = i.dataset.w; }));
      } catch (err) { note.className = "note bad"; note.textContent = err.message; note.hidden = false; }
      btn.disabled = false;
    });
  }
  function trackHTML(o) {
    const steps = [L("Paid", "Payée"), L("Shipped", "Expédiée"), L("Delivered", "Livrée")];
    const idx = { paid: 0, shipped: 1, delivered: 2 }[o.status];
    const cancelled = o.status === "cancelled";
    const w = cancelled ? 0 : Math.round(((idx + 1) / steps.length) * 100);
    const msg = cancelled ? L("This order was cancelled.", "Cette commande a été annulée.") : o.status === "paid" ? L("We received your payment and we are preparing your order.", "Nous avons reçu votre paiement et nous préparons votre commande.") : o.status === "shipped" ? L("Your order is on its way.", "Votre commande est en route.") : L("Your order was delivered. Enjoy!", "Votre commande a été livrée. Profitez-en!");
    return `<div class="cardbox trk">
      <h3>${L("Order #", "Commande n° ")}${o.id}</h3>
      <p>${L("Placed on", "Passée le")} ${esc(new Date(o.placed).toLocaleDateString(CONFIG.locale, { year: "numeric", month: "long", day: "numeric" }))}${o.city ? ` | ${L("Shipping to", "Livraison à")} ${esc(o.city)}` : ""}</p>
      ${cancelled ? "" : `<ol class="steps">${steps.map((s, i) => `<li class="${i <= idx ? "done" : ""}${i === idx ? " now" : ""}"><i>${i < idx ? "✓" : i + 1}</i><span>${s}</span></li>`).join("")}</ol>
      <div class="track-bar"><i data-w="${w}%" style="width:0"></i></div>`}
      <p class="track-msg">${esc(msg)}</p>
      ${o.tracking ? `<p>${L("Tracking number:", "Numéro de suivi :")} <b>${esc(o.tracking)}</b></p>` : (o.status === "paid" ? `<p>${L("A tracking number will appear here once your order ships.", "Un numéro de suivi apparaîtra ici dès que votre commande sera expédiée.")}</p>` : "")}
      <ul class="perks">${o.items.map((i) => `<li>${esc(i.qty)} x ${esc(i.name)}</li>`).join("")}</ul>
      <p>${L("Total paid:", "Total payé :")} <b>${money(o.total_cents / 100)}</b></p>
      <p>${L(`Need help? <a href="/contact.html">Contact us</a> with your order number.`, `Besoin d'aide? <a href="/contact.html">Contactez-nous</a> avec votre numéro de commande.`)}</p></div>`;
  }

  /* ---------- motion and effects ---------- */
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;
  let io = null;

  function countUp(el) {
    if (!el || el.dataset.done) return;
    const m = /^\d+$/.exec(el.textContent.trim());
    if (!m) return;
    el.dataset.done = "1";
    const end = +m[0], t0 = performance.now(), dur = 1100;
    el.textContent = "0";
    const step = (t) => { const p = Math.min(1, (t - t0) / dur); el.textContent = Math.round(end * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }

  function reveal() {
    if (reduceMotion || !("IntersectionObserver" in window)) return;
    const sel = ".sec-head,.aiband,.statement,.cat,.card,.f,.banner,.stat,.faq details,.two>*,.cardbox,.form,.phead .wrap>*,.pgrid>*,.side";
    io = io || new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        const el = en.target;
        el.classList.add("in");
        if (el.matches(".stat")) countUp(el.querySelector("b"));
        el.addEventListener("transitionend", (ev) => { if (ev.propertyName === "opacity") el.classList.remove("rv", "in"); });
        io.unobserve(el);
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -5% 0px" });
    $$(sel).filter((e) => !e.dataset.rvd).forEach((e) => {
      e.dataset.rvd = "1";
      e.style.setProperty("--i", Math.min([...e.parentElement.children].indexOf(e), 8));
      e.classList.add("rv");
      io.observe(e);
    });
  }

  function initFx() {
    if (reduceMotion || !finePointer || initFx.done) return;
    initFx.done = true;
    let raf = 0;
    document.addEventListener("pointermove", (e) => {
      const m = e.target.closest && e.target.closest(".card .media");
      if (m) {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          const r = m.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
          m.style.setProperty("--rx", ((0.5 - y) * 10).toFixed(2) + "deg");
          m.style.setProperty("--ry", ((x - 0.5) * 12).toFixed(2) + "deg");
          m.style.setProperty("--mx", (x * 100).toFixed(1) + "%");
          m.style.setProperty("--my", (y * 100).toFixed(1) + "%");
        });
      }
      const h = e.target.closest && e.target.closest(".hero");
      if (h) {
        const r = h.getBoundingClientRect();
        h.style.setProperty("--mx", e.clientX - r.left + "px");
        h.style.setProperty("--my", e.clientY - r.top + "px");
        h.style.setProperty("--px", ((e.clientX - r.left) / r.width - 0.5) * -26 + "px");
        h.style.setProperty("--py", ((e.clientY - r.top) / r.height - 0.5) * -26 + "px");
      }
    });
    document.addEventListener("pointerout", (e) => {
      const m = e.target.closest && e.target.closest(".card .media");
      if (m && !m.contains(e.relatedTarget)) { m.style.setProperty("--rx", "0deg"); m.style.setProperty("--ry", "0deg"); }
    });
  }

  function bump() { const c = $("#count"); if (!c) return; c.classList.remove("bump"); void c.offsetWidth; c.classList.add("bump"); }

  function flyToCart(src) {
    const cartBtn = $("#openCart");
    if (reduceMotion || !src || !cartBtn || !src.animate) return bump();
    const a = src.getBoundingClientRect(), b = cartBtn.getBoundingClientRect();
    const f = document.createElement("div");
    f.className = "fly";
    const inner = src.querySelector("img,.emoji");
    f.innerHTML = inner ? inner.outerHTML : "🛍️";
    f.style.left = a.left + a.width / 2 - 32 + "px";
    f.style.top = a.top + a.height / 2 - 32 + "px";
    document.body.appendChild(f);
    const dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2);
    f.animate([
      { transform: "translate(0,0) scale(1)", opacity: 1 },
      { transform: `translate(${dx * 0.45}px,${dy * 0.45 - 90}px) scale(.85)`, opacity: 1, offset: 0.5 },
      { transform: `translate(${dx}px,${dy}px) scale(.15)`, opacity: 0.25 },
    ], { duration: 750, easing: "cubic-bezier(.5,0,.7,.4)" }).finished.then(() => { f.remove(); bump(); }).catch(() => f.remove());
  }

  function confetti() {
    if (reduceMotion) return;
    const box = document.createElement("div");
    box.className = "confetti";
    const colors = ["#22E5FF", "#3D6BFF", "#8B5CFF", "#38F2A5", "#FFD23F", "#FF7AB6"];
    for (let i = 0; i < 70; i++) {
      const s = document.createElement("span");
      s.style.cssText = `left:${Math.random() * 100}%;background:${colors[i % 6]};--dx:${(Math.random() - 0.5) * 300}px;--r:${Math.random() * 720}deg;animation-delay:${Math.random() * 0.5}s;animation-duration:${2 + Math.random() * 1.5}s`;
      box.appendChild(s);
    }
    ($("#infoDialog[open]") || document.body).appendChild(box);
    setTimeout(() => box.remove(), 4500);
  }

  function skeleton() {
    const card = '<div class="card"><div class="sk"></div><div class="sk-line"></div><div class="sk-line short"></div></div>';
    const g = $("#grid"); if (g) g.innerHTML = card.repeat(8);
    const r = $("#rail"); if (r) r.innerHTML = card.repeat(5);
  }

  /* ---------- AI support chat ---------- */
  function initChat(available) {
    if (!available || $("#chatFab")) return;
    const box = document.createElement("div");
    box.className = "chat";
    box.innerHTML = `
      <button class="chat-fab" id="chatFab" aria-label="${L("Open support chat", "Ouvrir le clavardage")}" aria-expanded="false"><span aria-hidden="true">💬</span><span class="chat-lbl">${L("Ask us", "Une question?")}</span></button>
      <section class="chat-panel" id="chatPanel" aria-label="${L("Customer support chat", "Clavardage du service à la clientèle")}" hidden>
        <header><div><b>${L("Support", "Assistance")}</b><small>${L("AI assistant, replies instantly", "Assistant IA, réponses instantanées")}</small></div><button class="x" id="chatClose" aria-label="${L("Close chat", "Fermer le clavardage")}">✕</button></header>
        <div class="chat-log" id="chatLog" aria-live="polite"></div>
        <div class="chat-sugg" id="chatSugg">
          <a href="/track.html">${L("Where is my order?", "Où est ma commande?")}</a>
          <button type="button" data-q="${L("How much is shipping?", "Combien coûte la livraison?")}">${L("Shipping costs", "Frais de livraison")}</button>
          <button type="button" data-q="${L("What is your return policy?", "Quelle est votre politique de retour?")}">${L("Returns", "Retours")}</button>
          <a href="/contact.html">${L("Talk to a person", "Parler à une personne")}</a>
        </div>
        <form class="chat-form" id="chatForm"><input id="chatIn" maxlength="500" placeholder="${L("Type your question", "Écrivez votre question")}" autocomplete="off" aria-label="${L("Your message", "Votre message")}"><button class="btn primary" type="submit" aria-label="${L("Send", "Envoyer")}">${L("Send", "Envoyer")}</button></form>
        <small class="chat-note">${L(`AI can make mistakes. For orders, use <a href="/track.html">order tracking</a>.`, `L'IA peut faire des erreurs. Pour une commande, utilisez le <a href="/track.html">suivi de commande</a>.`)}</small>
      </section>`;
    document.body.appendChild(box);
    const fab = $("#chatFab"), panel = $("#chatPanel"), log = $("#chatLog"), input = $("#chatIn");
    const hist = [];
    const band = $("#aiBand"); if (band) band.hidden = false;
    document.addEventListener("click", (e) => { if (e.target.closest("[data-open-chat]")) setOpen(true); });
    const fmt = (t) => esc(t).replace(/\/(track|contact|shop|faq)\.html/g, '<a href="/$1.html">/$1.html</a>').replace(/\n/g, "<br>");
    const add = (role, text) => { const d = document.createElement("div"); d.className = "cm " + role; d.innerHTML = fmt(text); log.appendChild(d); log.scrollTop = log.scrollHeight; return d; };
    add("bot", L("Hi! I am the AI assistant. Ask me about products, shipping or returns. I reply in your language.", "Bonjour! Je suis l'assistant IA. Posez-moi vos questions sur les produits, la livraison ou les retours. Je réponds dans votre langue."));
    const setOpen = (o) => { panel.hidden = !o; fab.setAttribute("aria-expanded", String(o)); if (o) input.focus(); };
    fab.addEventListener("click", () => setOpen(panel.hidden));
    $("#chatClose").addEventListener("click", () => setOpen(false));
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !panel.hidden) setOpen(false); });
    async function send(text) {
      text = text.trim(); if (!text) return;
      add("user", text); hist.push({ role: "user", content: text }); input.value = "";
      const typing = add("bot typing", "..."); typing.innerHTML = "<i></i><i></i><i></i>";
      $("#chatSugg").hidden = true;
      try {
        const r = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: hist.slice(-8), lang: LANG }) });
        const d = await r.json();
        typing.remove();
        if (!r.ok) throw new Error(d.error || L("The assistant is unavailable.", "L'assistant est indisponible."));
        hist.push({ role: "assistant", content: d.reply }); add("bot", d.reply);
      } catch (err) { typing.remove(); add("bot", err.message + L(" You can also write to us on /contact.html", " Vous pouvez aussi nous écrire sur /contact.html")); }
    }
    $("#chatForm").addEventListener("submit", (e) => { e.preventDefault(); send(input.value); });
    $("#chatSugg").addEventListener("click", (e) => { const b = e.target.closest("[data-q]"); if (b) send(b.dataset.q); });
  }

  /* ---------- start ---------- */
  (async function init() {
    await loadPack();
    buildLayout();
    if (LANG !== "en" && PACK.pages && PACK.pages[PAGE]) $("#main").innerHTML = PACK.pages[PAGE];
    skeleton();
    document.addEventListener("click", (e) => { if (e.target.id === "infoDialog") e.target.close(); });
    let data;
    try {
      const r = await fetch("/api/store?lang=" + LANG);
      if (!r.ok) throw new Error("store");
      data = await r.json();
    } catch (e) {
      const main = $("#main");
      if (main) main.innerHTML = `<div class="wrap sec"><div class="empty"><strong>${L("The store is temporarily unavailable.", "La boutique est temporairement indisponible.")}</strong><p>${L("Please refresh the page in a moment.", "Veuillez actualiser la page dans un instant.")}</p></div></div>`;
      return;
    }
    CHAT_ON = !!data.chat;
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
    if (PAGE === "track") pageTrack();
    initFx(); reveal(); initChat(data.chat);
    handleReturn();
  })();
})();
