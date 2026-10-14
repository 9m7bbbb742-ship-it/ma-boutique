(() => {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const app = $("#app");
  let currency = "CAD";
  let tab = "orders";
  let cats = [];
  let ORDERS = [];
  let returnAddr = "";

  const money = (c) => new Intl.NumberFormat("en-CA", { style: "currency", currency }).format((c || 0) / 100);
  const when = (iso) => (iso ? new Date(iso).toLocaleString() : "");

  async function api(path, method = "GET", body) {
    const r = await fetch("/api/admin/" + path, {
      method, credentials: "same-origin",
      headers: { "Content-Type": "application/json", "X-Requested-With": "nookly-admin" },
      body: body ? JSON.stringify(body) : undefined,
    });
    let d = {};
    try { d = await r.json(); } catch (e) {}
    if (r.status === 401 && path !== "login") { showLogin(); throw new Error("Please sign in."); }
    if (!r.ok) throw new Error(d.error || "Something went wrong.");
    return d;
  }
  function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("on"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("on"), 2200); }

  /* ---------- login ---------- */
  function showLogin(msg) {
    app.innerHTML = `<div class="login"><h1>Store admin</h1><p>Sign in to manage your store.</p>
      ${msg ? `<div class="err">${esc(msg)}</div>` : ""}
      <form class="f" id="loginForm"><label>Password<input type="password" name="password" autocomplete="current-password" required autofocus></label>
      <button class="btn" type="submit">Sign in</button></form></div>`;
    $("#loginForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector("button"); btn.disabled = true;
      try { await api("login", "POST", { password: e.target.password.value }); boot(); }
      catch (err) { showLogin(err.message); }
    });
  }

  /* ---------- shell ---------- */
  function shell() {
    const tabs = [["orders", "Orders"], ["products", "Products"], ["categories", "Categories"], ["messages", "Messages"], ["settings", "Settings"]];
    app.innerHTML = `<div class="top"><div class="in"><b>Store admin</b><a href="/" target="_blank" rel="noopener">View store</a><button id="logout">Sign out</button></div></div>
      <div class="tabs" role="tablist">${tabs.map(([k, l]) => `<button class="tab" role="tab" data-tab="${k}" aria-selected="${k === tab}">${l}</button>`).join("")}</div>
      <main><div class="panel" id="view"></div></main>`;
  }
  async function show(t) {
    tab = t;
    document.querySelectorAll(".tab").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === t)));
    $("#view").innerHTML = `<div class="empty">Loading...</div>`;
    try { await ({ orders: viewOrders, products: viewProducts, categories: viewCategories, messages: viewMessages, settings: viewSettings })[t](); }
    catch (e) { if (e.message !== "Please sign in.") $("#view").innerHTML = `<div class="err">${esc(e.message)}</div>`; }
  }
  async function boot() {
    try {
      await api("me");
      const s = (await api("settings")).settings; currency = (s.currency || "cad").toUpperCase(); returnAddr = s.return_address || "";
      shell(); show(tab);
    } catch (e) { showLogin(); }
  }

  /* ---------- orders ---------- */
  const LABEL = { paid: "Paid, to ship", shipped: "Shipped", delivered: "Delivered", cancelled: "Cancelled" };
  async function viewOrders() {
    const { orders } = await api("orders");
    ORDERS = orders;
    $("#view").innerHTML = `<div class="head"><h2>Orders</h2>${orders.length ? '<button class="btn sec sm" data-csv>Export CSV</button>' : ""}</div>
      <div class="hint">Customer payments, refunds and receipts are also in your Stripe dashboard. Refund an order there, then set it to Cancelled here.</div>
      ${orders.length ? orders.map(orderCard).join("") : `<div class="empty">No orders yet. Paid orders appear here automatically.</div>`}`;
  }
  function orderCard(o) {
    const items = JSON.parse(o.items || "[]");
    const a = o.shipping_address ? JSON.parse(o.shipping_address) : null;
    const addr = a ? [a.name, a.line1, a.line2, [a.city, a.state, a.postal_code].filter(Boolean).join(" "), a.country].filter(Boolean).map(esc).join("<br>") : "No address";
    return `<details class="ord"><summary><b>#${o.id}</b><span>${esc(o.name || o.email || "Customer")}<br><small>${when(o.paid_at || o.created_at)}</small></span><b>${money(o.total_cents)}</b><span class="chip ${esc(o.status)}">${esc(LABEL[o.status] || o.status)}</span></summary>
      <div class="body">
        <table class="items">${items.map((i) => `<tr><td>${i.qty} x ${esc(i.name)}</td><td>${money(i.price_cents * i.qty)}</td></tr>`).join("")}
          <tr><td>Shipping</td><td>${money(o.shipping_cents)}</td></tr>
          ${o.tax_cents ? `<tr><td>Tax</td><td>${money(o.tax_cents)}</td></tr>` : ""}
          <tr><td><b>Total paid</b></td><td><b>${money(o.total_cents)}</b></td></tr></table>
        <dl class="kv"><dt>Email</dt><dd>${o.email ? `<a href="mailto:${esc(o.email)}">${esc(o.email)}</a>` : "-"}</dd>
          <dt>Phone</dt><dd>${esc(o.phone || "-")}</dd><dt>Ship to</dt><dd>${addr}</dd></dl>
        <div class="g2"><form class="f" data-order="${o.id}">
          <label>Status<select name="status">${Object.entries(LABEL).map(([k, v]) => `<option value="${k}"${k === o.status ? " selected" : ""}>${v}</option>`).join("")}</select></label>
          <label>Tracking number<input name="tracking" value="${esc(o.tracking)}" maxlength="200"></label>
          <button class="btn sm" type="submit">Save order</button></form></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn sec sm" data-print="${o.id}" data-mode="label">Print shipping label</button>
          <button class="btn sec sm" data-print="${o.id}" data-mode="slip">Print packing slip</button>
          ${o.email ? `<a class="btn sec sm" href="${esc(mailto(o))}">Email customer</a>` : ""}
        </div>
      </div></details>`;
  }


  /* ---------- printing, CSV and customer email ---------- */
  const addrOf = (o) => (o.shipping_address ? JSON.parse(o.shipping_address) : {});
  function mailto(o) {
    const tr = o.tracking ? `Your tracking number is ${o.tracking}.\n\n` : "";
    const body = `Hello ${o.name || ""},\n\nThank you for your order #${o.id}. ${o.status === "shipped" ? "It has shipped. " : ""}${tr}You can follow your order here: ${location.origin}/track.html?n=${o.id}\n\nBest regards`;
    return `mailto:${o.email}?subject=${encodeURIComponent("Your order #" + o.id)}&body=${encodeURIComponent(body)}`;
  }
  function exportCsv() {
    const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const head = ["Order", "Date", "Status", "Name", "Email", "Phone", "Address 1", "Address 2", "City", "Province/State", "Postal code", "Country", "Items", "Total", "Tracking"];
    const rows = ORDERS.map((o) => {
      const a = addrOf(o), items = JSON.parse(o.items || "[]").map((i) => `${i.qty} x ${i.name}`).join("; ");
      return [o.id, o.paid_at || o.created_at, o.status, a.name || o.name, o.email, o.phone, a.line1, a.line2, a.city, a.state, a.postal_code, a.country, items, (o.total_cents / 100).toFixed(2), o.tracking].map(q).join(",");
    });
    const blob = new Blob(["\ufeff" + [head.map(q).join(","), ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "orders.csv"; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  function printOrder(o, mode) {
    const a = addrOf(o), items = JSON.parse(o.items || "[]"), label = mode === "label";
    const shipTo = [a.name || o.name, a.line1, a.line2, [a.city, a.state, a.postal_code].filter(Boolean).join(" "), a.country].filter(Boolean).map(esc).join("<br>");
    const from = esc(returnAddr || "").replace(/\n/g, "<br>");
    const rows = items.map((i) => `<tr><td>${esc(i.qty)}</td><td>${esc(i.name)}</td></tr>`).join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Order #${o.id}</title><style>
      @page{size:${label ? "4in 6in" : "letter"};margin:${label ? "0.2in" : "0.5in"}}
      *{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#000;margin:0;font-size:${label ? "12px" : "14px"}}
      .from{font-size:${label ? "11px" : "13px"};margin-bottom:${label ? "14px" : "24px"}}.from b{display:block;font-size:${label ? "10px" : "12px"};text-transform:none}
      .to{border:3px solid #000;padding:${label ? "14px" : "20px"};font-size:${label ? "20px" : "24px"};line-height:1.35;font-weight:700;margin-bottom:14px}
      .meta{display:flex;justify-content:space-between;font-weight:700;margin-bottom:10px}
      table{width:100%;border-collapse:collapse}td,th{border-bottom:1px solid #999;padding:6px 4px;text-align:left}td:first-child,th:first-child{width:50px}
      h1{font-size:${label ? "16px" : "26px"};margin:0 0 6px}.note{margin-top:16px;color:#333}
    </style></head><body>
      ${label ? "" : `<h1>Packing slip</h1>`}
      <div class="meta"><span>Order #${o.id}</span><span>${esc(new Date(o.paid_at || o.created_at).toLocaleDateString("en-CA"))}</span></div>
      <div class="from"><b>FROM</b>${from || "(add your return address in Settings)"}</div>
      <div class="to">${shipTo || "No address"}</div>
      ${o.phone ? `<div>Phone: ${esc(o.phone)}</div>` : ""}
      ${label ? `<div style="margin-top:10px">${items.reduce((n, i) => n + i.qty, 0)} item(s)</div>` : `<table><tr><th>Qty</th><th>Item</th></tr>${rows}</table><p class="note">Thank you for your order!</p>`}
    </body></html>`;
    const w = window.open("", "_blank");
    if (!w) return toast("Allow pop-ups to print");
    w.document.write(html); w.document.close(); w.focus();
    setTimeout(() => w.print(), 350);
  }

  /* ---------- products ---------- */
  async function viewProducts() {
    const [p, c] = await Promise.all([api("products"), api("categories")]);
    cats = c.categories;
    const label = Object.fromEntries(cats.map((x) => [x.id, x.label]));
    $("#view").innerHTML = `<div class="head"><h2>Products</h2><button class="btn" data-new>Add product</button></div>
      ${p.products.length ? p.products.map((x) => `<div class="row">
        <div class="thumb">${x.image_id ? `<img src="/api/img/${x.image_id}" alt="">` : esc(x.emoji || "🛍️")}</div>
        <div><b>${esc(x.name)}</b> ${x.active ? "" : '<span class="chip hidden">Hidden</span>'}<small>${esc(label[x.category_id] || "No category")} | ${money(x.price_cents)} | ${x.stock === null ? "Unlimited stock" : x.stock + " in stock"}</small></div>
        <button class="btn sec sm" data-edit='${esc(JSON.stringify(x))}'>Edit</button></div>`).join("") : `<div class="empty">No products yet. Add your first product.</div>`}`;
  }
  function productForm(x = {}) {
    const isNew = !x.id;
    $("#view").innerHTML = `<div class="head"><h2>${isNew ? "Add product" : "Edit product"}</h2><button class="btn sec sm" data-back>Back</button></div>
      <form class="f" id="pform" data-id="${x.id || ""}">
        <label>Name<input name="name" value="${esc(x.name)}" maxlength="120" required></label>
        <div class="g2">
          <label>Category<select name="category">${cats.map((c) => `<option value="${esc(c.id)}"${c.id === x.category_id ? " selected" : ""}>${esc(c.label)}</option>`).join("")}</select></label>
          <label>Label<select name="badge">${["", "New", "Popular", "Sale"].map((b) => `<option value="${b}"${b === (x.badge || "") ? " selected" : ""}>${b || "None"}</option>`).join("")}</select></label>
        </div>
        <div class="g3">
          <label>Price<input name="price" type="number" step="0.01" min="0.01" value="${x.price_cents ? (x.price_cents / 100).toFixed(2) : ""}" required></label>
          <label>Before price <small>(optional, shown crossed out)</small><input name="compareAt" type="number" step="0.01" min="0" value="${x.compare_at_cents ? (x.compare_at_cents / 100).toFixed(2) : ""}"></label>
          <label>Stock <small>(empty = unlimited)</small><input name="stock" type="number" step="1" min="0" value="${x.stock ?? ""}"></label>
        </div>
        <label>Description<textarea name="description" maxlength="2000">${esc(x.description)}</textarea></label>
        <div class="imgbox"><div class="thumb" id="imgPreview">${x.image_id ? `<img src="/api/img/${x.image_id}" alt="">` : esc(x.emoji || "🛍️")}</div>
          <div><label>Photo<input type="file" id="file" accept="image/*"></label><small id="imgNote">Photos are resized automatically.</small>
          <div><button type="button" class="btn sec sm" id="rmImg"${x.image_id ? "" : " hidden"}>Remove photo</button></div></div>
          <input type="hidden" name="imageId" value="${x.image_id || ""}"></div>
        <label>Icon <small>(shown when there is no photo)</small><input name="emoji" value="${esc(x.emoji)}" maxlength="8" style="width:120px"></label>
        <label class="chk"><input type="checkbox" name="active"${x.active === 0 ? "" : " checked"}> Visible in the store</label>
        <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn" type="submit">Save product</button>
          ${isNew ? "" : `<button class="btn bad" type="button" data-del="${x.id}">Delete</button>`}</div>
      </form>`;
  }
  function fileToJpeg(file, max = 900) {
    return new Promise((res, rej) => {
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => {
        const s = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas"); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url); res(c.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = () => rej(new Error("Could not read this image."));
      img.src = url;
    });
  }

  /* ---------- categories ---------- */
  async function viewCategories() {
    cats = (await api("categories")).categories;
    $("#view").innerHTML = `<div class="head"><h2>Categories</h2></div>
      <div class="hint">The first categories appear biggest on the home page. Use the order number to rearrange them (0 is first).</div>
      ${cats.map((c) => catForm(c)).join("")}
      <h2 style="margin:26px 0 12px">Add a category</h2>${catForm({ id: "", label: "", emoji: "", bg: "#4D8BFF", sort: cats.length }, true)}`;
  }
  function catForm(c, isNew) {
    return `<form class="f" data-cat="${esc(c.id)}" style="border:1px solid var(--line);border-radius:16px;padding:16px;margin-bottom:12px">
      <div class="g3"><label>Name<input name="label" value="${esc(c.label)}" maxlength="60" required></label>
      <label>Id <small>(letters, numbers, dashes)</small><input name="id" value="${esc(c.id)}" ${isNew ? "" : "readonly"} pattern="[a-z0-9-]{2,30}" required></label>
      <label>Icon<input name="emoji" value="${esc(c.emoji)}" maxlength="8"></label></div>
      <div class="g3"><label>Accent color<input type="color" name="bg" value="${esc(c.bg)}"></label>
      <label>Order<input name="sort" type="number" step="1" value="${c.sort ?? 0}"></label><div></div></div>
      <div style="display:flex;gap:10px"><button class="btn sm" type="submit">${isNew ? "Add category" : "Save"}</button>
      ${isNew ? "" : `<button class="btn bad sm" type="button" data-delcat="${esc(c.id)}">Delete</button>`}</div></form>`;
  }

  /* ---------- messages ---------- */
  async function viewMessages() {
    const { messages } = await api("messages");
    $("#view").innerHTML = `<div class="head"><h2>Messages</h2></div>
      ${messages.length ? messages.map((m) => `<div class="msg"><b>${esc(m.name)}</b> <a href="mailto:${esc(m.email)}">${esc(m.email)}</a> <small>${when(m.created_at)}</small>
        <p>${esc(m.message)}</p><button class="btn bad sm" data-delmsg="${m.id}">Delete</button></div>`).join("") : `<div class="empty">No messages yet. Contact form messages appear here.</div>`}`;
  }

  /* ---------- settings ---------- */
  async function viewSettings() {
    const res = await api("settings"), s = res.settings;
    const t = (k, l, rows) => `<label>${l}<textarea name="${k}" rows="${rows}">${esc(s[k])}</textarea></label>`;
    $("#view").innerHTML = `<div class="head"><h2>Settings</h2></div>
      <form class="f" id="sform">
        <div class="g2"><label>Store name<input name="store_name" value="${esc(s.store_name)}" maxlength="80"></label>
          <label>Contact email<input name="contact_email" type="email" value="${esc(s.contact_email)}"></label></div>
        <label>Top banner text <small>(leave empty to show the free-shipping message automatically)</small><input name="promo" value="${esc(s.promo)}" maxlength="160"></label>
        <div class="g2"><label>Shipping fee<input name="shipping_flat" type="number" step="0.01" min="0" value="${esc(s.shipping_flat)}"></label>
          <label>Free shipping from <small>(0 = never free)</small><input name="free_shipping_from" type="number" step="0.01" min="0" value="${esc(s.free_shipping_from)}"></label></div>
        <label>Return address <small>(printed on shipping labels and packing slips)</small><textarea name="return_address" rows="3" maxlength="300">${esc(s.return_address)}</textarea></label>
        <div class="hint">${res.ai ? "AI support chat is connected. Visitors can use it on your store." : "AI support chat is not connected yet. It appears on your store after you add the ANTHROPIC_API_KEY secret in Cloudflare."}</div>
        <label class="chk"><input type="checkbox" name="chat_enabled"${s.chat_enabled === "0" ? "" : " checked"}> Show the AI support chat on my store</label>
        <label>Notes for the AI assistant <small>(delivery times, opening hours, anything customers often ask)</small><textarea name="chat_notes" rows="4" maxlength="1500">${esc(s.chat_notes)}</textarea></label>
        ${t("policy_shipping", "Shipping page", 5)}${t("policy_returns", "Returns page", 5)}${t("policy_privacy", "Privacy policy page", 6)}${t("policy_terms", "Terms of sale page", 6)}
        <div><button class="btn" type="submit">Save settings</button></div></form>`;
  }

  /* ---------- events ---------- */
  document.addEventListener("click", async (e) => {
    const t = e.target.closest("[data-tab],[data-new],[data-edit],[data-back],[data-del],[data-delcat],[data-delmsg],[data-print],[data-csv],#logout,#rmImg");
    if (!t) return;
    try {
      if (t.dataset.tab) return show(t.dataset.tab);
      if (t.dataset.print) return printOrder(ORDERS.find((x) => String(x.id) === t.dataset.print), t.dataset.mode);
      if (t.hasAttribute("data-csv")) return exportCsv();
      if (t.id === "logout") { await api("logout", "POST"); return showLogin(); }
      if (t.hasAttribute("data-new")) { if (!cats.length) cats = (await api("categories")).categories; return productForm({ category_id: cats[0]?.id }); }
      if (t.dataset.edit) { if (!cats.length) cats = (await api("categories")).categories; return productForm(JSON.parse(t.dataset.edit)); }
      if (t.hasAttribute("data-back")) return show("products");
      if (t.id === "rmImg") { document.querySelector("[name=imageId]").value = ""; $("#imgPreview").innerHTML = "🛍️"; t.hidden = true; return; }
      if (t.dataset.del) { if (!confirm("Delete this product for good?")) return; await api("products/" + t.dataset.del, "DELETE"); toast("Product deleted"); return show("products"); }
      if (t.dataset.delcat) { if (!confirm("Delete this category?")) return; await api("categories/" + t.dataset.delcat, "DELETE"); toast("Category deleted"); return show("categories"); }
      if (t.dataset.delmsg) { await api("messages/" + t.dataset.delmsg, "DELETE"); return show("messages"); }
    } catch (err) { if (err.message !== "Please sign in.") toast(err.message); }
  });

  document.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      if (f.id === "pform") {
        const d = Object.fromEntries(new FormData(f));
        d.active = f.active.checked;
        const id = f.dataset.id;
        await api(id ? "products/" + id : "products", id ? "PUT" : "POST", d);
        toast("Product saved"); return show("products");
      }
      if (f.dataset.order) { const d = Object.fromEntries(new FormData(f)); await api("orders/" + f.dataset.order, "PUT", d); toast("Order updated"); return show("orders"); }
      if (f.dataset.cat !== undefined) {
        const d = Object.fromEntries(new FormData(f)); d.fg = d.bg;
        await api("categories", "POST", d); toast("Category saved"); return show("categories");
      }
      if (f.id === "sform") { const d = Object.fromEntries(new FormData(f)); d.chat_enabled = f.chat_enabled.checked ? "1" : "0"; await api("settings", "PUT", d); returnAddr = d.return_address || ""; toast("Settings saved"); }
    } catch (err) { if (err.message !== "Please sign in.") toast(err.message); }
  });

  document.addEventListener("change", async (e) => {
    if (e.target.id !== "file" || !e.target.files[0]) return;
    const note = $("#imgNote");
    try {
      note.textContent = "Uploading...";
      const dataUrl = await fileToJpeg(e.target.files[0]);
      const { id } = await api("image", "POST", { dataUrl });
      document.querySelector("[name=imageId]").value = id;
      $("#imgPreview").innerHTML = `<img src="${dataUrl}" alt="">`;
      $("#rmImg").hidden = false;
      note.textContent = "Photo ready. Click Save product.";
    } catch (err) { note.textContent = err.message; }
  });

  boot();
})();
