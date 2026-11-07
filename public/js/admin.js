// ============ ADMINISTRATIVE SIDE ============
import { api, session, logout } from './api.js';
import { $, money, toCents, fmtDate, dayRange, greeting, methodIcon, methodLabel, receiptView, printReceipt } from './util.js';
import { esc, icon, avatar, toast, dialog, closeDialogs, confirmDialog, setBusy } from './ui.js';
import { mountLogin } from './auth-ui.js';

/* ---------- State ---------- */
const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: 'layout' }, { id: 'products', label: 'Products', icon: 'package' },
  { id: 'sales', label: 'Sales', icon: 'receipt' }, { id: 'users', label: 'Users', icon: 'users' }, { id: 'settings', label: 'Settings', icon: 'sliders' }
];
const S = { user: null, tab: 'dashboard', settings: { currency: '$', business_name: 'POS', tax_rate: '0' }, days: 1, salesDays: 1, products: [], pq: '', editId: null, viewSale: null };
const fmt = c => money(c, S.settings.currency);
const view = html => { $('#view').innerHTML = html; };
const head = (title, sub, actions = '') => `<div class="page-head"><div><h1 class="page-title">${esc(title)}</h1><p class="page-sub">${esc(sub)}</p></div><div>${actions}</div></div>`;
const skeleton = () => view(`<div class="skel" style="width:40%;height:28px"></div><div class="skel" style="height:90px"></div><div class="skel" style="height:220px"></div>`);
const empty = (ic, title, text, cta = '') => `<div class="empty">${icon(ic)}<b>${esc(title)}</b>${esc(text)}${cta ? `<p style="margin-top:12px">${cta}</p>` : ''}</div>`;
const periodSeg = (cur, act) => `<div class="seg" role="group" aria-label="Period">${[[1, 'Today'], [7, '7 days'], [30, '30 days']].map(([d, l]) => `<button data-act="${act}" data-id="${d}" aria-pressed="${cur === d}">${l}</button>`).join('')}</div>`;
const stockBadge = p => p.stock <= 0 ? '<span class="badge bad">Out of stock</span>' : p.stock <= p.low_stock_threshold ? `<span class="badge warn">Low · ${p.stock}</span>` : `<span class="badge ok">${p.stock} in stock</span>`;

/* ---------- Views: dashboard ---------- */
async function dashboard() {
  const r = await api('/reports/summary?' + new URLSearchParams(dayRange(S.days)));
  const avg = r.orders ? Math.round(r.revenue_cents / r.orders) : 0;
  const maxQty = Math.max(1, ...r.top_products.map(p => p.qty)), totalM = r.by_method.reduce((a, m) => a + m.total_cents, 0) || 1;
  view(`${head(`${greeting()}, ${S.user.username}`, new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }), periodSeg(S.days, 'period'))}
  <div class="kpis">
    <div class="card kpi"><div class="ico">${icon('trend')}</div><div><b>${fmt(r.revenue_cents)}</b><span>Revenue</span></div></div>
    <div class="card kpi"><div class="ico">${icon('receipt')}</div><div><b>${r.orders}</b><span>Orders</span></div></div>
    <div class="card kpi"><div class="ico ok">${icon('chart')}</div><div><b>${fmt(r.profit_cents)}</b><span>Gross profit</span></div></div>
    <div class="card kpi"><div class="ico warn">${icon('cart')}</div><div><b>${fmt(avg)}</b><span>Average order</span></div></div>
  </div>
  <div class="cards">
    <div class="card"><div class="card-title">Top products</div>${r.top_products.map(p => `<div style="margin-bottom:12px"><div class="item" style="padding:0;border:0"><span class="grow t">${esc(p.name)}</span><span class="muted">${p.qty} sold · ${fmt(p.revenue_cents)}</span></div><div class="bar"><span style="width:${Math.round(p.qty / maxQty * 100)}%"></span></div></div>`).join('') || empty('chart', 'No sales yet', 'Sales in this period will appear here.')}</div>
    <div class="card"><div class="card-title">Payment methods</div>${r.by_method.map(m => `<div style="margin-bottom:12px"><div class="item" style="padding:0;border:0">${icon(methodIcon(m.payment_method))}<span class="grow t">${methodLabel(m.payment_method)} <span class="muted">(${m.orders})</span></span><b>${fmt(m.total_cents)}</b></div><div class="bar"><span style="width:${Math.round(m.total_cents / totalM * 100)}%"></span></div></div>`).join('') || empty('card', 'No payments yet', 'Payment breakdown shows up after your first sale.')}</div>
    <div class="card"><div class="card-title">Low stock ${r.low_stock.length ? `<span class="badge warn">${r.low_stock.length}</span>` : ''}</div><div class="list">${r.low_stock.map(p => `<div class="item">${avatar(p.name)}<div class="grow"><div class="t">${esc(p.name)}</div><div class="s">${esc(p.sku)}</div></div><span class="badge ${p.stock <= 0 ? 'bad' : 'warn'}">${p.stock} left</span></div>`).join('') || empty('checkc', 'All stocked up', 'No products are running low.')}</div></div>
  </div>`);
}

