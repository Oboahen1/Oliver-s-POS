// ============ SALES SIDE: point-of-sale terminal (no admin features here) ============
import { api, session, logout } from './api.js';
import { $, money, toCents, dayRange, methodIcon, methodLabel, receiptView, printReceipt } from './util.js';
import { esc, icon, avatar, toast, dialog, closeDialogs, setBusy } from './ui.js';
import { mountLogin } from './auth-ui.js';

/* ---------- State ---------- */
const S = { user: null, settings: { currency: '$', business_name: 'POS', tax_rate: '0', auto_print: '1' },
  products: [], cart: [], q: '', method: 'cash', tendered: '', busy: false, lastSale: null };
const fmt = c => money(c, S.settings.currency);

/* ---------- Business logic ---------- */
function totals() {
  const subtotal = S.cart.reduce((a, i) => a + i.price_cents * i.qty, 0);
  const tax = Math.round((subtotal * (parseFloat(S.settings.tax_rate) || 0)) / 100);
  return { subtotal, tax, total: subtotal + tax, count: S.cart.reduce((a, i) => a + i.qty, 0) };
}
const tenderedCents = () => (S.tendered === '' ? null : toCents(S.tendered));
const canCharge = () => {
  const t = totals(); if (!t.count || S.busy) return false;
  if (S.method !== 'cash') return true;
  const tc = tenderedCents(); return tc === null || (Number.isFinite(tc) && tc >= t.total);
};

async function checkout() {
  if (!canCharge()) return;
  const btn = $('#charge'); S.busy = true; setBusy(btn, true, 'Processing…');
  try {
    const sale = await api('/sales', { method: 'POST', body: {
      items: S.cart.map(i => ({ product_id: i.id, qty: i.qty })), payment_method: S.method,
      tendered_cents: S.method === 'cash' && tenderedCents() !== null ? tenderedCents() : undefined } });
    S.cart = []; S.tendered = ''; S.lastSale = sale; S.busy = false;
    document.body.classList.remove('cart-open');
    await loadProducts(); drawAll(); refreshStats(); successDialog(sale);
  } catch (err) { S.busy = false; setBusy(btn, false); toast(err.message, 'err'); await loadProducts().catch(() => {}); drawAll(); }
}

function successDialog(sale) {
  const d = dialog(`<div class="dlg-box center">
    <div class="success-ring">${icon('check')}</div><h2>Sale complete</h2>
    <p class="muted">Receipt ${esc(sale.receipt_no)} · ${esc(methodLabel(sale.payment_method))}</p>
    <div class="big-total">${fmt(sale.total_cents)}</div>
    ${sale.payment_method === 'cash' ? `<div class="change-due"><span>Change due</span><span>${fmt(sale.change_cents)}</span></div>` : ''}
    <div class="dlg-actions" style="justify-content:center">
      <button class="btn" data-act="print">${icon('printer')} Print receipt</button>
      <button class="btn primary" data-close id="newSale">New sale</button></div></div>`, 'narrow');
  d.querySelector('#newSale').focus();
  d.addEventListener('close', () => $('#q')?.focus());
  if (S.settings.auto_print === '1') { setTimeout(() => printReceipt(sale, S.settings), 250); }
}

/* ---------- Data ---------- */
const loadProducts = async () => { S.products = await api('/products'); };
async function refreshStats() {
  try {
    const rows = await api('/sales?' + new URLSearchParams({ ...dayRange(1), limit: 500 }));
    const done = rows.filter(r => r.status === 'completed');
    $('#stats').innerHTML = `${icon('trend')}<span>Today <b>${done.length}</b> sales · <b>${fmt(done.reduce((a, r) => a + r.total_cents, 0))}</b></span>`;
  } catch { /* non-critical */ }
}

/* ---------- Views ---------- */
function shell() {
  $('#app').innerHTML = `
  <header class="topbar">
    <div class="brand"><span class="mark">${icon('store')}</span><span>${esc(S.settings.business_name)}</span></div>
    <div class="right">
      <div class="stat-chip" id="stats"></div>
      <div class="stat-chip">${icon('user')}<span>${esc(S.user.username)}</span></div>
      <button class="btn sm" data-act="logout">${icon('logout')}<span>Sign out</span></button>
    </div>
  </header>
  <div class="pos-body">
    <section class="catalog">
      <div class="searchbar"><div class="input-wrap">${icon('search')}
        <input class="input" id="q" placeholder="Search products by name or SKU" autocomplete="off" aria-label="Search products"><kbd class="only-desktop">/</kbd></div></div>
      <div class="tiles" id="tiles" role="list"></div>
    </section>
    <aside class="cart-panel" aria-label="Current sale" id="cartPanel"></aside>
  </div>
  <button class="cartbar only-mobile" data-act="openCart" id="cartbar"></button>`;
}

