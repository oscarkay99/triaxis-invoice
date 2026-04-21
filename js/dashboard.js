import { supabase } from './supabase.js';
import { requireAuth, renderUser, logout } from './guard.js';

const session = await requireAuth();
if (!session) throw new Error('Not authenticated');
renderUser(session);

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
      <td>${statusBadge(inv.status)}</td>
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