/* ---------- Views: products ---------- */
async function products() {
  S.products = await api('/products?all=1');
  view(`${head('Products', `${S.products.filter(p => p.active).length} active items in your catalogue`, `<button class="btn primary" data-act="newProduct">${icon('plus')} Add product</button>`)}
  <div class="toolbar"><div class="input-wrap">${icon('search')}<input class="input" id="pq" placeholder="Search by name or SKU" value="${esc(S.pq)}" aria-label="Search products"></div></div>
  <div class="card"><div class="list" id="plist"></div></div>`);
  drawProducts();
}
function drawProducts() {
  const q = S.pq.trim().toLowerCase();
  const rows = S.products.filter(p => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q));
  $('#plist').innerHTML = rows.map(p => `<div class="item" ${p.active ? '' : 'style="opacity:.6"'}>${avatar(p.name)}
    <div class="grow"><div class="t">${esc(p.name)} ${p.active ? '' : '<span class="badge bad">Removed</span>'}</div><div class="s">${esc(p.sku)} · cost ${fmt(p.cost_cents)}</div></div>
    <div class="end"><b>${fmt(p.price_cents)}</b>${stockBadge(p)}
      <button class="icon-btn" data-act="editProduct" data-id="${p.id}" aria-label="Edit ${esc(p.name)}">${icon('edit')}</button>
      ${p.active ? `<button class="icon-btn danger" data-act="removeProduct" data-id="${p.id}" aria-label="Remove ${esc(p.name)}">${icon('trash')}</button>` : `<button class="btn sm" data-act="restoreProduct" data-id="${p.id}">Restore</button>`}</div></div>`).join('')
    || empty('package', S.products.length ? 'No matching products' : 'Your catalogue is empty', S.products.length ? 'Try another search.' : 'Add your first product to start selling.', S.products.length ? '' : `<button class="btn primary" data-act="newProduct">${icon('plus')} Add product</button>`);
}
function productDialog(p = {}) {
  const c = v => (v === undefined ? '' : (v / 100).toFixed(2)), cur = esc(S.settings.currency);
  dialog(`<div class="dlg-box"><h2>${p.id ? 'Edit product' : 'Add product'}</h2><p class="sub">${p.id ? 'Update the details below.' : 'Fill in the details to add it to your catalogue.'}</p>
  <form data-form="product" novalidate>
    <div class="field"><label for="f-name">Product name</label><input class="input" id="f-name" name="name" value="${esc(p.name)}" required placeholder="e.g. Framed print 8×10" autofocus></div>
    <div class="field"><label for="f-sku">SKU / code</label><input class="input" id="f-sku" name="sku" value="${esc(p.sku)}" required placeholder="Unique code"></div>
    <div class="grid2">
      <div class="field"><label for="f-price">Selling price</label><div class="input-wrap has-pre"><span class="pre">${cur}</span><input class="input" id="f-price" name="price" type="number" step="0.01" min="0" inputmode="decimal" value="${c(p.price_cents)}" required></div></div>
      <div class="field"><label for="f-cost">Your cost</label><div class="input-wrap has-pre"><span class="pre">${cur}</span><input class="input" id="f-cost" name="cost" type="number" step="0.01" min="0" inputmode="decimal" value="${c(p.cost_cents)}"></div></div>
      <div class="field"><label for="f-stock">Stock quantity</label><input class="input" id="f-stock" name="stock" type="number" min="0" inputmode="numeric" value="${p.stock ?? ''}" required></div>
      <div class="field"><label for="f-th">Low-stock alert at</label><input class="input" id="f-th" name="threshold" type="number" min="0" inputmode="numeric" value="${p.low_stock_threshold ?? 5}"></div>
    </div>
    <div class="hint" id="margin"></div>
    <div class="dlg-actions"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary" type="submit">${p.id ? 'Save changes' : 'Add product'}</button></div>
  </form></div>`);
}
const productBody = f => ({ name: f.name.value, sku: f.sku.value, price_cents: toCents(f.price.value), cost_cents: toCents(f.cost.value || 0), stock: parseInt(f.stock.value, 10), low_stock_threshold: parseInt(f.threshold.value || 5, 10) });

