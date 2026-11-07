// Formatting, date ranges, receipts and printing
import { esc, icon } from './ui.js';

export const $ = s => document.querySelector(s);
export const money = (cents, cur = '$') => cur + (Number(cents || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const toCents = v => Math.round(parseFloat(v) * 100);
export const fmtDate = iso => new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
export const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };

// Local-day range as ISO strings (end exclusive): 1 = today, 7 = last 7 days, ...
export function dayRange(days = 1) {
  const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - (days - 1));
  const end = new Date(); end.setHours(0, 0, 0, 0); end.setDate(end.getDate() + 1);
  return { from: start.toISOString(), to: end.toISOString() };
}

export const methodIcon = m => ({ cash: 'cash', card: 'card', transfer: 'bank' }[m] || 'cash');
export const methodLabel = m => m[0].toUpperCase() + m.slice(1);

// On-screen receipt (inside a dialog). `extra` = additional action buttons.
export function receiptView(sale, settings, extra = '') {
  const f = c => money(c, settings.currency);
  return `<div class="dlg-box">
    <div class="paper">
      <div class="c big">${esc(settings.business_name)}</div>
      <div class="c">Receipt ${esc(sale.receipt_no)}<br>${fmtDate(sale.created_at)}<br>Cashier: ${esc(sale.cashier)}</div>
      ${sale.status === 'voided' ? '<div class="c big" style="color:#b91c1c">*** VOIDED ***</div>' : ''}
      <hr>
      ${sale.items.map(i => `<div>${esc(i.name)}</div><div class="r"><span>${i.qty} x ${f(i.unit_price_cents)}</span><span>${f(i.qty * i.unit_price_cents)}</span></div>`).join('')}
      <hr>
      <div class="r"><span>Subtotal</span><span>${f(sale.subtotal_cents)}</span></div>
      <div class="r"><span>Tax</span><span>${f(sale.tax_cents)}</span></div>
      <div class="r big"><span>TOTAL</span><span>${f(sale.total_cents)}</span></div>
      <div class="r"><span>Paid by</span><span>${esc(sale.payment_method)}</span></div>
      ${sale.payment_method === 'cash' ? `<div class="r"><span>Tendered</span><span>${f(sale.tendered_cents)}</span></div><div class="r"><span>Change</span><span>${f(sale.change_cents)}</span></div>` : ''}
      <hr><div class="c">${esc(settings.receipt_footer || 'Thank you!')}</div>
    </div>
    <div class="dlg-actions"><button class="btn" data-close>Close</button>${extra}
      <button class="btn primary" data-act="print">${icon('printer')} Print</button></div></div>`;
}

// Compact monospace receipt for 58mm / 80mm thermal printers
export function thermalHtml(sale, settings) {
  const f = c => money(c, settings.currency);
  const items = sale.items.map(i => `<div>${esc(i.name)}</div>
    <div class="r"><span>${i.qty} x ${f(i.unit_price_cents)}</span><span>${f(i.qty * i.unit_price_cents)}</span></div>`).join('');
  return `<div class="th ${settings.receipt_width === '58' ? 'w58' : ''}">
    <div class="c b big">${esc(settings.business_name)}</div>
    <div class="c">Receipt ${esc(sale.receipt_no)}<br>${fmtDate(sale.created_at)}<br>Cashier: ${esc(sale.cashier)}</div>
    ${sale.status === 'voided' ? '<div class="c b">*** VOIDED ***</div>' : ''}
    <hr>${items}<hr>
    <div class="r"><span>Subtotal</span><span>${f(sale.subtotal_cents)}</span></div>
    <div class="r"><span>Tax</span><span>${f(sale.tax_cents)}</span></div>
    <div class="r b big"><span>TOTAL</span><span>${f(sale.total_cents)}</span></div>
    <div class="r"><span>Paid by</span><span>${esc(sale.payment_method)}</span></div>
    ${sale.payment_method === 'cash' ? `<div class="r"><span>Tendered</span><span>${f(sale.tendered_cents)}</span></div>
    <div class="r"><span>Change</span><span>${f(sale.change_cents)}</span></div>` : ''}
    <hr><div class="c">${esc(settings.receipt_footer || 'Thank you!')}</div></div>`;
}

// Renders the thermal receipt into a hidden print area, then opens the print dialog.
export function printReceipt(sale, settings) {
  let el = document.getElementById('print-area');
  if (!el) { el = document.createElement('div'); el.id = 'print-area'; document.body.appendChild(el); }
  el.innerHTML = thermalHtml(sale, settings);
  const clear = () => { el.innerHTML = ''; window.removeEventListener('afterprint', clear); };
  window.addEventListener('afterprint', clear);
  window.print();
}
