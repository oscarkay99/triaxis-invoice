import { supabase } from './supabase.js';
import { requireAuth, renderUser, logout } from './guard.js';
import { downloadPDF, getPDFBase64 } from './pdf.js';

const session = await requireAuth();
if (!session) throw new Error('Not authenticated');
renderUser(session);
document.getElementById('logoutBtn').addEventListener('click', logout);

const APPS_SCRIPT_URL = import.meta.env.VITE_APPS_SCRIPT_URL;
const WEBHOOK_TOKEN = 'triaxis_wh_7k4m2p9x';

const id = new URLSearchParams(location.search).get('id');
if (!id) { window.location.href = '/dashboard.html'; }

let invoice = null;

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

  document.getElementById('invoicePreview').innerHTML = `
    <div class="inv-header">
      <div>
        <div class="inv-brand">TRIAXIS<span>·</span>IT</div>
        <div class="inv-brand-sub">
          14 Independence Avenue, Accra, Ghana<br>
          info@triaxistechnologies.com · +233 30 123 4567
        </div>
      </div>
      <div class="inv-title-block">
        ${isPaid ? '<div class="inv-paid-stamp">PAID</div>' : ''}
        <div class="inv-title">${inv.status === 'paid' ? 'RECEIPT' : 'INVOICE'}</div>
        <div class="inv-number">#${inv.invoice_number}</div>
      </div>
    </div>

    <div class="inv-meta">
      <div>
        <div class="inv-meta-label">Bill To</div>
        <div class="inv-meta-value">
          <strong>${inv.client_name}</strong>
          ${inv.client_company || ''}
          ${inv.client_email ? `<br>${inv.client_email}` : ''}
          ${inv.client_address ? `<br>${inv.client_address}` : ''}
        </div>
      </div>
      <div>
        <div class="inv-meta-label">Invoice Details</div>
        <div class="inv-meta-value">
          <strong>Issue Date:</strong> ${inv.issue_date || '—'}<br>
          <strong>Due Date:</strong> ${inv.due_date || '—'}<br>
          ${isPaid ? `<strong>Paid:</strong> ${inv.paid_at ? new Date(inv.paid_at).toLocaleDateString('en-GB') : '—'}<br>` : ''}
          ${isPaid && inv.payment_method ? `<strong>Method:</strong> ${inv.payment_method}<br>` : ''}
          <strong>Currency:</strong> ${inv.currency}
        </div>
      </div>
    </div>

    <div class="inv-items">
      <table>
        <thead>
          <tr>
            <th>Description</th>
            <th class="text-right" style="width:60px">Qty</th>
            <th class="text-right" style="width:110px">Unit Price</th>
            <th class="text-right" style="width:110px">Total</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(item => `
            <tr>
              <td>${item.description || '—'}</td>
              <td class="text-right">${item.qty}</td>
              <td class="text-right">${fmt(item.unit_price, inv.currency)}</td>
              <td class="text-right" style="font-weight:600">${fmt(item.qty * item.unit_price, inv.currency)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    <div class="inv-totals">
      <table>
        <tr><td class="label">Subtotal</td><td class="value">${fmt(inv.subtotal, inv.currency)}</td></tr>
        ${Number(inv.tax_rate) > 0 ? `<tr><td class="label">Tax (${inv.tax_rate}%)</td><td class="value">${fmt(inv.tax_amount, inv.currency)}</td></tr>` : ''}
        ${Number(inv.discount) > 0 ? `<tr><td class="label">Discount</td><td class="value">-${fmt(inv.discount, inv.currency)}</td></tr>` : ''}
        <tr class="inv-total-row"><td>Total</td><td class="value">${fmt(inv.total, inv.currency)}</td></tr>
      </table>
    </div>

    ${inv.notes ? `
      <div class="inv-notes">
        <div class="inv-notes-label">Notes</div>
        <div class="inv-notes-text">${inv.notes}</div>
      </div>
    ` : ''}

    <div class="inv-footer">
      Thank you for your business — TriAxis IT Solutions · triaxistechnologies.com
    </div>
  `;
}

function renderSidebar(inv) {
  document.getElementById('statusBadgeWrap').innerHTML = statusBadge(inv.status);
  document.getElementById('btnEdit').href = `/create.html?id=${inv.id}`;

  const isPaid = inv.status === 'paid';
  document.getElementById('btnMarkPaid').style.display = isPaid ? 'none' : 'flex';
  document.getElementById('btnReceipt').style.display = isPaid ? 'flex' : 'none';

  document.getElementById('sideInfo').innerHTML = `
    <div class="info-row"><span class="info-label">Invoice #</span><span class="info-value">${inv.invoice_number}</span></div>
    <div class="info-row"><span class="info-label">Client</span><span class="info-value">${inv.client_name}</span></div>
    <div class="info-row"><span class="info-label">Total</span><span class="info-value" style="color:var(--navy);font-weight:800">${fmt(inv.total, inv.currency)}</span></div>
    <div class="info-row"><span class="info-label">Due</span><span class="info-value">${inv.due_date || '—'}</span></div>
    ${isPaid ? `<div class="info-row"><span class="info-label">Paid via</span><span class="info-value">${inv.payment_method || '—'}</span></div>` : ''}
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

// Download PDF
document.getElementById('btnDownload').addEventListener('click', async () => {
  await downloadPDF(invoice, false);
});

// Download Receipt
document.getElementById('btnReceipt').addEventListener('click', async () => {
  await downloadPDF(invoice, true);
});

// Email to client
document.getElementById('btnEmail').addEventListener('click', async () => {
  if (!invoice.client_email) { alert('No client email on this invoice.'); return; }
  const btn = document.getElementById('btnEmail');
  btn.textContent = 'Sending…';
  btn.disabled = true;

  try {
    const pdfBase64 = await getPDFBase64(invoice, false);
    const payload = {
      type: 'invoice',
      token: WEBHOOK_TOKEN,
      invoice_number: invoice.invoice_number,
      client_name: invoice.client_name,
      client_email: invoice.client_email,
      total: invoice.total,
      currency: invoice.currency,
      due_date: invoice.due_date,
      pdf_base64: pdfBase64,
    };
    await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    alert(`Invoice emailed to ${invoice.client_email}`);
  } catch {
    alert('Failed to send email. Please try again.');
  } finally {
    btn.textContent = 'Email to Client';
    btn.disabled = false;
  }
});

// Mark as paid
document.getElementById('btnMarkPaid').addEventListener('click', () => {
  document.getElementById('paidPanel').style.display = 'block';
});
document.getElementById('cancelPaidBtn').addEventListener('click', () => {
  document.getElementById('paidPanel').style.display = 'none';
});
document.getElementById('confirmPaidBtn').addEventListener('click', async () => {
  const method = document.getElementById('paymentMethod').value;
  const paidAt = new Date(document.getElementById('paidDate').value).toISOString();
  const { error } = await supabase
    .from('invoices')
    .update({ status: 'paid', payment_method: method, paid_at: paidAt })
    .eq('id', id);
  if (error) { alert('Error: ' + error.message); return; }
  document.getElementById('paidPanel').style.display = 'none';
  await load();
});

load();
