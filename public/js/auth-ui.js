// Professional split-screen login used by both portals
import { api, session } from './api.js';
import { $ } from './util.js';
import { esc, icon, setBusy } from './ui.js';

const PORTALS = {
  admin: {
    name: 'Administrator Portal', mark: 'shield', title: 'Run your business with confidence.',
    lead: 'Manage inventory, follow your sales and control who has access, all in one secure place.',
    feats: [['package', 'Inventory & stock control', 'Add products and get low-stock alerts.'],
            ['chart', 'Sales insights', 'Revenue, profit and best sellers at a glance.'],
            ['users', 'Team access', 'Create cashier accounts in seconds.']],
    note: 'Authorised administrators only'
  },
  sales: {
    name: 'Sales Terminal', mark: 'store', title: 'Fast, friendly checkout.',
    lead: 'Ring up sales, take payments and print receipts in a few taps.',
    feats: [['search', 'Find products instantly', 'Search by name or SKU as you type.'],
            ['card', 'Cash, card or transfer', 'Change is calculated for you.'],
            ['printer', 'Instant receipts', 'Print to your thermal printer after every sale.']],
    note: 'Sign in with the account your manager created for you'
  }
};

export function mountLogin(portal, onSuccess) {
  const c = PORTALS[portal];
  const lastKey = `pos_last_user_${portal}`;
  let last = ''; try { last = localStorage.getItem(lastKey) || ''; } catch {}

  $('#app').innerHTML = `
  <div class="auth">
    <aside class="auth-hero">
      <div class="brand"><span class="mark">${icon('store')}</span> POS</div>
      <div>
        <h1>${esc(c.title)}</h1><p class="lead">${esc(c.lead)}</p>
        <div class="feats">${c.feats.map(([i, t, s]) => `<div class="feat"><span class="ico">${icon(i)}</span><div><b>${esc(t)}</b><span>${esc(s)}</span></div></div>`).join('')}</div>
      </div>
      <div class="auth-note">${icon('lock')} ${esc(c.note)}</div>
    </aside>
    <section class="auth-pane"><div class="auth-card">
      <span class="portal-chip">${icon(c.mark)} ${esc(c.name)}</span>
      <h2>Welcome back</h2><p class="muted">Sign in to continue.</p>
      <p></p>
      <div id="authErr" class="alert" role="alert" hidden></div>
      <form id="loginForm" novalidate>
        <div class="field"><label for="u">Username</label>
          <div class="input-wrap">${icon('user')}<input class="input" id="u" autocomplete="username" autocapitalize="none" spellcheck="false" value="${esc(last)}" placeholder="Enter your username"></div></div>
        <div class="field"><label for="p">Password</label>
          <div class="input-wrap">${icon('lock')}<input class="input" id="p" type="password" autocomplete="current-password" placeholder="Enter your password">
            <button type="button" class="icon-btn" id="pw" aria-label="Show password" aria-pressed="false">${icon('eye')}</button></div>
          <div class="hint warn" id="caps" hidden>${icon('alert')} Caps Lock is on</div></div>
        <button class="btn primary lg block" id="go" type="submit">Sign in</button>
      </form>
      <p class="auth-foot"><a href="/">← Back to portal selection</a></p>
    </div></section>
  </div>`;

  const u = $('#u'), p = $('#p'), err = $('#authErr');
  (last ? p : u).focus();

  const showErr = msg => {
    err.innerHTML = `${icon('alert')}<span>${esc(msg)}</span>`;
    err.hidden = false; err.classList.remove('shake'); void err.offsetWidth; err.classList.add('shake');
  };
  $('#pw').addEventListener('click', e => {
    const show = p.type === 'password'; p.type = show ? 'text' : 'password';
    e.currentTarget.innerHTML = icon(show ? 'eyeoff' : 'eye');
    e.currentTarget.setAttribute('aria-pressed', show); e.currentTarget.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  });
  p.addEventListener('keyup', e => { $('#caps').hidden = !(e.getModifierState && e.getModifierState('CapsLock')); });
  [u, p].forEach(el => el.addEventListener('input', () => { err.hidden = true; }));

  $('#loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    if (!u.value.trim()) { showErr('Please enter your username.'); u.focus(); return; }
    if (!p.value) { showErr('Please enter your password.'); p.focus(); return; }
    const btn = $('#go'); setBusy(btn, true, 'Signing in…'); err.hidden = true;
    try {
      const data = await api('/auth/login', { method: 'POST', body: { username: u.value.trim(), password: p.value, portal } });
      try { localStorage.setItem(lastKey, u.value.trim()); } catch {}
      session.set(data); onSuccess(data.user);
    } catch (ex) { setBusy(btn, false); showErr(ex.message); p.value = ''; p.focus(); }
  });
}
