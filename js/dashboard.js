import { supabase } from './supabase.js';
import { requireAuth, renderUser, logout } from './guard.js';

const session = await requireAuth();
if (!session) throw new Error('Not authenticated');
renderUser(session);

function showToast(title, message, type = 'success') {
  const container = document.getElementById('toast-container');
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

document.getElementById('logoutBtn').addEventListener('click', logout);

let allInvoices = [];
let currentFilter = 'all';

function fmt(amount, currency) {
  const sym = currency === 'GHS' ? '₵' : '$';
  return `${sym}${Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
}

function statusBadge(status) {
  const labels = { paid: 'Paid', unpaid: 'Unpaid', overdue: 'Overdue', draft: 'Draft' };
  return `<span class="badge badge-${status}">${labels[status] || status}</span>`;
}

function updateStats(invoices) {
  const total = invoices.reduce((s, i) => s + Number(i.total), 0);
  const unpaid = invoices.filter(i => i.status === 'unpaid');
  const overdue = invoices.filter(i => i.status === 'overdue');
  const paid = invoices.filter(i => i.status === 'paid');
  const unpaidAmt = unpaid.reduce((s, i) => s + Number(i.total), 0);
  const overdueAmt = overdue.reduce((s, i) => s + Number(i.total), 0);
  const paidAmt = paid.reduce((s, i) => s + Number(i.total), 0);

  document.getElementById('statTotal').textContent = `$${total.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
  document.getElementById('statTotalCount').textContent = `${invoices.length} invoice${invoices.length !== 1 ? 's' : ''}`;
  document.getElementById('statUnpaid').textContent = `$${unpaidAmt.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
  document.getElementById('statUnpaidCount').textContent = `${unpaid.length} unpaid`;
  document.getElementById('statOverdue').textContent = `$${overdueAmt.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
  document.getElementById('statOverdueCount').textContent = `${overdue.length} invoice${overdue.length !== 1 ? 's' : ''}`;
  document.getElementById('statPaid').textContent = `$${paidAmt.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
  document.getElementById('statPaidCount').textContent = `${paid.length} paid`;
}

function renderTable(invoices) {
  const tbody = document.getElementById('invoiceTable');
  if (!invoices.length) {
    tbody.innerHTML = `<tr><td colspan="7">
      <div class="empty-state">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        <h3>No invoices found</h3>
        <p>Create your first invoice to get started.</p>
      </div>
    </td></tr>`;
    return;
  }

  tbody.innerHTML = invoices.map(inv => `
    <tr>
      <td class="td-number">${inv.invoice_number}</td>
      <td>
        <div style="font-weight:600">${inv.client_name}</div>
        ${inv.client_company ? `<div style="font-size:0.78rem;color:var(--muted)">${inv.client_company}</div>` : ''}
      </td>
      <td class="td-amount">${fmt(inv.total, inv.currency)}</td>
      <td>
        ${statusBadge(inv.status)}
        ${inv.emailed_at ? `<div style="font-size:0.72rem;color:var(--success);margin-top:4px;display:flex;align-items:center;gap:4px;">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
          Emailed ${new Date(inv.emailed_at).toLocaleDateString('en-GB', { day:'numeric', month:'short' })}
        </div>` : ''}
      </td>
      <td>${inv.issue_date || '—'}</td>
      <td style="color:${inv.status === 'overdue' ? 'var(--danger)' : 'inherit'}">${inv.due_date || '—'}</td>
      <td>
        <div class="td-actions">
          <a href="/view.html?id=${inv.id}" class="btn btn-outline btn-sm">View</a>
          <a href="/create.html?id=${inv.id}" class="btn btn-outline btn-sm">Edit</a>
          <button class="btn btn-danger btn-sm" data-delete="${inv.id}">Delete</button>
        </div>
      </td>
    </tr>
  `).join('');

  // Delete handlers
  tbody.querySelectorAll('[data-delete]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this invoice? This cannot be undone.')) return;
      const { error } = await supabase.from('invoices').delete().eq('id', btn.dataset.delete);
      if (!error) loadInvoices();
    });
  });
}

async function loadInvoices() {
  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) { console.error(error); return; }

  // Auto-mark overdue
  const today = new Date().toISOString().split('T')[0];
  for (const inv of data) {
    if (inv.status === 'unpaid' && inv.due_date && inv.due_date < today) {
      await supabase.from('invoices').update({ status: 'overdue' }).eq('id', inv.id);
      inv.status = 'overdue';
    }
  }

  allInvoices = data;
  updateStats(data);
  applyFilter();
}

function applyFilter() {
  const filtered = currentFilter === 'all'
    ? allInvoices
    : currentFilter === 'mailed'
    ? allInvoices.filter(i => !!i.emailed_at)
    : allInvoices.filter(i => i.status === currentFilter);
  renderTable(filtered);
}

document.getElementById('filterTabs').addEventListener('click', (e) => {
  const tab = e.target.closest('.filter-tab');
  if (!tab) return;
  document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
  tab.classList.add('active');
  currentFilter = tab.dataset.filter;
  applyFilter();
});

loadInvoices();

// ===== UPLOAD =====
const BUCKET = 'invoice-uploads';
const userId = session.user.id;

async function loadUploads() {
  const list = document.getElementById('uploadList');
  const { data, error } = await supabase.storage.from(BUCKET).list(userId, {
    sortBy: { column: 'created_at', order: 'desc' },
  });

  if (error || !data || !data.length) {
    list.innerHTML = `<p style="font-size:0.8rem;color:var(--muted);text-align:center;padding:8px 0;">No uploaded invoices yet.</p>`;
    return;
  }

  list.innerHTML = data.map(file => `
    <div class="upload-item">
      <div class="upload-item-icon">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      </div>
      <div class="upload-item-name" title="${file.name}">${file.name.replace(/^\d+_/, '')}</div>
      <div class="upload-item-date">${new Date(file.created_at).toLocaleDateString()}</div>
      <div class="upload-item-actions">
        <button class="btn btn-outline btn-sm" data-download="${userId}/${file.name}">Download</button>
        <button class="btn btn-danger btn-sm" data-remove="${userId}/${file.name}">Delete</button>
      </div>
    </div>
  `).join('');

  list.querySelectorAll('[data-download]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const { data: urlData, error: urlErr } = await supabase.storage
        .from(BUCKET).createSignedUrl(btn.dataset.download, 300);
      if (urlErr) { showToast('Download failed', urlErr.message, 'error'); return; }
      const a = document.createElement('a');
      a.href = urlData.signedUrl;
      a.download = btn.dataset.download.split('/').pop().replace(/^\d+_/, '');
      a.click();
    });
  });

  list.querySelectorAll('[data-remove]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this file? This cannot be undone.')) return;
      const { error: removeErr } = await supabase.storage.from(BUCKET).remove([btn.dataset.remove]);
      if (removeErr) { showToast('Delete failed', removeErr.message, 'error'); return; }
      showToast('File deleted', '', 'info');
      loadUploads();
    });
  });
}

async function handleUpload(file) {
  if (!file) return;
  if (file.type !== 'application/pdf' && !file.name.endsWith('.pdf')) {
    showToast('Invalid file type', 'Please upload a PDF file.', 'error');
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    showToast('File too large', 'Maximum file size is 10 MB.', 'error');
    return;
  }

  const path = `${userId}/${Date.now()}_${file.name}`;
  const zone = document.getElementById('uploadZone');
  zone.style.opacity = '0.6';
  zone.style.pointerEvents = 'none';

  const { error } = await supabase.storage.from(BUCKET).upload(path, file);
  zone.style.opacity = '';
  zone.style.pointerEvents = '';

  if (error) { showToast('Upload failed', error.message, 'error'); return; }
  showToast('Uploaded!', file.name, 'success');
  loadUploads();
}

const uploadZone = document.getElementById('uploadZone');
const uploadInput = document.getElementById('uploadInput');

uploadZone.addEventListener('click', () => uploadInput.click());
uploadInput.addEventListener('change', () => handleUpload(uploadInput.files[0]));

uploadZone.addEventListener('dragover', (e) => { e.preventDefault(); uploadZone.classList.add('drag-over'); });
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
uploadZone.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadZone.classList.remove('drag-over');
  handleUpload(e.dataTransfer.files[0]);
});

loadUploads();