function drawTiles() {
  const q = S.q.trim().toLowerCase();
  const list = S.products.filter(p => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q));
  $('#tiles').innerHTML = list.map(p => {
    const inCart = S.cart.find(i => i.id === p.id)?.qty || 0, out = p.stock <= 0, low = !out && p.stock <= p.low_stock_threshold;
    return `<button class="tile" role="listitem" data-act="add" data-id="${p.id}" ${out ? 'disabled' : ''} aria-label="${esc(p.name)}, ${fmt(p.price_cents)}">
      ${inCart ? `<span class="inc">×${inCart}</span>` : ''}${avatar(p.name)}
      <div class="nm">${esc(p.name)}</div>
      <div>${out ? '<span class="badge bad">Out of stock</span>' : low ? `<span class="badge warn">Only ${p.stock} left</span>` : `<span class="muted" style="font-size:12px">${p.stock} in stock</span>`}</div>
      <div class="pr">${fmt(p.price_cents)}</div></button>`;
  }).join('') || `<div class="empty" style="grid-column:1/-1">${icon('search')}<b>${S.products.length ? 'No matching products' : 'No products yet'}</b>${S.products.length ? 'Try a different name or SKU.' : 'Ask your administrator to add products.'}</div>`;
}

function drawCart() {
  const t = totals();
  const lines = S.cart.map(i => {
    const p = S.products.find(x => x.id === i.id);
    return `<div class="line"><div><div class="nm">${esc(i.name)}</div><div class="muted" style="font-size:13px">${fmt(i.price_cents)} each</div>
      <div class="stepper"><button data-act="dec" data-id="${i.id}" aria-label="Decrease quantity">${icon('minus')}</button><span>${i.qty}</span>
        <button data-act="inc" data-id="${i.id}" aria-label="Increase quantity" ${p && i.qty >= p.stock ? 'disabled' : ''}>${icon('plus')}</button></div></div>
      <div style="text-align:right"><div class="tot">${fmt(i.price_cents * i.qty)}</div>
        <button class="icon-btn danger" data-act="rm" data-id="${i.id}" aria-label="Remove ${esc(i.name)}">${icon('trash')}</button></div></div>`;
  }).join('') || `<div class="empty">${icon('cart')}<b>Cart is empty</b>Tap a product to add it.</div>`;
  const quick = [500, 1000, 2000, 5000, 10000, 20000].filter(a => a >= t.total).slice(0, 3);
  $('#cartPanel').innerHTML = `
    <div class="cart-head"><h2>Current sale ${t.count ? `<span class="badge accent">${t.count} item${t.count > 1 ? 's' : ''}</span>` : ''}</h2>
      <div style="display:flex;gap:4px;align-items:center"><button class="btn ghost sm only-mobile" data-act="closeCart">${icon('arrowleft')} Products</button>
      <button class="btn ghost sm danger" data-act="clear" ${t.count ? '' : 'disabled'}>Clear</button></div></div>
    <div class="cart-lines">${lines}</div>
    <div class="cart-foot">
      <div class="totals"><div class="r"><span>Subtotal</span><span>${fmt(t.subtotal)}</span></div>
        <div class="r"><span>Tax (${esc(S.settings.tax_rate)}%)</span><span>${fmt(t.tax)}</span></div>
        <div class="r grand"><span>Total</span><span>${fmt(t.total)}</span></div></div>
      <div class="paymethods" role="group" aria-label="Payment method">${['cash', 'card', 'transfer'].map(m =>
        `<button class="pm" data-act="method" data-id="${m}" aria-pressed="${S.method === m}">${icon(methodIcon(m))}${methodLabel(m)}</button>`).join('')}</div>
      <div ${S.method === 'cash' ? '' : 'hidden'}>
        <div class="input-wrap has-pre"><span class="pre">${esc(S.settings.currency)}</span>
          <input class="input" id="tendered" type="number" step="0.01" min="0" inputmode="decimal" placeholder="Cash received (blank = exact)" value="${esc(S.tendered)}" aria-label="Cash received"></div>
        <div class="chips"><button class="chip" data-act="quick" data-id="${t.total}" ${t.count ? '' : 'disabled'}>Exact</button>
          ${quick.map(a => `<button class="chip" data-act="quick" data-id="${a}">${fmt(a)}</button>`).join('')}</div>
        <div id="changeBox"></div></div>
      <button class="btn primary lg block" id="charge" data-act="checkout"></button>
    </div>`;
  updatePay();
  const bar = $('#cartbar');
  bar.innerHTML = `<span>${icon('cart')} ${t.count ? `View cart · ${t.count} item${t.count > 1 ? 's' : ''}` : 'Cart is empty'}</span><b>${fmt(t.total)}</b>`;
}

