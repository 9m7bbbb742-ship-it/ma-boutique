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
  let PACK = {};
  // L(english, french): French is inline; Spanish and Arabic come from the language pack, keyed by the English text.
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

  /* ---------- helpers ---------- */
  const PAGE = document.body.dataset.page || "home";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const norm = (s) => String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const paras = (t) => String(t || "").split(/\n{2,}/).filter(Boolean).map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("");
  const store = {
    get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  };
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const I = {
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
    heart: '<path d="M12 20s-7.500-4.500-9.300-9.600C1.500 7 3.800 4 7 4c2 0 3.400 1.100 5 3.100C13.600 5.100 15 4 17 4c3.200 0 5.500 3 4.300 6.400C19.500 15.500 12 20 12 20z"/>',
    bag: '<path d="M5 8h14l-1 12H6L5 8z"/><path d="M9 8V6a3 3 0 016 0v2"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    grid: '<path d="M4 11l8-7 8 7v9H4z"/><path d="M10 20v-6h4v6"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    chev: '<path d="M6 9l6 6 6-6"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    check: '<path d="M5 12l5 5 9-10"/>',
    truck: '<path d="M3 7h11v9H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="18" r="1.600"/><circle cx="17" cy="18" r="1.600"/>',
    shield: '<path d="M12 3l8 3v6c0 5-3.500 8-8 9-4.500-1-8-4-8-9V6l8-3z"/><path d="M9 12l2 2 4-4"/>',
    pin: '<path d="M12 21s7-6.200 7-11a7 7 0 10-14 0c0 4.800 7 11 7 11z"/><circle cx="12" cy="10" r="2.500"/>',
    chat: '<path d="M4 5h16v11H9l-5 4V5z"/>',
    zoom: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.500-3.500M8 11h6M11 8v6"/>',
    filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
  };
  const ic = (n, c = "") => `<svg class="ic ${c}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[n]}</svg>`;

  /* ---------- state ---------- */
  let CONFIG = { shopName: "Store", currency: "CAD", locale: "en-CA", freeShippingFrom: 0, shippingFlat: 0, contactEmail: "", promo: "" };
  let POLICIES = {}, NICHES = [], PRODUCTS = [], nicheById = {}, prodById = {}, MAXP = 60, CHAT_ON = false;
  let cart = store.get("nk_cart", {});
  let wish = store.get("nk_wish", []);
  let recent = store.get("nk_recent", []);
  let searches = store.get("nk_searches", []);
  const params = new URLSearchParams(location.search);

  const money = (n) => new Intl.NumberFormat(CONFIG.locale, { style: "currency", currency: CONFIG.currency }).format(n);
  const toneOf = (id) => "t" + (Math.max(0, NICHES.findIndex((n) => n.id === id)) % 5);
  const catLabel = (id) => (nicheById[id] ? nicheById[id].label : "");

  /* ---------- data ---------- */
  function applyData(d) {
    const s = d.settings || {};
    const pick = (k) => (LANG !== "en" && s[k + "_" + LANG]) || s[k];
    CONFIG = {
      shopName: s.store_name || "Store", currency: (s.currency || "cad").toUpperCase(),
      locale: { en: "en-CA", fr: "fr-CA", es: "es", ar: "ar-u-nu-latn" }[LANG],
      freeShippingFrom: Number(s.free_shipping_from) || 0, shippingFlat: Number(s.shipping_flat) || 0,
      contactEmail: s.contact_email || "", promo: pick("promo") || "",
    };
    POLICIES = {
      shipping: [L("Shipping", "Livraison"), pick("policy_shipping")], returns: [L("Returns", "Retours"), pick("policy_returns")],
      privacy: [L("Privacy policy", "Politique de confidentialité"), pick("policy_privacy")], terms: [L("Terms of sale", "Conditions de vente"), pick("policy_terms")],
    };
    NICHES = d.categories || [];
    PRODUCTS = d.products || [];
    CHAT_ON = !!d.chat;
    nicheById = Object.fromEntries(NICHES.map((n) => [n.id, n]));
    prodById = Object.fromEntries(PRODUCTS.map((p) => [p.id, p]));
    MAXP = Math.max(10, Math.ceil(Math.max(0, ...PRODUCTS.map((p) => p.price))));
    // keep the cart, wishlist and history in step with the live catalog
    const before = Object.keys(cart).length;
    Object.keys(cart).forEach((id) => { if (!prodById[id]) delete cart[id]; });
    if (Object.keys(cart).length !== before) { store.set("nk_cart", cart); setTimeout(() => toast(L("Some items are no longer available and were removed from your cart.", "Certains articles ne sont plus disponibles et ont été retirés de votre panier.")), 900); }
    wish = wish.filter((id) => prodById[id]); recent = recent.filter((id) => prodById[id]);
  }

  /* ---------- product pieces ---------- */
  function media(p, { link = false, badge = false, fit = "" } = {}) {
    const cls = `media ${toneOf(p.niche)}${p.soldOut ? " is-out" : ""} ${fit}`;
    const inner = p.image
      ? `<img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy" decoding="async" data-fb="${esc(p.emoji || nicheById[p.niche]?.emoji || "")}">`
      : `<span class="emoji" aria-hidden="true">${esc(p.emoji || nicheById[p.niche]?.emoji || "🛍️")}</span>`;
    const text = p.soldOut ? L("Sold out", "Épuisé") : ({ New: L("New", "Nouveau"), Popular: L("Popular", "Populaire"), Sale: L("Sale", "En solde") }[p.badge] || p.badge);
    const b = badge && text ? `<span class="badge${p.soldOut ? " out" : ""}">${esc(text)}</span>` : "";
    return link
      ? `<a class="${cls}" href="/product.html?id=${p.id}" aria-label="${L("View", "Voir")} ${esc(p.name)}">${inner}${b}</a>`
      : `<div class="${cls}">${inner}${b}</div>`;
  }
  const priceHTML = (p) => `<span class="price">${money(p.price)}${p.compareAt ? `<s>${money(p.compareAt)}</s><span class="off sm">-${Math.round((1 - p.price / p.compareAt) * 100)}%</span>` : ""}</span>`;
  const heartBtn = (id) => `<button class="heart" data-wish="${id}" aria-pressed="${wish.includes(id)}" aria-label="${wish.includes(id) ? L("Remove from wishlist", "Retirer de la liste d'envies") : L("Add to wishlist", "Ajouter à la liste d'envies")}">${ic("heart")}</button>`;
  function cardHTML(p) {
    return `<article class="card">
      <div class="mw">${media(p, { link: true, badge: true })}${heartBtn(p.id)}<button class="qv" data-quick="${p.id}" aria-label="${L("Quick view", "Aperçu rapide")}: ${esc(p.name)}">${ic("eye")}<span>${L("Quick view", "Aperçu rapide")}</span></button></div>
      <div class="meta"><span class="cname">${esc(catLabel(p.niche))}</span><h3><a href="/product.html?id=${p.id}">${esc(p.name)}</a></h3>${priceHTML(p)}</div>
      ${p.soldOut ? `<button class="btn ghost add-full" disabled>${L("Sold out", "Épuisé")}</button>` : `<button class="btn primary add-full" data-add="${p.id}" aria-label="${L("Add", "Ajouter")} ${esc(p.name)} ${L("to cart", "au panier")}">${L("Add to cart", "Ajouter au panier")}</button>`}</article>`;
  }
  const skeletonCards = (n) => Array(n).fill('<div class="card"><div class="sk"></div><div class="sk-line"></div><div class="sk-line short"></div></div>').join("");

  /* ---------- cart / wishlist / recent ---------- */
  const saveCart = () => store.set("nk_cart", cart);
  const subtotal = () => Object.entries(cart).reduce((s, [id, q]) => s + (prodById[id]?.price || 0) * q, 0);
  const shipping = (sub) => (sub === 0 ? 0 : (CONFIG.freeShippingFrom > 0 && sub >= CONFIG.freeShippingFrom ? 0 : CONFIG.shippingFlat));
  function setCart(id, qty) { if (qty <= 0) delete cart[id]; else cart[id] = Math.min(qty, 20); saveCart(); renderCart(); renderWish(); }
  function addToCart(id, n = 1, src) {
    const p = prodById[id]; if (!p || p.soldOut) return;
    setCart(id, (cart[id] || 0) + n); toast(L("Added to cart", "Ajouté au panier"));
    if (src) flyToCart(src); else bump();
  }
  function toggleWish(id) {
    id = +id; const i = wish.indexOf(id);
    if (i >= 0) wish.splice(i, 1); else wish.unshift(id);
    store.set("nk_wish", wish);
    $$(`[data-wish="${id}"]`).forEach((b) => { const on = wish.includes(id); b.setAttribute("aria-pressed", String(on)); b.setAttribute("aria-label", on ? L("Remove from wishlist", "Retirer de la liste d'envies") : L("Add to wishlist", "Ajouter à la liste d'envies")); });
    renderWish(); toast(i >= 0 ? L("Removed from wishlist", "Retiré de la liste d'envies") : L("Saved to wishlist", "Ajouté à la liste d'envies"));
  }
  function remember(id) { recent = [id, ...recent.filter((x) => x !== id)].slice(0, 8); store.set("nk_recent", recent); }

  function lineHTML(p, q) {
    return `<div class="line">${media(p)}
      <div><b class="n"><a href="/product.html?id=${p.id}">${esc(p.name)}</a></b>${p.soldOut ? `<span class="soldtag">${L("Sold out", "Épuisé")}</span>` : ""}
        <div class="qty"><button data-dec="${p.id}" aria-label="${L("Remove one", "En retirer un")}">${ic("minus")}</button><span aria-live="polite">${q}</span><button data-inc="${p.id}" aria-label="${L("Add one", "En ajouter un")}">${ic("plus")}</button></div>
        <button class="rm" data-rm="${p.id}">${L("Remove", "Retirer")}</button></div><b>${money(p.price * q)}</b></div>`;
  }
  function renderCart() {
    const ids = Object.keys(cart).filter((id) => prodById[id]);
    const n = ids.reduce((a, id) => a + cart[id], 0);
    $$(".cart-n").forEach((c) => { c.textContent = n; c.hidden = n === 0; });
    const lines = $("#lines"); if (!lines) return;
    const sub = subtotal();
    if (!ids.length) {
      $("#shipbar").innerHTML = "";
      lines.innerHTML = `<div class="noitems"><p><strong>${L("Your cart is empty.", "Votre panier est vide.")}</strong></p><p>${L("Add a product to get started.", "Ajoutez un produit pour commencer.")}</p><a class="btn primary" href="/shop.html">${L("Start shopping", "Commencer le magasinage")}</a></div>${recoHTML([])}`;
      $("#sum").innerHTML = `<button class="pay" disabled>${L("Checkout", "Passer à la caisse")}</button>`;
      return;
    }
    if (CONFIG.freeShippingFrom > 0) {
      const left = CONFIG.freeShippingFrom - sub, pct = Math.min(100, Math.round((sub / CONFIG.freeShippingFrom) * 100));
      $("#shipbar").innerHTML = `<div class="ship">${left > 0 ? Lt("You are <b>{0}</b> away from free shipping.", "Il vous manque <b>{0}</b> pour la livraison gratuite.", money(left)) : L("<b>You unlocked free shipping.</b>", "<b>Vous avez débloqué la livraison gratuite.</b>")}<div class="bar2"><i style="width:${pct}%"></i></div></div>`;
    } else $("#shipbar").innerHTML = "";
    lines.innerHTML = ids.map((id) => lineHTML(prodById[id], cart[id])).join("") + recoHTML(ids);
    const ship = shipping(sub), anySold = ids.some((id) => prodById[id].soldOut);
    $("#sum").innerHTML = `
      <div><span>${L("Subtotal", "Sous-total")}</span><span>${money(sub)}</span></div>
      <div><span>${L("Shipping", "Livraison")}</span><span>${ship ? money(ship) : L("Free", "Gratuite")}</span></div>
      <div class="total"><span>${L("Total", "Total")}</span><span>${money(sub + ship)}</span></div>
      <button class="pay" id="pay"${anySold ? " disabled" : ""}>${L("Checkout", "Passer à la caisse")}</button>
      <small>${anySold ? L("Remove the sold-out items to continue.", "Retirez les articles épuisés pour continuer.") : L("Taxes and final shipping are shown at checkout.", "Les taxes et la livraison finale sont affichées à la caisse.")}</small>`;
  }
  function recoHTML(ids) {
    const cats = new Set(ids.map((id) => prodById[id].niche));
    let list = PRODUCTS.filter((p) => !p.soldOut && !cart[p.id] && (!cats.size || cats.has(p.niche))).slice(0, 3);
    if (list.length < 3) list = [...list, ...PRODUCTS.filter((p) => !p.soldOut && !cart[p.id] && !list.includes(p))].slice(0, 3);
    if (!list.length) return "";
    return `<div class="reco"><h3>${L("You might also like", "Vous aimerez aussi")}</h3>${list.map((p) => `<div class="mini"><a href="/product.html?id=${p.id}">${media(p)}</a><div><a class="mn" href="/product.html?id=${p.id}">${esc(p.name)}</a>${priceHTML(p)}</div><button class="add-btn sm" data-add="${p.id}" aria-label="${L("Add", "Ajouter")} ${esc(p.name)} ${L("to cart", "au panier")}">${ic("plus")}</button></div>`).join("")}</div>`;
  }
  function renderWish() {
    $$(".wish-n").forEach((w) => { w.textContent = wish.length; w.hidden = wish.length === 0; });
    const box = $("#wlines"); if (!box) return;
    if (!wish.length) { box.innerHTML = `<div class="noitems"><p><strong>${L("Your wishlist is empty.", "Votre liste d'envies est vide.")}</strong></p><p>${L("Tap the heart on a product to save it here.", "Touchez le cœur d'un produit pour le garder ici.")}</p><a class="btn primary" href="/shop.html">${L("Discover products", "Découvrir les produits")}</a></div>`; return; }
    box.innerHTML = wish.map((id) => prodById[id]).filter(Boolean).map((p) => `<div class="line">${media(p)}<div><b class="n"><a href="/product.html?id=${p.id}">${esc(p.name)}</a></b>${priceHTML(p)}
      <div class="wact">${p.soldOut ? `<span class="soldtag">${L("Sold out", "Épuisé")}</span>` : `<button class="btn primary sm" data-move="${p.id}">${L("Move to cart", "Mettre au panier")}</button>`}<button class="rm" data-wish="${p.id}">${L("Remove", "Retirer")}</button></div></div><span></span></div>`).join("");
  }

  /* ---------- toast, fly, bump ---------- */
  function toast(msg) { const t = $("#toast"); if (!t) return; t.textContent = msg; t.classList.add("on"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("on"), 2200); }
  function bump() { $$(".cart-n").forEach((c) => { c.classList.remove("bump"); void c.offsetWidth; c.classList.add("bump"); }); }
  function flyToCart(src) {
    const target = $("#openCart");
    if (reduceMotion || !src || !target || !src.animate) return bump();
    const a = src.getBoundingClientRect(), b = target.getBoundingClientRect();
    const f = document.createElement("div"); f.className = "fly";
    const inner = src.querySelector("img,.emoji"); f.innerHTML = inner ? inner.outerHTML : "";
    f.style.left = a.left + a.width / 2 - 28 + "px"; f.style.top = a.top + a.height / 2 - 28 + "px";
    document.body.appendChild(f);
    const dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2);
    f.animate([{ transform: "translate(0,0) scale(1)", opacity: 1 }, { transform: `translate(${dx}px,${dy}px) scale(.2)`, opacity: 0.3 }], { duration: 650, easing: "cubic-bezier(.5,0,.7,.4)" })
      .finished.then(() => { f.remove(); bump(); }).catch(() => f.remove());
  }

  /* ---------- layout ---------- */
  const NAV = () => [[L("Home", "Accueil"), "/index.html", "home"], [L("Shop", "Boutique"), "/shop.html", "shop"], [L("About", "À propos"), "/about.html", "about"],
    [L("FAQ", "FAQ"), "/faq.html", "faq"], [L("Contact", "Contact"), "/contact.html", "contact"], [L("Track order", "Suivi de commande"), "/track.html", "track"]];
  const langMenu = () => `<div class="lang"><button class="langbtn" id="langBtn" aria-haspopup="true" aria-expanded="false" aria-label="${L("Language", "Langue")}">${LANG.toUpperCase()}${ic("chev")}</button><ul class="langmenu" id="langMenu" hidden>${Object.entries(LANGS).map(([k, v]) => `<li><button data-lang="${k}" lang="${k}"${k === LANG ? ' aria-current="true"' : ""}>${v}</button></li>`).join("")}</ul></div>`;

  function buildLayout() {
    const cur = PAGE === "product" ? "shop" : PAGE;
    $("#site-header").innerHTML = `
      <div class="progress" id="progress" aria-hidden="true"></div>
      <div class="promo" id="promo" hidden></div>
      <header class="top" id="top">
        <div class="wrap bar">
          <button class="icon-btn menubtn" id="menuBtn" aria-label="${L("Menu", "Menu")}" aria-expanded="false" aria-controls="mnav">${ic("menu")}</button>
          <a class="logo" href="/index.html" aria-label="${L("Home", "Accueil")}"><span class="mark" aria-hidden="true"></span><span class="shopName">Store</span></a>
          <form class="search" role="search" id="searchForm" action="/shop.html" method="get" autocomplete="off">
            <label class="sr" for="q">${L("Search products", "Rechercher un produit")}</label>
            <input id="q" name="q" type="search" role="combobox" aria-expanded="false" aria-controls="sugg" aria-autocomplete="list" placeholder="${L("Search a product, a category...", "Rechercher un produit, une catégorie...")}" value="${esc(PAGE === "shop" ? params.get("q") || "" : "")}">
            <button class="s-btn" type="submit" aria-label="${L("Search", "Rechercher")}">${ic("search")}</button>
            <div class="sugg" id="sugg" role="listbox" hidden></div>
          </form>
          <div class="tools">
            ${langMenu()}
            <button class="icon-btn lbl-btn" id="openWish" aria-label="${L("Open wishlist", "Ouvrir la liste d'envies")}">${ic("heart")}<span class="lbl">${L("Wishlist", "Favoris")}</span><b class="dot wish-n" hidden>0</b></button>
            <button class="icon-btn lbl-btn" id="openCart" aria-label="${L("Open cart", "Ouvrir le panier")}">${ic("bag")}<span class="lbl">${L("Cart", "Panier")}</span><b class="dot cart-n" hidden>0</b></button>
          </div>
        </div>
        <div class="catbar"><div class="wrap cb">
          <div class="mm" id="mmWrap"><button class="allcats" id="mmBtn" aria-expanded="false" aria-controls="mm">${ic("menu")}<span>${L("All categories", "Toutes les catégories")}</span></button><div class="mm-panel" id="mm" hidden></div></div>
          <nav class="catlinks" id="catlinks" aria-label="${L("Categories", "Catégories")}"></nav>
          <nav class="infolinks" id="nav" aria-label="${L("Main", "Principale")}">${NAV().filter(([, , k]) => k !== "home" && k !== "shop").map(([l, h, k]) => `<a href="${h}"${k === cur ? ' aria-current="page"' : ""}>${l}</a>`).join("")}</nav>
        </div></div>
      </header>`;
    $("#site-footer").innerHTML = `
      <footer><div class="wrap">
        <div class="fgrid">
          <div><a class="logo" href="/index.html"><span class="mark" aria-hidden="true"></span><span class="shopName">Store</span></a>
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
        <header><h2 class="h">${L("Your cart", "Votre panier")}</h2><button class="x" id="closeCart" data-close-drawer aria-label="${L("Close cart", "Fermer le panier")}">${ic("close")}</button></header>
        <div id="shipbar"></div><div class="lines" id="lines"></div><div class="sum" id="sum"></div>
      </aside>
      <aside class="drawer" id="wdrawer" aria-label="${L("Wishlist", "Liste d'envies")}" aria-hidden="true">
        <header><h2 class="h">${L("Your wishlist", "Votre liste d'envies")}</h2><button class="x" data-close-drawer aria-label="${L("Close", "Fermer")}">${ic("close")}</button></header>
        <div class="lines" id="wlines"></div>
      </aside>
      <aside class="drawer left" id="mnav" aria-label="${L("Menu", "Menu")}" aria-hidden="true">
        <header><a class="logo" href="/index.html"><span class="mark" aria-hidden="true"></span><span class="shopName">Store</span></a><button class="x" data-close-drawer aria-label="${L("Close menu", "Fermer le menu")}">${ic("close")}</button></header>
        <nav class="mlinks" id="mlinks" aria-label="${L("Main", "Principale")}"></nav>
      </aside>
      <dialog id="infoDialog"><div class="info" id="infoBody"></div></dialog>
      <dialog id="qvDialog" aria-label="${L("Quick view", "Aperçu rapide")}"><div class="qv-box" id="qvBody"></div></dialog>
      <dialog id="lbDialog" class="lb" aria-label="${L("Image viewer", "Visionneuse d'images")}"><div id="lbBody"></div></dialog>
      <button class="totop" id="toTop" aria-label="${L("Back to top", "Haut de page")}" hidden>${ic("arrow", "up")}</button>
      <nav class="tabbar" aria-label="${L("Quick navigation", "Navigation rapide")}">
        <a href="/index.html"${PAGE === "home" ? ' aria-current="page"' : ""}>${ic("grid")}<span>${L("Home", "Accueil")}</span></a>
        <button data-tab="cats">${ic("menu")}<span>${L("Categories", "Catégories")}</span></button>
        <button data-tab="search">${ic("search")}<span>${L("Search", "Recherche")}</span></button>
        <button data-tab="wish">${ic("heart")}<span>${L("Wishlist", "Favoris")}</span><b class="dot wish-n" hidden>0</b></button>
        <button data-tab="cart">${ic("bag")}<span>${L("Cart", "Panier")}</span><b class="dot cart-n" hidden>0</b></button>
      </nav>
      <div class="toast" id="toast" role="status"></div>`);
    $("#year").textContent = new Date().getFullYear();
  }

  function applyShell() {
    $$(".shopName").forEach((e) => (e.textContent = CONFIG.shopName));
    $$(".logo .shopName").forEach((e) => { const n = CONFIG.shopName, k = Math.ceil(n.length / 2); e.innerHTML = esc(n.slice(0, k)) + "<b>" + esc(n.slice(k)) + "</b>"; });
    $("#catlinks").innerHTML = NICHES.slice(0, 6).map((n) => `<a href="/shop.html?cat=${esc(n.id)}">${esc(n.label)}</a>`).join("");
    const promo = CONFIG.promo || (CONFIG.freeShippingFrom ? Lt("Free shipping on orders over {0}", "Livraison gratuite dès {0} d'achats", money(CONFIG.freeShippingFrom)) : "");
    $("#promo").textContent = promo; $("#promo").hidden = !promo;
    $("#fshop").innerHTML = NICHES.map((n) => `<li><a href="/shop.html?cat=${esc(n.id)}">${esc(n.label)}</a></li>`).join("");
    $("#mlinks").innerHTML = NAV().map(([l, h, k]) => `<a href="${h}"${k === (PAGE === "product" ? "shop" : PAGE) ? ' aria-current="page"' : ""}>${l}</a>`).join("")
      + `<h3>${L("Categories", "Catégories")}</h3>` + NICHES.map((n) => `<a class="sub" href="/shop.html?cat=${esc(n.id)}">${esc(n.label)}</a>`).join("")
      + `<h3>${L("Language", "Langue")}</h3><div class="mlang">${Object.entries(LANGS).map(([k, v]) => `<button data-lang="${k}" lang="${k}"${k === LANG ? ' aria-current="true"' : ""}>${v}</button>`).join("")}</div>`;
    // mega menu: real categories with real products
    $("#mm").innerHTML = `<div class="mm-grid">${NICHES.slice(0, 6).map((n, i) => {
      const ps = PRODUCTS.filter((p) => p.niche === n.id).slice(0, 3);
      return `<div class="mm-col t${i % 5}"><a class="mm-h" href="/shop.html?cat=${esc(n.id)}">${esc(n.label)}</a><ul>${ps.map((p) => `<li><a href="/product.html?id=${p.id}">${media(p)}<span>${esc(p.name)}</span></a></li>`).join("")}</ul></div>`;
    }).join("")}</div><a class="mm-all" href="/shop.html">${L("Shop all products", "Voir tous les produits")}${ic("arrow", "arr")}</a>`;
    const base = (PACK.titles && PACK.titles[PAGE]) || document.title.split("|").pop().trim();
    if (PAGE !== "product") document.title = PAGE === "home" ? `${CONFIG.shopName} | ${base}` : `${base} | ${CONFIG.shopName}`;
    setMeta("og:site_name", CONFIG.shopName, "property");
    let can = $('link[rel="canonical"]'); if (!can) { can = document.createElement("link"); can.rel = "canonical"; document.head.appendChild(can); }
    can.href = location.origin + location.pathname + (PAGE === "product" ? "?id=" + (params.get("id") || "") : "");
  }
  function setMeta(name, content, attr = "name") {
    let m = $(`meta[${attr}="${name}"]`); if (!m) { m = document.createElement("meta"); m.setAttribute(attr, name); document.head.appendChild(m); }
    m.setAttribute("content", content);
  }

  /* ---------- overlays: drawers with focus management ---------- */
  let openEl = null, lastFocus = null;
  function openDrawer(el) {
    closeDrawer(true); lastFocus = document.activeElement; openEl = el;
    el.classList.add("on"); el.setAttribute("aria-hidden", "false"); $("#veil").classList.add("on"); document.body.classList.add("noscroll");
    setTimeout(() => { const f = el.querySelector("a[href],button:not([disabled]),input"); if (f) f.focus(); }, 60);
  }
  function closeDrawer(silent) {
    if (!openEl) return;
    openEl.classList.remove("on"); openEl.setAttribute("aria-hidden", "true"); $("#veil").classList.remove("on"); document.body.classList.remove("noscroll");
    const was = openEl; openEl = null;
    if (!silent && lastFocus && lastFocus.focus) lastFocus.focus();
    return was;
  }
  document.addEventListener("keydown", (e) => {
    if (e.key === "Tab" && openEl) {
      const f = $$("a[href],button:not([disabled]),input,select,textarea", openEl).filter((x) => x.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    if (e.key === "Escape") { closeDrawer(); closeMega(); const m = $("#langMenu"); if (m) m.hidden = true; const s = $("#sugg"); if (s) { s.hidden = true; $("#q") && $("#q").setAttribute("aria-expanded", "false"); } }
  });
  function showMsg(title, html, ok) {
    $("#infoBody").innerHTML = `<button class="x" data-close aria-label="${L("Close", "Fermer")}">${ic("close")}</button>${ok ? `<div class="okmark" aria-hidden="true"><svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="24"/><path d="M14 27l8 8 16-17"/></svg></div>` : ""}<h2 class="h">${esc(title)}</h2>${html}`;
    $("#infoDialog").showModal();
  }

  /* ---------- mega menu ---------- */
  let mmTimer;
  const openMega = () => { clearTimeout(mmTimer); const p = $("#mm"); if (!p) return; p.hidden = false; $("#mmBtn").setAttribute("aria-expanded", "true"); requestAnimationFrame(() => p.classList.add("on")); };
  function closeMega() { const p = $("#mm"); if (!p || p.hidden) return; p.classList.remove("on"); $("#mmBtn").setAttribute("aria-expanded", "false"); mmTimer = setTimeout(() => { p.hidden = true; }, 180); }
  function initMega() {
    const w = $("#mmWrap"); if (!w) return;
    const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
    if (fine) { w.addEventListener("mouseenter", openMega); w.addEventListener("mouseleave", () => { mmTimer = setTimeout(closeMega, 140); }); }
    $("#mmBtn").addEventListener("click", () => ($("#mm").hidden ? openMega() : closeMega()));
    w.addEventListener("focusout", (e) => { if (!w.contains(e.relatedTarget)) closeMega(); });
  }

  /* ---------- live search ---------- */
  function initSearch() {
    const inp = $("#q"), box = $("#sugg"), form = $("#searchForm");
    if (!inp) return;
    let active = -1, timer;
    const set = (h) => { box.innerHTML = h; box.hidden = !h; inp.setAttribute("aria-expanded", String(!!h)); active = -1; inp.removeAttribute("aria-activedescendant"); };
    const render = () => {
      const q = inp.value.trim();
      if (!q) {
        if (!searches.length) return set("");
        return set(`<div class="sg-h"><span>${L("Recent searches", "Recherches récentes")}</span><button type="button" data-clear-searches>${L("Clear", "Effacer")}</button></div>`
          + searches.map((s, i) => `<a role="option" id="sg${i}" class="sg-r" href="/shop.html?q=${encodeURIComponent(s)}">${ic("search")}<span>${esc(s)}</span></a>`).join("")
          + `<p class="sg-n">${L("Saved on this device only.", "Enregistré sur cet appareil seulement.")}</p>`);
      }
      const nq = norm(q), res = PRODUCTS.filter((p) => norm(p.name + " " + p.desc + " " + catLabel(p.niche)).includes(nq)).slice(0, 6);
      set(res.length
        ? res.map((p, i) => `<a role="option" id="sg${i}" class="sg-p" href="/product.html?id=${p.id}">${media(p)}<span class="sg-t"><b>${esc(p.name)}</b><small>${esc(catLabel(p.niche))}</small></span>${priceHTML(p)}</a>`).join("")
          + `<a role="option" id="sg${res.length}" class="sg-all" href="/shop.html?q=${encodeURIComponent(q)}">${Lt('See all results for "{0}"', 'Voir tous les résultats pour « {0} »', esc(q))}</a>`
        : `<p class="sg-n">${Lt('No results for "{0}". Try another word.', 'Aucun résultat pour « {0} ». Essayez un autre mot.', esc(q))}</p>`);
    };
    inp.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(render, 120); });
    inp.addEventListener("focus", render);
    inp.addEventListener("keydown", (e) => {
      const opts = $$('[role="option"]', box);
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        if (!opts.length) return; e.preventDefault();
        active = (active + (e.key === "ArrowDown" ? 1 : -1) + opts.length) % opts.length;
        opts.forEach((o, i) => o.classList.toggle("is-active", i === active)); inp.setAttribute("aria-activedescendant", opts[active].id);
      } else if (e.key === "Enter" && active >= 0 && opts[active]) { e.preventDefault(); location.href = opts[active].href; }
    });
    form.addEventListener("submit", () => { const q = inp.value.trim(); if (q) { searches = [q, ...searches.filter((s) => s !== q)].slice(0, 5); store.set("nk_searches", searches); } });
    document.addEventListener("click", (e) => { if (!e.target.closest(".search")) { box.hidden = true; inp.setAttribute("aria-expanded", "false"); } });
    box.addEventListener("click", (e) => { if (e.target.closest("[data-clear-searches]")) { searches = []; store.set("nk_searches", searches); set(""); } });
  }

  /* ---------- motion: header, progress, reveal, magnet, spotlight, parallax ---------- */
  let io = null;
  function reveal() {
    if (reduceMotion || !("IntersectionObserver" in window)) return;
    const sel = ".sec-head,.statement,.cat-tile,.col-panel,.card,.f,.banner,.faq details,.two>*,.cardbox,.form,.phead .wrap>*,.trust li,.news,.aiband,.pgrid>*";
    io = io || new IntersectionObserver((entries) => entries.forEach((en) => {
      if (!en.isIntersecting) return;
      const el = en.target; el.classList.add("in");
      el.addEventListener("transitionend", (ev) => { if (ev.propertyName === "opacity") el.classList.remove("rv", "in"); });
      io.unobserve(el);
    }), { threshold: 0.1, rootMargin: "0px 0px -4% 0px" });
    $$(sel).filter((e) => !e.dataset.rvd).forEach((e) => {
      e.dataset.rvd = "1"; e.style.setProperty("--i", Math.min([...e.parentElement.children].indexOf(e), 8)); e.classList.add("rv"); io.observe(e);
    });
  }
  function initMotion() {
    const top = $("#top"); let lastY = scrollY, tick = false;
    const onScroll = () => {
      const y = scrollY; top.classList.toggle("scrolled", y > 8);
      const lock = openEl || !$("#mm").hidden || document.activeElement === $("#q") || (innerWidth <= 1020);
      if (y > 140 && y > lastY + 6 && !lock) top.classList.add("hide"); else if (y < lastY - 4 || y < 140) top.classList.remove("hide");
      lastY = y; const t = $("#toTop"); if (t) t.hidden = y < 700;
      if (!reduceMotion) $$("[data-par]").forEach((el) => { const r = el.parentElement.getBoundingClientRect(); if (r.bottom > 0 && r.top < innerHeight) el.style.transform = `translate3d(0,${(-r.top * parseFloat(el.dataset.par)).toFixed(1)}px,0)`; });
      tick = false;
    };
    addEventListener("scroll", () => { if (!tick) { tick = true; requestAnimationFrame(onScroll); } }, { passive: true }); onScroll();
    const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
    if (fine && !reduceMotion) {
      document.addEventListener("pointermove", (e) => {
        const m = e.target.closest && e.target.closest(".mag");
        if (m) { const r = m.getBoundingClientRect(); m.style.transform = `translate(${((e.clientX - r.left) / r.width - 0.5) * 8}px,${((e.clientY - r.top) / r.height - 0.5) * 6}px)`; }
        const s = e.target.closest && e.target.closest(".spot-card");
        if (s) { const r = s.getBoundingClientRect(); s.style.setProperty("--mx", e.clientX - r.left + "px"); s.style.setProperty("--my", e.clientY - r.top + "px"); }
      });
      document.addEventListener("pointerout", (e) => { const m = e.target.closest && e.target.closest(".mag"); if (m && !m.contains(e.relatedTarget)) m.style.transform = ""; });
    }
    // slim progress bar while a page opens
    document.addEventListener("click", (e) => {
      const a = e.target.closest && e.target.closest("a[href]");
      if (a && a.origin === location.origin && !a.target && !e.metaKey && !e.ctrlKey && a.getAttribute("href")[0] !== "#") progress(true);
    });
    addEventListener("pageshow", () => progress(false));
  }
  function progress(on) { const p = $("#progress"); if (!p) return; p.classList.toggle("on", on); }
  function morph(btn) {
    if (!btn || btn.dataset.busy) return; btn.dataset.busy = "1"; const html = btn.innerHTML; btn.classList.add("done");
    btn.innerHTML = `${ic("check")}<span>${L("Added", "Ajouté")}</span>`;
    setTimeout(() => { btn.innerHTML = html; btn.classList.remove("done"); delete btn.dataset.busy; }, 1400);
  }
  function heartBurst(btn) {
    if (reduceMotion || !btn.animate) return;
    const r = btn.getBoundingClientRect();
    for (let i = 0; i < 6; i++) {
      const s = document.createElement("span"); s.className = "pt"; s.style.left = r.left + r.width / 2 - 3 + "px"; s.style.top = r.top + r.height / 2 - 3 + "px"; document.body.appendChild(s);
      const a = (Math.PI * 2 * i) / 6, d = 22 + Math.random() * 10;
      s.animate([{ transform: "translate(0,0) scale(1)", opacity: 1 }, { transform: `translate(${Math.cos(a) * d}px,${Math.sin(a) * d}px) scale(.2)`, opacity: 0 }], { duration: 520, easing: "ease-out" }).finished.then(() => s.remove()).catch(() => s.remove());
    }
  }

  /* ---------- home ---------- */
  function railWrap(inner, label) {
    return `<div class="rail-wrap"><button class="rail-btn prev" data-rail="-1" aria-label="${L("Previous", "Précédent")}: ${esc(label)}">${ic("arrow", "arr flip")}</button><div class="rail" tabindex="0" aria-label="${esc(label)}">${inner}</div><button class="rail-btn next" data-rail="1" aria-label="${L("Next", "Suivant")}: ${esc(label)}">${ic("arrow", "arr")}</button></div>`;
  }
  function pageHome() {
    const withImg = PRODUCTS.filter((p) => p.image), hero = [...withImg, ...PRODUCTS.filter((p) => !p.image)].slice(0, 3);
    let popular = PRODUCTS.filter((p) => p.badge === "Popular" && !p.soldOut); if (!popular.length) popular = PRODUCTS.filter((p) => !p.soldOut);
    popular = popular.slice(0, 10);
    const fresh = PRODUCTS.filter((p) => p.badge === "New" && !p.soldOut).slice(0, 10);
    const free = CONFIG.freeShippingFrom > 0, cats = NICHES.filter((n) => PRODUCTS.some((p) => p.niche === n.id));
    const thumb = (n) => PRODUCTS.find((p) => p.niche === n.id && p.image) || PRODUCTS.find((p) => p.niche === n.id);
    const panels = cats.slice(0, 2).map((n, i) => ({ n, ps: PRODUCTS.filter((p) => p.niche === n.id).slice(0, 3), t: i }));
    const rec = recent.map((id) => prodById[id]).filter(Boolean).slice(0, 6);
    $("#main").innerHTML = `
    <section class="hero2"><div class="wrap hero-grid">
      <div class="hero-copy">
        <span class="pill2">${L("The must-haves of the moment", "Les incontournables du moment")}</span>
        <h1 class="h">${L("Smart solutions for <em>a simpler everyday life!</em>", "Des solutions malines pour <em>un quotidien plus simple!</em>")}</h1>
        <p class="lead">${L("Discover useful, innovative and trending products across every category, all in one cart with secure checkout.", "Découvrez des produits utiles, innovants et tendance dans toutes les catégories, dans un seul panier avec paiement sécurisé.")}</p>
        <div class="cta"><a class="btn primary mag" href="/shop.html">${L("Discover now", "Découvrir maintenant")}${ic("arrow", "arr")}</a><a class="btn ghost" href="#categories" data-scroll="categories">${L("Browse categories", "Parcourir les catégories")}</a></div>
      </div>
      <div class="hero-art">
        <span class="blob b1" data-par="0.06"></span><span class="blob b2" data-par="-0.05"></span>
        ${hero.map((p, i) => `<a class="hc hc${i}" href="/product.html?id=${p.id}">${media(p)}<span class="hc-t"><b>${esc(p.name)}</b>${priceHTML(p)}</span></a>`).join("")}
      </div>
    </div></section>

    <section class="trust" aria-label="${L("Our commitments", "Nos engagements")}"><ul class="wrap">
      <li>${ic("truck")}<div><b>${free ? Lt("Free shipping from {0}", "Livraison gratuite dès {0}", money(CONFIG.freeShippingFrom)) : L("Clear shipping", "Livraison claire")}</b><span>${free ? L("Delivery is on us once your cart reaches the amount.", "La livraison est à nos frais dès que votre panier atteint ce montant.") : L("A simple fee, shown before you pay.", "Un tarif simple, affiché avant de payer.")}</span></div></li>
      <li>${ic("shield")}<div><b>${L("Secure payment", "Paiement sécurisé")}</b><span>${L("Handled by Stripe. We never see your card.", "Géré par Stripe. Nous ne voyons jamais votre carte.")}</span></div></li>
      <li>${ic("pin")}<div><b>${L("Order tracking", "Suivi de commande")}</b><span>${L("Follow every order with your order number.", "Suivez chaque commande avec votre numéro.")}</span></div></li>
      <li>${ic("chat")}<div><b>${L("Customer support", "Service à la clientèle")}</b><span>${CHAT_ON ? L("Ask our assistant or write to us.", "Demandez à notre assistant ou écrivez-nous.") : L("Write to us, we read every message.", "Écrivez-nous, nous lisons chaque message.")}</span></div></li>
    </ul></section>

    <section class="sec" id="categories"><div class="wrap">
      <div class="sec-head"><div><h2 class="h">${L("Our favorite categories", "Nos catégories favorites")}</h2><p>${L("From the nursery to the car, find your aisle.", "De la chambre de bébé à l'auto, trouvez votre rayon.")}</p></div><a class="link" href="/shop.html">${L("See all categories", "Voir toutes les catégories")}${ic("arrow", "arr")}</a></div>
      <div class="cat-row">${cats.map((n, i) => { const p = thumb(n), c = PRODUCTS.filter((x) => x.niche === n.id).length;
        return `<a class="cat-tile spot-card t${i % 5}" href="/shop.html?cat=${esc(n.id)}"><span class="ct-img">${p ? media(p) : ""}</span><span class="ct-t"><b>${esc(n.label)}</b><small>${c} ${L(c === 1 ? "product" : "products", c === 1 ? "produit" : "produits")}</small></span><span class="ct-go">${ic("arrow", "arr")}</span></a>`; }).join("")}</div>
    </div></section>

    <section class="sec tight" id="popular"><div class="wrap">
      <div class="sec-head"><div><h2 class="h">${L("Popular picks", "Choix populaires")}</h2><p>${L("Hand-picked favorites from our shelves.", "Des favoris choisis avec soin dans nos rayons.")}</p></div><a class="link" href="/shop.html">${L("See all", "Voir tout")}${ic("arrow", "arr")}</a></div>
      ${railWrap(popular.map(cardHTML).join(""), L("Popular picks", "Choix populaires"))}
    </div></section>

    ${fresh.length ? `<section class="sec tight"><div class="wrap"><div class="sec-head"><div><h2 class="h">${L("Just in", "Nouveautés")}</h2><p>${L("Fresh additions to the shelves.", "Les derniers arrivages sur nos tablettes.")}</p></div><a class="link" href="/shop.html?badge=New">${L("See what is new", "Voir les nouveautés")}${ic("arrow", "arr")}</a></div>${railWrap(fresh.map(cardHTML).join(""), L("Just in", "Nouveautés"))}</div></section>` : ""}

    <section class="sec tight"><div class="wrap promo-trio">
      <a class="pp spot-card pp-a" href="/shop.html"><span class="pp-k">${L("Great finds", "Les bonnes affaires")}</span><b>${free ? Lt("Free shipping over {0}", "Livraison gratuite dès {0}", money(CONFIG.freeShippingFrom)) : L("Everything in one cart", "Tout dans un seul panier")}</b><span class="btn primary sm">${L("See the selection", "Voir la sélection")}${ic("arrow", "arr")}</span></a>
      ${panels.map((o) => `<a class="pp spot-card pp-${o.t ? "c" : "b"}" href="/shop.html?cat=${esc(o.n.id)}"><span class="pp-k">${L("Explore", "Explorer")}</span><b>${esc(o.n.label)}</b><span class="pp-th">${o.ps.map((p) => media(p)).join("")}</span><span class="btn ghost sm">${L("See the collection", "Voir la collection")}${ic("arrow", "arr")}</span></a>`).join("")}
    </div></section>

    ${rec.length ? `<section class="sec tight"><div class="wrap"><div class="sec-head"><div><h2 class="h">${L("Recently viewed", "Vus récemment")}</h2></div></div>${railWrap(rec.map(cardHTML).join(""), L("Recently viewed", "Vus récemment"))}</div></section>` : ""}

    <section class="sec"><div class="wrap">
      <div class="sec-head"><div><h2 class="h">${L("Why shop with us", "Pourquoi magasiner chez nous")}</h2><p>${L("Simple, clear and secure from the first tap to your door.", "Simple, clair et sécurisé, du premier clic à votre porte.")}</p></div></div>
      <div class="feat" id="values"></div>
    </div></section>

    ${CHAT_ON ? `<section class="sec tight"><div class="wrap"><div class="aiband"><div><h2 class="h">${L("Questions at 2 a.m.? We have got you.", "Une question à 2 h du matin? On s'en occupe.")}</h2><p>${L("Our AI assistant is on shift around the clock. Ask about products, shipping or returns and get an answer in seconds, in your language.", "Notre assistant IA est de garde jour et nuit. Posez vos questions sur les produits, la livraison ou les retours et obtenez une réponse en quelques secondes, dans votre langue.")}</p></div><button class="btn primary mag" type="button" data-open-chat>${L("Ask the assistant", "Parler à l'assistant")}</button></div></div></section>` : ""}`;
    const v = [
      [L("Free shipping that kicks in fast", "Une livraison gratuite qui arrive vite"), L("Reach the free-shipping amount and delivery is on us. Your cart shows exactly how close you are.", "Atteignez le montant de livraison gratuite et la livraison est à nos frais. Votre panier vous montre exactement où vous en êtes.")],
      [L("Checkout you can trust", "Un paiement en toute confiance"), L("Payments run on Stripe with industry-standard encryption. We never see or store your card details.", "Les paiements passent par Stripe, avec un chiffrement conforme aux normes de l'industrie. Nous ne voyons ni ne conservons jamais les détails de votre carte.")],
      [L("Track it like a pro", "Suivez-la comme un pro"), L("Enter your order number and email to watch your order go from paid to shipped to delivered.", "Entrez votre numéro de commande et votre courriel pour voir votre commande passer de payée à expédiée, puis livrée.")],
    ];
    $("#values").innerHTML = v.map(([t, x]) => `<div class="f"><i aria-hidden="true">${ic("check")}</i><strong>${esc(t)}</strong><span>${esc(x)}</span></div>`).join("");
  }

  /* ---------- shop: filters synced with the URL ---------- */
  const PAGE_SIZE = 12;
  let S = { cat: "", q: "", min: "", max: "", sort: "pop", stock: false, badge: "", shown: PAGE_SIZE };
  const numOr = (v) => (v !== null && v !== "" && !isNaN(+v) && +v >= 0 ? String(+v) : "");
  function readUrl() {
    const p = new URLSearchParams(location.search);
    S = { cat: nicheById[p.get("cat")] ? p.get("cat") : "", q: (p.get("q") || "").trim().slice(0, 80), min: numOr(p.get("min")), max: numOr(p.get("max")),
      sort: ["asc", "desc", "name"].includes(p.get("sort")) ? p.get("sort") : "pop", stock: p.get("stock") === "1", badge: ["New", "Popular", "Sale"].includes(p.get("badge")) ? p.get("badge") : "", shown: PAGE_SIZE };
  }
  function writeUrl(push) {
    const p = new URLSearchParams();
    if (S.cat) p.set("cat", S.cat); if (S.q) p.set("q", S.q); if (S.min) p.set("min", S.min); if (S.max) p.set("max", S.max);
    if (S.sort !== "pop") p.set("sort", S.sort); if (S.stock) p.set("stock", "1"); if (S.badge) p.set("badge", S.badge);
    const qs = p.toString(), url = location.pathname + (qs ? "?" + qs : "");
    if (url !== location.pathname + location.search) history[push ? "pushState" : "replaceState"](null, "", url);
  }
  function filtered() {
    let l = PRODUCTS.filter((p) => (!S.cat || p.niche === S.cat) && (!S.min || p.price >= +S.min) && (!S.max || p.price <= +S.max) && (!S.stock || !p.soldOut) && (!S.badge || (S.badge === "Sale" ? (p.badge === "Sale" || p.compareAt) : p.badge === S.badge)));
    if (S.q) { const q = norm(S.q); l = l.filter((p) => norm(p.name + " " + p.desc + " " + catLabel(p.niche)).includes(q)); }
    if (S.sort === "asc") l = [...l].sort((a, b) => a.price - b.price);
    if (S.sort === "desc") l = [...l].sort((a, b) => b.price - a.price);
    if (S.sort === "name") l = [...l].sort((a, b) => a.name.localeCompare(b.name, LANG));
    return l;
  }
  function renderFilters() {
    const badges = ["New", "Popular", "Sale"].filter((b) => PRODUCTS.some((p) => p.badge === b));
    const bl = { New: L("New", "Nouveau"), Popular: L("Popular", "Populaire"), Sale: L("Sale", "En solde") };
    $("#filters").innerHTML = `
      <div class="side-head"><h2 class="h">${L("Filters", "Filtres")}</h2><button class="x" data-close-filters aria-label="${L("Close", "Fermer")}">${ic("close")}</button></div>
      <fieldset><legend>${L("Category", "Catégorie")}</legend><div class="cats">${[{ id: "", label: L("All products", "Tous les produits") }, ...NICHES].map((n) => `<button class="chip" data-fcat="${esc(n.id)}" aria-pressed="${S.cat === n.id}">${esc(n.label)}<small>${n.id ? PRODUCTS.filter((p) => p.niche === n.id).length : PRODUCTS.length}</small></button>`).join("")}</div></fieldset>
      <fieldset><legend>${L("Price", "Prix")}</legend><div class="pr"><label>${L("Min", "Min")}<input id="fmin" type="number" inputmode="decimal" min="0" step="1" value="${esc(S.min)}" placeholder="0"></label><label>${L("Max", "Max")}<input id="fmax" type="number" inputmode="decimal" min="0" step="1" value="${esc(S.max)}" placeholder="${MAXP}"></label></div></fieldset>
      <fieldset><legend>${L("Availability", "Disponibilité")}</legend><label class="chk"><input id="fstock" type="checkbox"${S.stock ? " checked" : ""}> ${L("In stock only", "En stock seulement")}</label></fieldset>
      ${badges.length ? `<fieldset><legend>${L("Label", "Étiquette")}</legend><div class="cats">${badges.map((b) => `<button class="chip" data-fbadge="${b}" aria-pressed="${S.badge === b}">${bl[b]}</button>`).join("")}</div></fieldset>` : ""}
      <div class="side-foot"><button class="btn ghost" data-clear>${L("Clear all filters", "Effacer tous les filtres")}</button><button class="btn primary" data-close-filters id="showRes">${Lt("Show {0} results", "Voir {0} résultats", filtered().length)}</button></div>`;
  }
  function renderShop() {
    const all = filtered(), list = all.slice(0, S.shown);
    $("#title").textContent = S.q ? Lt('Results for "{0}"', "Résultats pour « {0} »", S.q) : (S.cat ? catLabel(S.cat) : L("All products", "Tous les produits"));
    $("#toolbar").innerHTML = `<p id="resCount" aria-live="polite">${all.length} ${L(all.length === 1 ? "product" : "products", all.length === 1 ? "produit" : "produits")}</p>
      <button class="btn ghost sm filters-btn" data-open-filters>${ic("filter")}${L("Filters", "Filtres")}</button>
      <label class="sort">${L("Sort by", "Trier par")}<select id="sort">${[["pop", L("Featured", "En vedette")], ["asc", L("Price: low to high", "Prix : croissant")], ["desc", L("Price: high to low", "Prix : décroissant")], ["name", L("Name A to Z", "Nom de A à Z")]].map(([v, t]) => `<option value="${v}"${S.sort === v ? " selected" : ""}>${t}</option>`).join("")}</select></label>`;
    const chips = [];
    if (S.cat) chips.push(["cat", catLabel(S.cat)]); if (S.q) chips.push(["q", `"${S.q}"`]);
    if (S.min || S.max) chips.push(["price", `${S.min ? money(+S.min) : money(0)} - ${S.max ? money(+S.max) : "∞"}`]);
    if (S.stock) chips.push(["stock", L("In stock only", "En stock seulement")]); if (S.badge) chips.push(["badge", { New: L("New", "Nouveau"), Popular: L("Popular", "Populaire"), Sale: L("Sale", "En solde") }[S.badge]]);
    $("#activeChips").innerHTML = chips.length ? chips.map(([k, t]) => `<button class="achip" data-rmf="${k}" aria-label="${L("Remove filter", "Retirer le filtre")}: ${esc(t)}">${esc(t)}${ic("close")}</button>`).join("") + `<button class="link" data-clear>${L("Clear all filters", "Effacer tous les filtres")}</button>` : "";
    $("#grid").innerHTML = list.length ? list.map(cardHTML).join("") : `<div class="empty"><strong>${PRODUCTS.length ? L("No products match your search.", "Aucun produit ne correspond à votre recherche.") : L("Products are coming soon.", "Les produits arrivent bientôt.")}</strong>${PRODUCTS.length ? `<p>${L("Try another word, raise the price limit or pick another category.", "Essayez un autre mot, augmentez la limite de prix ou choisissez une autre catégorie.")}</p><button class="btn primary" data-clear>${L("Show all products", "Voir tous les produits")}</button>` : ""}</div>`;
    $("#more").innerHTML = all.length > S.shown ? `<p>${Lt("Showing {0} of {1}", "{0} sur {1} affichés", list.length, all.length)}</p><button class="btn ghost" data-more>${L("Load more", "Voir plus")}</button>` : "";
    const sr = $("#showRes"); if (sr) sr.textContent = Lt("Show {0} results", "Voir {0} résultats", all.length);
    $$("[data-fcat]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.fcat === S.cat))); $$("[data-fbadge]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.fbadge === S.badge)));
    reveal();
  }
  function pageShop() {
    $("#filters").setAttribute("aria-label", L("Filters", "Filtres"));
    readUrl(); renderFilters(); renderShop();
    const inp = $("#q"); if (inp && S.q) inp.value = S.q;
    addEventListener("popstate", () => { readUrl(); renderFilters(); renderShop(); });
    let t; $("#filters").addEventListener("input", (e) => {
      if (e.target.id === "fmin" || e.target.id === "fmax") { clearTimeout(t); t = setTimeout(() => { S.min = numOr($("#fmin").value); S.max = numOr($("#fmax").value); S.shown = PAGE_SIZE; writeUrl(false); renderShop(); }, 300); }
      if (e.target.id === "fstock") { S.stock = e.target.checked; S.shown = PAGE_SIZE; writeUrl(true); renderShop(); }
    });
    $("#toolbar").addEventListener("change", (e) => { if (e.target.id === "sort") { S.sort = e.target.value; S.shown = PAGE_SIZE; writeUrl(true); renderShop(); } });
  }

  /* ---------- product page ---------- */
  function pageProduct() {
    const p = prodById[parseInt(params.get("id"), 10)], box = $("#product");
    if (!p) { box.innerHTML = `<div class="empty"><strong>${L("We could not find this product.", "Nous n'avons pas trouvé ce produit.")}</strong><p>${L("It may have been removed.", "Il a peut-être été retiré.")}</p><a class="btn primary" href="/shop.html">${L("Back to the shop", "Retour à la boutique")}</a></div>`; return; }
    remember(p.id);
    const imgs = p.images && p.images.length ? p.images : [], ship = (POLICIES.shipping && POLICIES.shipping[1]) || "", ret = (POLICIES.returns && POLICIES.returns[1]) || "";
    const gal = imgs.length
      ? `<div class="gal"><div class="gal-main" id="galMain" tabindex="0" aria-label="${esc(p.name)}">${imgs.map((u, i) => `<button class="gal-slide ${toneOf(p.niche)}" data-zoom="${i}" aria-label="${L("Zoom image", "Agrandir l'image")} ${i + 1}"><img src="${esc(u)}" alt="${esc(p.name)}${imgs.length > 1 ? " " + (i + 1) : ""}" ${i ? 'loading="lazy"' : 'fetchpriority="high"'} decoding="async"><span class="zoom-ic">${ic("zoom")}</span></button>`).join("")}</div>
        ${imgs.length > 1 ? `<div class="thumbs">${imgs.map((u, i) => `<button class="th" data-th="${i}" aria-label="${L("Show image", "Afficher l'image")} ${i + 1}"><img src="${esc(u)}" alt="" loading="lazy"></button>`).join("")}</div>` : ""}</div>`
      : `<div class="gal"><div class="gal-main one">${media(p, { badge: true })}</div></div>`;
    box.innerHTML = `
      <nav class="crumbs" aria-label="${L("Breadcrumb", "Fil d'Ariane")}"><a href="/index.html">${L("Home", "Accueil")}</a> / <a href="/shop.html">${L("Shop", "Boutique")}</a> / <a href="/shop.html?cat=${esc(p.niche)}">${esc(catLabel(p.niche))}</a></nav>
      <div class="pgrid">${gal}
        <div class="pinfo">
          <span class="cname">${esc(catLabel(p.niche))}</span>
          <div class="ptitle"><h1 class="h">${esc(p.name)}</h1>${heartBtn(p.id)}</div>
          <div class="big">${priceHTML(p)}${p.compareAt ? `<span class="off">-${Math.round((1 - p.price / p.compareAt) * 100)}%</span>` : ""}</div>
          <div class="short">${paras((p.desc || "").split(/\n/)[0])}</div>
          <div class="buy" id="buyRow">${p.soldOut ? `<button class="btn primary" disabled>${L("Sold out", "Épuisé")}</button>` : `
            <div class="qty"><button data-pq="-1" aria-label="${L("Fewer", "Moins")}">${ic("minus")}</button><span id="pq" aria-live="polite">1</span><button data-pq="1" aria-label="${L("More", "Plus")}">${ic("plus")}</button></div>
            <button class="btn primary mag buy-btn" data-add-page="${p.id}">${L("Add to cart", "Ajouter au panier")}</button>`}</div>
          <ul class="perks"><li>${L("Secure checkout powered by Stripe", "Paiement sécurisé propulsé par Stripe")}</li><li>${L("Follow your order on the tracking page, any time", "Suivez votre commande sur la page de suivi, en tout temps")}</li><li>${p.soldOut ? L("Currently sold out, check back soon", "Actuellement épuisé, revenez bientôt") : L("In stock and ready for your cart", "En stock et prêt pour votre panier")}</li></ul>
          <div class="acc">
            <details open><summary>${L("Description", "Description")}</summary><div>${paras(p.desc) || "<p>-</p>"}</div></details>
            <details><summary>${L("Shipping and returns", "Livraison et retours")}</summary><div>${ship ? paras(ship.slice(0, 400)) : ""}${ret ? paras(ret.slice(0, 400)) : ""}<p><a href="/policy.html?p=shipping">${L("Shipping", "Livraison")}</a> · <a href="/policy.html?p=returns">${L("Returns", "Retours")}</a></p></div></details>
            <details><summary>${L("Details", "Détails")}</summary><div><p>${L("Category", "Catégorie")}: <b>${esc(catLabel(p.niche))}</b></p><p>${L("Availability", "Disponibilité")}: <b>${p.soldOut ? L("Sold out", "Épuisé") : L("In stock", "En stock")}</b></p></div></details>
          </div>
        </div></div>
      ${p.soldOut ? "" : `<div class="sticky-buy" id="stickyBuy" aria-hidden="true"><div><b>${esc(p.name)}</b>${priceHTML(p)}</div><button class="btn primary" data-add-page="${p.id}" tabindex="-1">${L("Add to cart", "Ajouter au panier")}</button></div>`}`;
    // gallery behaviour
    const main = $("#galMain");
    if (main) {
      const slides = $$(".gal-slide", main), ths = $$(".th");
      const mark = (i) => ths.forEach((t, k) => t.setAttribute("aria-current", String(k === i)));
      mark(0); main.addEventListener("scroll", () => { const i = Math.round(main.scrollLeft / main.clientWidth * (RTL ? -1 : 1)); mark(Math.max(0, Math.min(slides.length - 1, Math.abs(i)))); }, { passive: true });
      ths.forEach((t, i) => t.addEventListener("click", () => slides[i].scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", inline: "start", block: "nearest" })));
      main.addEventListener("keydown", (e) => { if (e.key === "ArrowRight" || e.key === "ArrowLeft") main.scrollBy({ left: (e.key === "ArrowRight" ? 1 : -1) * main.clientWidth, behavior: "smooth" }); });
    }
    // sticky purchase bar on phones, only while the main button is out of view
    const sb = $("#stickyBuy"), row = $("#buyRow");
    if (sb && row && "IntersectionObserver" in window) new IntersectionObserver(([en]) => { const show = !en.isIntersecting && en.boundingClientRect.top < 0; sb.classList.toggle("on", show); sb.setAttribute("aria-hidden", String(!show)); $$("button", sb).forEach((b) => (b.tabIndex = show ? 0 : -1)); document.body.classList.toggle("has-sticky", show); }).observe(row);
    // related + recently viewed
    const rel = PRODUCTS.filter((x) => x.niche === p.niche && x.id !== p.id).slice(0, 4);
    $("#related").hidden = !rel.length; $("#relatedGrid").innerHTML = rel.map(cardHTML).join("");
    const rv = recent.filter((id) => id !== p.id).map((id) => prodById[id]).filter(Boolean).slice(0, 6);
    const rbox = $("#recent"); if (rbox) { $("#recentH").textContent = L("Recently viewed", "Vus récemment"); rbox.hidden = !rv.length; $("#recentGrid").innerHTML = rv.map(cardHTML).join(""); }
    // title, social tags and structured data (real product information only)
    const d = (p.desc || "").replace(/\s+/g, " ").slice(0, 155);
    document.title = `${p.name} | ${CONFIG.shopName}`; setMeta("description", d);
    setMeta("og:title", p.name, "property"); setMeta("og:description", d, "property"); setMeta("og:type", "product", "property"); if (imgs[0]) setMeta("og:image", location.origin + imgs[0], "property");
    const ld = document.createElement("script"); ld.type = "application/ld+json";
    ld.textContent = JSON.stringify({ "@context": "https://schema.org", "@type": "Product", name: p.name, description: d, image: imgs.map((u) => location.origin + u), category: catLabel(p.niche),
      offers: { "@type": "Offer", price: p.price.toFixed(2), priceCurrency: CONFIG.currency, availability: p.soldOut ? "https://schema.org/OutOfStock" : "https://schema.org/InStock", url: location.origin + "/product.html?id=" + p.id } });
    document.head.appendChild(ld);
  }
  function openLightbox(i) {
    const p = prodById[parseInt(params.get("id"), 10)]; if (!p || !p.images.length) return;
    let cur = i; const dlg = $("#lbDialog");
    const draw = () => { $("#lbBody").innerHTML = `<button class="x" data-close aria-label="${L("Close", "Fermer")}">${ic("close")}</button><img src="${esc(p.images[cur])}" alt="${esc(p.name)}">${p.images.length > 1 ? `<button class="lb-n prev" data-lb="-1" aria-label="${L("Previous", "Précédent")}">${ic("arrow", "arr flip")}</button><button class="lb-n next" data-lb="1" aria-label="${L("Next", "Suivant")}">${ic("arrow", "arr")}</button>` : ""}`; };
    dlg._step = (d) => { cur = (cur + d + p.images.length) % p.images.length; draw(); }; draw(); dlg.showModal();
  }

  /* ---------- quick view ---------- */
  let qvQty = 1;
  function openQuick(id) {
    const p = prodById[id]; if (!p) return; qvQty = 1;
    $("#qvBody").innerHTML = `<button class="x" data-close aria-label="${L("Close", "Fermer")}">${ic("close")}</button>
      <div class="qv-grid">${media(p, { badge: true })}<div class="qv-info"><span class="cname">${esc(catLabel(p.niche))}</span><h2 class="h">${esc(p.name)}</h2><div class="big">${priceHTML(p)}</div>${paras((p.desc || "").slice(0, 320))}
      <div class="buy">${p.soldOut ? `<button class="btn primary" disabled>${L("Sold out", "Épuisé")}</button>` : `<div class="qty"><button data-qq="-1" aria-label="${L("Fewer", "Moins")}">${ic("minus")}</button><span id="qq" aria-live="polite">1</span><button data-qq="1" aria-label="${L("More", "Plus")}">${ic("plus")}</button></div><button class="btn primary" data-add-qv="${p.id}">${L("Add to cart", "Ajouter au panier")}</button>`}${heartBtn(p.id)}</div>
      <a class="link" href="/product.html?id=${p.id}">${L("View full details", "Voir tous les détails")}${ic("arrow", "arr")}</a></div></div>`;
    $("#qvDialog").showModal();
  }

  /* ---------- newsletter (footer, every page) ---------- */
  function initNewsletter() {
    const f = document.createElement("div"); f.className = "news-band";
    f.innerHTML = `<div class="wrap news"><div class="news-t"><b>${L("Stay in the loop", "Restez au courant")}</b><span>${L("New arrivals and offers by email. Unsubscribe any time.", "Nouveautés et offres par courriel. Désabonnement en tout temps.")}</span></div>
      <form id="newsForm" novalidate><div class="news-row"><label class="sr" for="newsEmail">${L("Email address", "Adresse courriel")}</label><input id="newsEmail" name="email" type="email" autocomplete="email" placeholder="${L("Your email address", "Votre adresse courriel")}" required maxlength="150">
      <input class="hp" name="website" type="text" tabindex="-1" autocomplete="off" aria-hidden="true"><button class="btn primary" type="submit">${L("Subscribe", "S'inscrire")}</button></div>
      <label class="chk news-c"><input name="consent" type="checkbox" required> <span>${L("I agree to receive emails about new products and offers. I can unsubscribe at any time.", "J'accepte de recevoir des courriels sur les nouveaux produits et les offres. Je peux me désabonner en tout temps.")}</span></label>
      <div id="newsNote" role="status" hidden></div></form></div>`;
    $("#site-footer").prepend(f);
    $("#newsForm").addEventListener("submit", async (e) => {
      e.preventDefault(); const form = e.target, note = $("#newsNote"), btn = $("button[type=submit]", form); btn.disabled = true; note.hidden = true;
      try {
        const r = await fetch("/api/newsletter", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: form.email.value, consent: form.consent.checked, website: form.website.value, lang: LANG }) });
        const d = await r.json(); if (!r.ok) throw new Error(d.error || L("Could not subscribe.", "Impossible de s'inscrire."));
        form.reset(); note.className = "note ok"; note.textContent = L("Thank you! You are subscribed.", "Merci! Vous êtes inscrit.");
      } catch (err) { note.className = "note bad"; note.textContent = err.message; }
      note.hidden = false; btn.disabled = false;
    });
  }

  /* ---------- policy and contact ---------- */
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


  /* ---------- checkout ---------- */
  async function checkout() {
    const btn = $("#pay"); if (btn) { btn.disabled = true; btn.textContent = L("Redirecting to secure payment...", "Redirection vers le paiement sécurisé..."); }
    progress(true);
    const items = Object.entries(cart).filter(([id]) => prodById[id]).map(([id, q]) => ({ id: +id, qty: q }));
    try {
      const r = await fetch("/api/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items, lang: LANG }) });
      const d = await r.json();
      if (!r.ok || !d.url) throw new Error(d.error || L("Checkout unavailable", "Paiement indisponible"));
      location.href = d.url;
    } catch (e) {
      progress(false); renderCart();
      showMsg(L("Checkout unavailable", "Paiement indisponible"), `<p>${esc(e.message || L("We could not start checkout. Please try again.", "Nous n'avons pas pu démarrer le paiement. Veuillez réessayer."))}</p>`);
    }
  }
  function handleReturn() {
    const o = params.get("order"); if (!o) return;
    const u = new URL(location.href); u.searchParams.delete("order"); u.searchParams.delete("n"); history.replaceState(null, "", u);
    if (o === "success") {
      cart = {}; saveCart(); renderCart();
      const n = parseInt(params.get("n"), 10);
      showMsg(L("Thank you for your order!", "Merci pour votre commande!"), `<p>${L("Your payment was received. A receipt is on its way to your email.", "Votre paiement a été reçu. Un reçu est en route vers votre courriel.")}</p>${n ? `<p>${Lt('Your order number is <b>#{0}</b>. Keep it: you can follow your order any time on the <a href="/track.html?n={0}">tracking page</a>.', 'Votre numéro de commande est le <b>n° {0}</b>. Conservez-le : vous pouvez suivre votre commande en tout temps sur la <a href="/track.html?n={0}">page de suivi</a>.', n)}</p>` : ""}`, true);
    } else if (o === "cancelled") toast(L("Checkout cancelled. Your cart is saved.", "Paiement annulé. Votre panier est conservé."));
  }

  /* ---------- events ---------- */
  let pageQty = 1;
  const closeFilters = () => { const f = $("#filters"); if (f) { f.classList.remove("open"); $("#veil").classList.remove("on"); document.body.classList.remove("noscroll"); } };
  const refresh = (push = true) => { S.shown = PAGE_SIZE; writeUrl(push); renderFilters(); renderShop(); };
  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-add],[data-add-page],[data-add-qv],[data-quick],[data-wish],[data-move],[data-inc],[data-dec],[data-rm],[data-close],[data-close-drawer],[data-pq],[data-qq],[data-rail],[data-zoom],[data-lb],[data-fcat],[data-fbadge],[data-rmf],[data-clear],[data-more],[data-open-filters],[data-close-filters],[data-scroll],[data-lang],[data-tab],#pay,#openCart,#openWish,#menuBtn,#veil,#toTop,#langBtn");
    if (!t) return;
    const d = t.dataset;
    if (d.add) { addToCart(+d.add, 1, t.closest(".card") && t.closest(".card").querySelector(".media")); return morph(t.classList.contains("add-full") || t.classList.contains("add-btn") ? t : null); }
    if (d.addPage) { addToCart(+d.addPage, pageQty, $(".gal-main img, .gal-main .media")); return morph(t.classList.contains("buy-btn") ? t : null); }
    if (d.addQv) { addToCart(+d.addQv, qvQty); return $("#qvDialog").close(); }
    if (d.quick) return openQuick(+d.quick);
    if (d.wish) { toggleWish(d.wish); if (t.getAttribute("aria-pressed") === "true") heartBurst(t); return; }
    if (d.move) { addToCart(+d.move); return toggleWish(d.move); }
    if (d.inc) return setCart(d.inc, (cart[d.inc] || 0) + 1);
    if (d.dec) return setCart(d.dec, (cart[d.dec] || 0) - 1);
    if (d.rm) return setCart(d.rm, 0);
    if (t.hasAttribute("data-close")) return t.closest("dialog").close();
    if (t.hasAttribute("data-close-drawer")) return closeDrawer();
    if (d.pq) { pageQty = Math.max(1, Math.min(20, pageQty + +d.pq)); return ($("#pq").textContent = pageQty); }
    if (d.qq) { qvQty = Math.max(1, Math.min(20, qvQty + +d.qq)); return ($("#qq").textContent = qvQty); }
    if (d.rail) { const r = t.parentElement.querySelector(".rail"); return r.scrollBy({ left: +d.rail * r.clientWidth * 0.9 * (RTL ? -1 : 1), behavior: reduceMotion ? "auto" : "smooth" }); }
    if (d.zoom !== undefined) return openLightbox(+d.zoom);
    if (d.lb) return $("#lbDialog")._step(+d.lb);
    if (d.fcat !== undefined) { S.cat = d.fcat; return refresh(); }
    if (d.fbadge) { S.badge = S.badge === d.fbadge ? "" : d.fbadge; return refresh(); }
    if (d.rmf) { if (d.rmf === "price") { S.min = ""; S.max = ""; } else if (d.rmf === "stock") S.stock = false; else S[d.rmf] = ""; if (d.rmf === "q" && $("#q")) $("#q").value = ""; return refresh(); }
    if (t.hasAttribute("data-clear")) { S = { cat: "", q: "", min: "", max: "", sort: "pop", stock: false, badge: "", shown: PAGE_SIZE }; if ($("#q")) $("#q").value = ""; return refresh(); }
    if (t.hasAttribute("data-more")) { S.shown += PAGE_SIZE; return renderShop(); }
    if (t.hasAttribute("data-open-filters")) { $("#filters").classList.add("open"); $("#veil").classList.add("on"); document.body.classList.add("noscroll"); return; }
    if (t.hasAttribute("data-close-filters")) return closeFilters();
    if (d.scroll) { e.preventDefault(); const el = document.getElementById(d.scroll); if (el) el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" }); return; }
    if (d.lang) { try { localStorage.setItem("nk_lang", d.lang); } catch (err) {} const u = new URL(location.href); u.searchParams.delete("lang"); return (location.href = u.toString()); }
    if (d.tab) { if (d.tab === "cats") return openDrawer($("#mnav")); if (d.tab === "wish") { renderWish(); return openDrawer($("#wdrawer")); } if (d.tab === "cart") return openDrawer($("#drawer")); if (d.tab === "search") { scrollTo({ top: 0 }); return setTimeout(() => $("#q").focus(), 120); } }
    if (t.id === "pay") return checkout();
    if (t.id === "openCart") return openDrawer($("#drawer"));
    if (t.id === "openWish") { renderWish(); return openDrawer($("#wdrawer")); }
    if (t.id === "menuBtn") return openDrawer($("#mnav"));
    if (t.id === "veil") { closeDrawer(); return closeFilters(); }
    if (t.id === "toTop") return scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
    if (t.id === "langBtn") { const m = $("#langMenu"); m.hidden = !m.hidden; return t.setAttribute("aria-expanded", String(!m.hidden)); }
  });
  document.addEventListener("click", (e) => { const m = $("#langMenu"); if (m && !m.hidden && !e.target.closest(".lang")) m.hidden = true; });
  document.addEventListener("error", (e) => {
    const im = e.target; if (!(im && im.tagName === "IMG") || im.dataset.failed) return; im.dataset.failed = "1";
    const s = document.createElement("span"); s.className = "emoji"; s.setAttribute("aria-hidden", "true"); s.textContent = im.dataset.fb || "🛍️"; im.replaceWith(s);
  }, true);

  /* ---------- start ---------- */
  (async function init() {
    await loadPack();
    buildLayout();
    if (LANG !== "en" && PACK.pages && PACK.pages[PAGE] && PAGE !== "home") $("#main").innerHTML = PACK.pages[PAGE];
    const g = $("#grid"); if (g) g.innerHTML = skeletonCards(8);
    if (PAGE === "home") $("#main").innerHTML = `<section class="sec"><div class="wrap"><div class="grid">${skeletonCards(4)}</div></div></section>`;
    let data;
    try { const r = await fetch("/api/store?lang=" + LANG); if (!r.ok) throw new Error("store"); data = await r.json(); }
    catch (e) { $("#main").innerHTML = `<div class="wrap sec"><div class="empty"><strong>${L("The store is temporarily unavailable.", "La boutique est temporairement indisponible.")}</strong><p>${L("Please refresh the page in a moment.", "Veuillez actualiser la page dans un instant.")}</p></div></div>`; return; }
    applyData(data); applyShell(); renderCart(); renderWish(); initMega(); initSearch(); initMotion(); initNewsletter();
    if (PAGE === "home") pageHome();
    if (PAGE === "shop") pageShop();
    if (PAGE === "product") pageProduct();
    if (PAGE === "policy") pagePolicy();
    if (PAGE === "contact") pageContact();
    if (PAGE === "track") pageTrack();
    reveal(); initChat(CHAT_ON); handleReturn();
    document.documentElement.classList.add("ready");
  })();
})();