/* ---------- Views: sales ---------- */
async function sales() {
  const rows = await api('/sales?' + new URLSearchParams({ ...dayRange(S.salesDays), limit: 200 }));
  const done = rows.filter(r => r.status === 'completed');
  view(`${head('Sales history', `${done.length} completed · ${fmt(done.reduce((a, r) => a + r.total_cents, 0))}`, periodSeg(S.salesDays, 'salesPeriod'))}
  <div class="card"><div class="list">${rows.map(s => `<div class="item click" data-act="viewSale" data-id="${s.id}" tabindex="0" role="button" aria-label="View receipt ${esc(s.receipt_no)}">
    <div class="avatar" style="background:var(--accent-soft);color:var(--accent)">${icon(methodIcon(s.payment_method))}</div>
    <div class="grow"><div class="t">${esc(s.receipt_no)} ${s.status === 'voided' ? '<span class="badge bad">Voided</span>' : ''}</div><div class="s">${fmtDate(s.created_at)} · ${s.item_count} item${s.item_count === 1 ? '' : 's'} · ${esc(s.cashier)}</div></div>
    <b ${s.status === 'voided' ? 'style="text-decoration:line-through;opacity:.6"' : ''}>${fmt(s.total_cents)}</b></div>`).join('') || empty('receipt', 'No sales in this period', 'Completed sales will show up here.')}</div></div>`);
}

/* ---------- Views: users ---------- */
async function users() {
  const rows = await api('/users');
  view(`${head('Team', 'Control who can use the system', `<button class="btn primary" data-act="newUser">${icon('plus')} Add user</button>`)}
  <div class="card"><div class="list">${rows.map(u => `<div class="item" ${u.active ? '' : 'style="opacity:.6"'}>${avatar(u.username)}
    <div class="grow"><div class="t">${esc(u.username)} ${u.id === S.user.id ? '<span class="badge">You</span>' : ''}</div><div class="s">Added ${fmtDate(u.created_at)}</div></div>
    <div class="end"><span class="badge ${u.role === 'admin' ? 'accent' : ''}">${u.role === 'admin' ? 'Administrator' : 'Sales'}</span>${u.active ? '' : '<span class="badge bad">Inactive</span>'}
      <button class="btn sm" data-act="resetPassword" data-id="${u.id}" data-name="${esc(u.username)}">Reset password</button>
      ${u.id === S.user.id ? '' : `<button class="btn sm ${u.active ? 'danger' : ''}" data-act="toggleUser" data-id="${u.id}" data-active="${u.active}" data-role="${u.role}" data-name="${esc(u.username)}">${u.active ? 'Deactivate' : 'Activate'}</button>`}</div></div>`).join('')}</div></div>`);
}

/* ---------- Views: settings ---------- */
async function settings() {
  S.settings = await api('/settings'); const s = S.settings;
  view(`${head('Settings', 'Business details, receipts and security')}
  <div class="cards">
  <form class="card" data-form="settings"><div class="card-title">Business</div>
    <div class="field"><label for="s-name">Business name</label><input class="input" id="s-name" name="business_name" value="${esc(s.business_name)}" required></div>
    <div class="grid2"><div class="field"><label for="s-cur">Currency symbol</label><input class="input" id="s-cur" name="currency" value="${esc(s.currency)}" maxlength="5" required></div>
    <div class="field"><label for="s-tax">Tax rate (%)</label><input class="input" id="s-tax" name="tax_rate" type="number" step="0.01" min="0" max="100" value="${esc(s.tax_rate)}" required></div></div>
    <div class="card-title" style="margin-top:8px">Receipt printing</div>
    <div class="field"><label for="s-w">Thermal paper width</label><select class="select" id="s-w" name="receipt_width"><option value="80" ${s.receipt_width === '80' ? 'selected' : ''}>80 mm</option><option value="58" ${s.receipt_width === '58' ? 'selected' : ''}>58 mm</option></select></div>
    <label class="switch-row"><span>Print automatically after each sale<small>Sends the receipt to your printer right after payment.</small></span><input class="switch" type="checkbox" name="auto_print" ${s.auto_print === '1' ? 'checked' : ''}></label>
    <div class="field"><label for="s-f">Receipt footer message</label><input class="input" id="s-f" name="receipt_footer" maxlength="120" value="${esc(s.receipt_footer)}"></div>
    <button class="btn primary" type="submit">Save settings</button></form>
  <form class="card" data-form="password"><div class="card-title">Change my password</div>
    <div class="field"><label for="pw1">Current password</label><input class="input" id="pw1" name="current" type="password" autocomplete="current-password" required></div>
    <div class="field"><label for="pw2">New password</label><input class="input" id="pw2" name="next" type="password" minlength="8" autocomplete="new-password" required><div class="hint">At least 8 characters.</div></div>
    <button class="btn primary" type="submit">Update password</button></form></div>`);
}

