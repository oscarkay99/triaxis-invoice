import { supabase } from './supabase.js';
import { requireAuth, renderUser, logout } from './guard.js';
import { downloadPDF, previewPDF, getPDFBase64 } from './pdf.js';

const session = await requireAuth();
if (!session) throw new Error('Not authenticated');
renderUser(session);
document.getElementById('logoutBtn').addEventListener('click', logout);

const APPS_SCRIPT_URL = import.meta.env.VITE_APPS_SCRIPT_URL;
const WEBHOOK_TOKEN = import.meta.env.VITE_WEBHOOK_TOKEN;

const id = new URLSearchParams(location.search).get('id');
if (!id) { window.location.href = '/dashboard.html'; }

let invoice = null;

function showToast(title, message, type = 'success') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const icons = {
    success: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
    error:   '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    info:    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
  };
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.innerHTML = `
    <div class="toast-icon">${icons[type]}</div>
    <div class="toast-body">
      <div class="toast-title">${title}</div>
      ${message ? `<div class="toast-msg">${message}</div>` : ''}
    </div>
    <button class="toast-close" aria-label="Dismiss">×</button>
  `;
  toast.querySelector('.toast-close').addEventListener('click', () => toast.remove());
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 5000);
}

function fmt(amount, currency) {
  const sym = currency === 'GHS' ? '₵' : '$';
  return `${sym}${Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
}

function statusBadge(status) {
  const labels = { paid: 'Paid', unpaid: 'Unpaid', overdue: 'Overdue', draft: 'Draft' };
  return `<span class="badge badge-${status}" style="font-size:0.95rem;padding:6px 16px;">${labels[status] || status}</span>`;
}

function renderPreview(inv) {
  const items = inv.items || [];
  const isPaid = inv.status === 'paid';
  const amountPaid = Number(inv.amount_paid) || 0;
  const balanceDue = Math.max(0, Number(inv.total) - amountPaid);
  const title = isPaid ? 'RECEIPT' : 'INVOICE';

  document.getElementById('invoicePreview').innerHTML = `
    <div class="rcp-wrap">

      <!-- TOP: logo + title -->
      <div class="rcp-top">
        <div class="rcp-logo-block">
          <img src="/assets/logo.png" alt="TriAxis IT Solutions" class="rcp-logo" onerror="this.style.display='none';this.nextElementSibling.style.display='block'" />
          <div class="rcp-logo-fallback" style="display:none">TRIAXIS IT SOLUTIONS</div>
          <div class="rcp-company-name">TriAxis IT Solutions</div>
          <div class="rcp-company-address">14 Independence Avenue, Accra, Ghana</div>
          <div class="rcp-company-address">info@triaxistechnologies.com · triaxistechnologies.com</div>
        </div>
        <div class="rcp-title-block">
          ${isPaid ? '<div class="rcp-paid-stamp">PAID</div>' : ''}
          <div class="rcp-title">${title}</div>
          <div class="rcp-number"># ${inv.invoice_number}</div>
        </div>
      </div>

      <hr class="rcp-divider" />

      <!-- MIDDLE: bill to / ship to + metadata table -->
      <div class="rcp-middle">
        <div class="rcp-billing">
          <div class="rcp-billing-cols">
            <div>
              <div class="rcp-field-label">Bill To</div>
              <div class="rcp-client-name">${inv.client_name || '—'}</div>
              ${inv.client_company ? `<div class="rcp-client-detail">${inv.client_company}</div>` : ''}
              ${inv.client_email ? `<div class="rcp-client-detail">${inv.client_email}</div>` : ''}
              ${inv.client_phone ? `<div class="rcp-client-detail">${inv.client_phone}</div>` : ''}
              ${inv.client_address ? `<div class="rcp-client-detail">${inv.client_address}</div>` : ''}
            </div>
            <div>
              <div class="rcp-field-label">Ship To</div>
              <div class="rcp-client-name">${inv.ship_to || inv.client_name || '—'}</div>
            </div>
          </div>
        </div>
        <div class="rcp-meta-table">
          <div class="rcp-meta-row">
            <span class="rcp-meta-label">Date</span>
            <span class="rcp-meta-value">${inv.issue_date || '—'}</span>
          </div>
          <div class="rcp-meta-row">
            <span class="rcp-meta-label">Payment Terms</span>
            <span class="rcp-meta-value">${inv.payment_terms || '—'}</span>
          </div>
          <div class="rcp-meta-row">
            <span class="rcp-meta-label">Due Date</span>
            <span class="rcp-meta-value">${inv.due_date || '—'}</span>
          </div>
          <div class="rcp-meta-row">
            <span class="rcp-meta-label">PO Number</span>
            <span class="rcp-meta-value">${inv.po_number || '—'}</span>
          </div>
          <div class="rcp-meta-row rcp-balance-row">
            <span class="rcp-balance-label">Balance Due</span>
            <span class="rcp-balance-value">${fmt(balanceDue, inv.currency)}</span>
          </div>
        </div>
      </div>

      <!-- ITEMS TABLE -->
      <div class="rcp-items">
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th style="width:80px;text-align:center">Quantity</th>
              <th style="width:120px;text-align:right">Rate</th>
              <th style="width:120px;text-align:right">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${items.map(item => `
              <tr>
                <td>${item.description || '—'}</td>
                <td style="text-align:center">${item.qty}</td>
                <td style="text-align:right">${fmt(item.unit_price, inv.currency)}</td>
                <td style="text-align:right;font-weight:600">${fmt(item.qty * item.unit_price, inv.currency)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <!-- TOTALS -->
      <div class="rcp-totals">
        <table>
          <tr><td class="rcp-tot-label">Subtotal</td><td class="rcp-tot-val">${fmt(inv.subtotal, inv.currency)}</td></tr>
          ${Number(inv.tax_rate) > 0 ? `<tr><td class="rcp-tot-label">Tax (${inv.tax_rate}%)</td><td class="rcp-tot-val">${fmt(inv.tax_amount, inv.currency)}</td></tr>` : ''}
          ${Number(inv.discount) > 0 ? `<tr><td class="rcp-tot-label">Discount</td><td class="rcp-tot-val">-${fmt(inv.discount, inv.currency)}</td></tr>` : ''}
          <tr class="rcp-tot-total"><td>Total</td><td class="rcp-tot-val">${fmt(inv.total, inv.currency)}</td></tr>
          ${amountPaid > 0 ? `<tr><td class="rcp-tot-label">Amount Paid</td><td class="rcp-tot-val">${fmt(amountPaid, inv.currency)}</td></tr>` : ''}
          ${amountPaid > 0 ? `<tr class="rcp-tot-balance"><td>Balance Due</td><td class="rcp-tot-val">${fmt(balanceDue, inv.currency)}</td></tr>` : ''}
        </table>
      </div>

      ${inv.notes ? `
        <div class="rcp-note-block">
          <div class="rcp-note-label">Notes:</div>
          <div class="rcp-note-text">${inv.notes}</div>
        </div>
      ` : ''}
      ${inv.terms ? `
        <div class="rcp-note-block">
          <div class="rcp-note-label">Terms:</div>
          <div class="rcp-note-text">${inv.terms}</div>
        </div>
      ` : ''}

      <hr class="rcp-divider" style="margin-top:28px" />
      <div class="rcp-footer">Thank you for your business — TriAxis IT Solutions · triaxistechnologies.com</div>
    </div>
  `;
}

function renderSidebar(inv) {
  document.getElementById('statusBadgeWrap').innerHTML = statusBadge(inv.status);
  document.getElementById('btnEdit').href = `/create.html?id=${inv.id}`;

  const isPaid = inv.status === 'paid';
  document.getElementById('btnMarkPaid').style.display = isPaid ? 'none' : 'flex';
  document.getElementById('btnReceipt').style.display = isPaid ? 'flex' : 'none';
  document.getElementById('btnEmailReceipt').style.display = isPaid ? 'flex' : 'none';

  document.getElementById('sideInfo').innerHTML = `
    <div class="info-row"><span class="info-label">Invoice #</span><span class="info-value">${inv.invoice_number}</span></div>
    <div class="info-row"><span class="info-label">Client</span><span class="info-value">${inv.client_name}</span></div>
    <div class="info-row"><span class="info-label">Total</span><span class="info-value" style="color:var(--navy);font-weight:800">${fmt(inv.total, inv.currency)}</span></div>
    <div class="info-row"><span class="info-label">Due</span><span class="info-value">${inv.due_date || '—'}</span></div>
    ${isPaid ? `<div class="info-row"><span class="info-label">Paid via</span><span class="info-value">${inv.payment_method || '—'}</span></div>` : ''}
    <div class="info-row">
      <span class="info-label">Emailed</span>
      <span class="info-value" style="color:${inv.emailed_at ? 'var(--success)' : 'var(--muted)'}">
        ${inv.emailed_at ? new Date(inv.emailed_at).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }) : 'Not sent'}
      </span>
    </div>
  `;

  // Set today as default paid date
  document.getElementById('paidDate').value = new Date().toISOString().split('T')[0];
}

async function load() {
  const { data, error } = await supabase.from('invoices').select('*').eq('id', id).single();
  if (error || !data) { window.location.href = '/dashboard.html'; return; }
  invoice = data;
  renderPreview(invoice);
  renderSidebar(invoice);
}

// Preview PDF
document.getElementById('btnPreview').addEventListener('click', async () => {
  await previewPDF(invoice, invoice.status === 'paid');
});

// Download PDF
document.getElementById('btnDownload').addEventListener('click', async () => {
  await downloadPDF(invoice, false);
});

// Download Receipt
document.getElementById('btnReceipt').addEventListener('click', async () => {
  await downloadPDF(invoice, true);
});

// Email Receipt
document.getElementById('btnEmailReceipt').addEventListener('click', async () => {
  if (!invoice.client_email) { showToast('No email on file', 'This invoice has no client email address.', 'error'); return; }
  const btn = document.getElementById('btnEmailReceipt');
  btn.textContent = 'Sending…';
  btn.disabled = true;
  try {
    const pdfBase64 = await getPDFBase64(invoice, true);
    await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'receipt',
        token: WEBHOOK_TOKEN,
        invoice_number: invoice.invoice_number,
        client_name: invoice.client_name,
        client_email: invoice.client_email,
        total: invoice.total,
        currency: invoice.currency,
        pdf_base64: pdfBase64,
      }),
    });
    showToast('Receipt sent!', `Emailed to ${invoice.client_email}`, 'success');
  } catch {
    showToast('Send failed', 'Could not send the receipt. Please try again.', 'error');
  } finally {
    btn.textContent = 'Email Receipt';
    btn.disabled = false;
  }
});