// Updates change/charge button without re-rendering (keeps keyboard focus in the cash field)
function updatePay() {
  const t = totals(), tc = tenderedCents(), box = $('#changeBox');
  if (box) {
    box.innerHTML = S.method !== 'cash' || tc === null || !t.count ? '' :
      tc >= t.total ? `<div class="change-due"><span>Change due</span><span>${fmt(tc - t.total)}</span></div>`
                    : `<div class="change-due short"><span>Still needed</span><span>${fmt(t.total - tc)}</span></div>`;
  }
  const btn = $('#charge');
  if (btn && !S.busy) { btn.disabled = !canCharge(); btn.innerHTML = `${icon('check')} Charge ${fmt(t.total)}`; }
}
const drawAll = () => { drawTiles(); drawCart(); };

/* ---------- Actions ---------- */
const A = {
  add(id) {
    const p = S.products.find(x => x.id === +id), l = S.cart.find(x => x.id === +id);
    if (!p || (l ? l.qty : 0) >= p.stock) return toast('No more stock available for this item.', 'err');
    l ? l.qty++ : S.cart.push({ id: p.id, name: p.name, price_cents: p.price_cents, qty: 1 }); drawAll();
  },
  inc(id) { A.add(id); },
  dec(id) { const l = S.cart.find(x => x.id === +id); if (l && --l.qty <= 0) S.cart = S.cart.filter(x => x !== l); drawAll(); },
  rm(id) { S.cart = S.cart.filter(x => x.id !== +id); drawAll(); },
  clear() { S.cart = []; S.tendered = ''; drawAll(); },
  method(m) { S.method = m; drawCart(); },
  quick(cents) { S.tendered = (cents / 100).toFixed(2); $('#tendered').value = S.tendered; updatePay(); },
  checkout,
  openCart() { document.body.classList.add('cart-open'); },
  closeCart() { document.body.classList.remove('cart-open'); },
  print() { if (S.lastSale) printReceipt(S.lastSale, S.settings); },
  logout
};

/* ---------- Boot ---------- */
async function start(user) {
  S.user = user;
  try { [S.settings] = await Promise.all([api('/settings'), loadProducts()]); } catch (err) { toast(err.message, 'err'); return; }
  document.title = `${S.settings.business_name} · Sales Terminal`;
  shell(); drawAll(); refreshStats(); $('#q').focus();

  document.addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (b && !b.disabled && A[b.dataset.act]) A[b.dataset.act](b.dataset.id); });
  document.addEventListener('input', e => {
    if (e.target.id === 'q') { S.q = e.target.value; drawTiles(); }
    if (e.target.id === 'tendered') { S.tendered = e.target.value; updatePay(); }
  });
  document.addEventListener('keydown', e => {
    const typing = /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName);
    if (e.key === '/' && !typing) { e.preventDefault(); $('#q').focus(); }
    if (e.target.id === 'q') {
      if (e.key === 'Escape') { S.q = ''; e.target.value = ''; drawTiles(); }
      if (e.key === 'Enter') { const m = S.products.filter(p => p.stock > 0 && (p.name.toLowerCase().includes(S.q.trim().toLowerCase()) || p.sku.toLowerCase().includes(S.q.trim().toLowerCase()))); if (m.length === 1) { A.add(m[0].id); S.q = ''; e.target.value = ''; drawTiles(); } }
    }
    if (e.target.id === 'tendered' && e.key === 'Enter') checkout();
  });
}

const existing = session.get();
if (existing && existing.user.role === 'cashier') start(existing.user);
else { session.clear(); mountLogin('sales', start); }