/* ---------- Actions ---------- */
const VIEWS = { dashboard, products, sales, users, settings };
async function show(tab) {
  S.tab = tab;
  document.querySelectorAll('[data-nav]').forEach(b => b.dataset.nav === tab ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current'));
  skeleton();
  try { await VIEWS[tab](); window.scrollTo(0, 0); } catch (err) { view(empty('alert', 'Could not load this page', err.message)); }
}
const run = async (fn, ok) => { try { await fn(); if (ok) toast(ok); } catch (err) { toast(err.message, 'err'); } };

const A = {
  tab: id => show(id), logout,
  print: () => S.viewSale && printReceipt(S.viewSale, S.settings),
  period: id => { S.days = +id; show('dashboard'); },
  salesPeriod: id => { S.salesDays = +id; show('sales'); },
  newProduct: () => { S.editId = null; productDialog(); },
  editProduct: id => { S.editId = +id; productDialog(S.products.find(p => p.id === +id)); },
  removeProduct: async id => { const p = S.products.find(x => x.id === +id);
    if (await confirmDialog({ title: 'Remove product?', message: `"${p.name}" will no longer be sold. Past sales keep their history.`, confirm: 'Remove', danger: true }))
      run(async () => { await api(`/products/${id}`, { method: 'DELETE' }); await products(); }, 'Product removed'); },
  restoreProduct: id => run(async () => { const p = S.products.find(x => x.id === +id); await api(`/products/${id}`, { method: 'PUT', body: { ...p, active: 1 } }); await products(); }, 'Product restored'),
  viewSale: id => run(async () => {
    const sale = S.viewSale = await api(`/sales/${id}`);
    dialog(receiptView(sale, S.settings, sale.status === 'completed' ? `<button class="btn danger" data-act="voidSale" data-id="${sale.id}">Void sale</button>` : ''));
  }),
  voidSale: async id => {
    if (await confirmDialog({ title: 'Void this sale?', message: 'The items will be returned to stock and the sale marked as voided.', confirm: 'Void sale', danger: true }))
      run(async () => { await api(`/sales/${id}/void`, { method: 'POST' }); closeDialogs(); await sales(); }, 'Sale voided'); },
  newUser: () => dialog(`<div class="dlg-box"><h2>Add user</h2><p class="sub">Create a sign-in for a team member.</p>
    <form data-form="user" novalidate>
      <div class="field"><label for="u-n">Username</label><input class="input" id="u-n" name="username" minlength="3" required autocomplete="off" autocapitalize="none"></div>
      <div class="field"><label for="u-p">Password</label><input class="input" id="u-p" name="password" type="password" minlength="8" required autocomplete="new-password"><div class="hint">At least 8 characters.</div></div>
      <div class="field"><label for="u-r">Role</label><select class="select" id="u-r" name="role"><option value="cashier">Sales (uses the Sales Terminal)</option><option value="admin">Administrator (full access)</option></select></div>
      <div class="dlg-actions"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary" type="submit">Create user</button></div></form></div>`),
  resetPassword: (id, el) => dialog(`<div class="dlg-box"><h2>Reset password</h2><p class="sub">Choose a new password for ${esc(el.dataset.name)}.</p>
    <form data-form="reset" data-id="${id}" novalidate><div class="field"><label for="r-p">New password</label><input class="input" id="r-p" name="password" type="password" minlength="8" required autocomplete="new-password"><div class="hint">At least 8 characters.</div></div>
    <div class="dlg-actions"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary" type="submit">Update password</button></div></form></div>`, 'narrow'),
  toggleUser: async (id, el) => {
    const deactivating = el.dataset.active === '1';
    if (deactivating && !(await confirmDialog({ title: 'Deactivate user?', message: `${el.dataset.name} will no longer be able to sign in.`, confirm: 'Deactivate', danger: true }))) return;
    run(async () => { await api(`/users/${id}`, { method: 'PUT', body: { active: deactivating ? 0 : 1, role: el.dataset.role } }); await users(); }, deactivating ? 'User deactivated' : 'User activated');
  }
};

const FORMS = {
  product: async f => {
    const body = productBody(f), btn = f.querySelector('[type=submit]');
    if (!body.name.trim() || !body.sku.trim() || !Number.isFinite(body.price_cents) || !Number.isFinite(body.stock)) return toast('Please fill in the name, SKU, price and stock.', 'err');
    setBusy(btn, true, 'Saving…');
    try {
      if (S.editId) await api(`/products/${S.editId}`, { method: 'PUT', body }); else await api('/products', { method: 'POST', body });
      closeDialogs(); toast('Product saved'); await products();
    } catch (err) { setBusy(btn, false); toast(err.message, 'err'); }
  },
  user: f => run(async () => { await api('/users', { method: 'POST', body: { username: f.username.value, password: f.password.value, role: f.role.value } }); closeDialogs(); await users(); }, 'User created'),
  reset: f => run(async () => { await api(`/users/${f.dataset.id}`, { method: 'PUT', body: { password: f.password.value } }); closeDialogs(); }, 'Password updated'),
  settings: f => run(async () => {
    S.settings = await api('/settings', { method: 'PUT', body: { business_name: f.business_name.value, currency: f.currency.value, tax_rate: f.tax_rate.value,
      receipt_width: f.receipt_width.value, auto_print: f.auto_print.checked ? '1' : '0', receipt_footer: f.receipt_footer.value } });
    shell(); await show('settings');
  }, 'Settings saved'),
  password: f => run(async () => { await api('/auth/change-password', { method: 'POST', body: { current_password: f.current.value, new_password: f.next.value } }); f.reset(); }, 'Password updated')
};

/* ---------- Shell & boot ---------- */
function shell() {
  const nav = (cls) => TABS.map(t => `<button data-act="tab" data-id="${t.id}" data-nav="${t.id}" ${S.tab === t.id ? 'aria-current="page"' : ''}>${icon(t.icon)}<span>${t.label}</span></button>`).join('');
  $('#app').innerHTML = `
  <div class="shell">
    <aside class="side"><div class="brand"><span class="mark" style="color:#fff">${icon('shield')}</span><span>${esc(S.settings.business_name)}</span></div>
      <nav class="nav" aria-label="Main">${nav()}</nav>
      <div class="me">${avatar(S.user.username)}<div class="grow"><div class="t" style="font-weight:700">${esc(S.user.username)}</div><div class="s muted" style="font-size:12px">Administrator</div></div>
        <button class="icon-btn" data-act="logout" aria-label="Sign out" title="Sign out">${icon('logout')}</button></div></aside>
    <div><header class="mobile-top"><div class="brand"><span class="mark" style="color:#fff">${icon('shield')}</span><span>${esc(S.settings.business_name)}</span></div>
      <button class="icon-btn" data-act="logout" aria-label="Sign out">${icon('logout')}</button></header>
      <main class="content" id="view"></main></div>
  </div>
  <nav class="bottom-nav" aria-label="Main">${nav()}</nav>`;
}

async function start(user) {
  S.user = user;
  try { S.settings = await api('/settings'); } catch (err) { toast(err.message, 'err'); return; }
  document.title = `${S.settings.business_name} · Administrator`;
  shell(); await show('dashboard');
  document.addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (b && A[b.dataset.act]) A[b.dataset.act](b.dataset.id, b); });
  document.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.item.click')) { e.preventDefault(); e.target.click(); } });
  document.addEventListener('submit', e => { const f = e.target; if (f.dataset.form && FORMS[f.dataset.form]) { e.preventDefault(); FORMS[f.dataset.form](f); } });
  document.addEventListener('input', e => {
    if (e.target.id === 'pq') { S.pq = e.target.value; drawProducts(); }
    if (['f-price', 'f-cost'].includes(e.target.id)) {
      const p = parseFloat($('#f-price').value), c = parseFloat($('#f-cost').value || 0);
      $('#margin').textContent = p > 0 && c >= 0 ? `Profit per item: ${fmt(Math.round((p - c) * 100))} (${Math.round((p - c) / p * 100)}% margin)` : '';
    }
  });
}

const existing = session.get();
if (existing && existing.user.role === 'admin') start(existing.user);
else { session.clear(); mountLogin('admin', start); }