// Email to client
document.getElementById('btnEmail').addEventListener('click', async () => {
  if (!invoice.client_email) { showToast('No email on file', 'This invoice has no client email address.', 'error'); return; }
  const btn = document.getElementById('btnEmail');
  btn.textContent = 'Sending…';
  btn.disabled = true;

  try {
    const pdfBase64 = await getPDFBase64(invoice, false);
    await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'invoice',
        token: WEBHOOK_TOKEN,
        invoice_number: invoice.invoice_number,
        client_name: invoice.client_name,
        client_email: invoice.client_email,
        total: invoice.total,
        currency: invoice.currency,
        due_date: invoice.due_date,
        pdf_base64: pdfBase64,
      }),
    });
    await supabase.from('invoices').update({ emailed_at: new Date().toISOString() }).eq('id', id);
    invoice.emailed_at = new Date().toISOString();
    renderSidebar(invoice);
    showToast('Invoice sent!', `Emailed to ${invoice.client_email}`, 'success');
  } catch {
    showToast('Send failed', 'Could not send the email. Please try again.', 'error');
  } finally {
    btn.textContent = 'Email to Client';
    btn.disabled = false;
  }
});

// Mark as paid
const markPaidBtn = document.getElementById('btnMarkPaid');
markPaidBtn.addEventListener('click', () => {
  markPaidBtn.classList.replace('btn-outline', 'btn-success');
  document.getElementById('paidPanel').style.display = 'block';
});
document.getElementById('cancelPaidBtn').addEventListener('click', () => {
  markPaidBtn.classList.replace('btn-success', 'btn-outline');
  document.getElementById('paidPanel').style.display = 'none';
});
document.getElementById('confirmPaidBtn').addEventListener('click', async () => {
  const method = document.getElementById('paymentMethod').value;
  const paidAt = new Date(document.getElementById('paidDate').value).toISOString();
  const { error } = await supabase
    .from('invoices')
    .update({ status: 'paid', payment_method: method, paid_at: paidAt })
    .eq('id', id);
  if (error) { showToast('Update failed', error.message, 'error'); return; }
  document.getElementById('paidPanel').style.display = 'none';
  showToast('Marked as paid', `Payment recorded via ${method}`, 'success');
  await load();
});

load();
