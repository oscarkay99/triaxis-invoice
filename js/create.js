import { supabase } from './supabase.js';
import { requireAuth, renderUser, logout } from './guard.js';

const session = await requireAuth();
if (!session) throw new Error('Not authenticated');
renderUser(session);
document.getElementById('logoutBtn').addEventListener('click', logout);

const params = new URLSearchParams(location.search);
const editId = params.get('id');
if (editId) document.getElementById('pageTitle').textContent = 'Edit Invoice';

const sym = () => document.getElementById('currency').value === 'GHS' ? '₵' : '$';
const fmt = (n) => `${sym()}${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

// ===== Invoice number =====
async function genInvoiceNumber() {
  const year = new Date().getFullYear();
  const { count } = await supabase
    .from('invoices')
    .select('*', { count: 'exact', head: true })
    .like('invoice_number', `INV-${year}-%`);
  const n = String((count || 0) + 1).padStart(3, '0');
  return `INV-${year}-${n}`;
}

// ===== Default dates =====
const today = new Date();
document.getElementById('issueDate').value = today.toISOString().split('T')[0];
const due = new Date(today); due.setDate(due.getDate() + 30);
document.getElementById('dueDate').value = due.toISOString().split('T')[0];

// ===== Line items =====
let items = [{ description: '', qty: 1, unit_price: 0 }];

function renderItems() {
  const body = document.getElementById('itemsBody');
  body.innerHTML = items.map((item, i) => `
    <tr>
      <td><input type="text" value="${item.description}" placeholder="Service or product description" data-i="${i}" data-field="description" /></td>
      <td><input type="number" value="${item.qty}" min="1" step="1" style="width:60px" data-i="${i}" data-field="qty" /></td>
      <td><input type="number" value="${item.unit_price}" min="0" step="0.01" style="width:100px" data-i="${i}" data-field="unit_price" /></td>
      <td class="item-total">${fmt(item.qty * item.unit_price)}</td>
      <td><button class="btn-remove-item" data-remove="${i}" ${items.length === 1 ? 'disabled' : ''}>×</button></td>
    </tr>
  `).join('');

  body.querySelectorAll('input').forEach(input => {
    input.addEventListener('input', () => {
      const i = parseInt(input.dataset.i);
      const field = input.dataset.field;
      items[i][field] = field === 'description' ? input.value : parseFloat(input.value) || 0;
      recalc();
    });
  });
  body.querySelectorAll('[data-remove]').forEach(btn => {
    btn.addEventListener('click', () => {
      items.splice(parseInt(btn.dataset.remove), 1);
      renderItems();
      recalc();
    });
  });
}

function recalc() {
  const subtotal = items.reduce((s, item) => s + (item.qty * item.unit_price), 0);
  const taxRate = parseFloat(document.getElementById('taxRate').value) || 0;
  const discount = parseFloat(document.getElementById('discountAmt').value) || 0;
  const taxAmt = subtotal * taxRate / 100;
  const total = subtotal + taxAmt - discount;

  document.getElementById('subtotalDisplay').textContent = fmt(subtotal);
  document.getElementById('taxDisplay').textContent = fmt(taxAmt);
  document.getElementById('discountDisplay').textContent = `-${fmt(discount)}`;
  document.getElementById('totalDisplay').textContent = fmt(total);
  document.getElementById('sideTotal').textContent = fmt(total);

  // Update row totals
  document.querySelectorAll('.item-total').forEach((td, i) => {
    if (items[i]) td.textContent = fmt(items[i].qty * items[i].unit_price);
  });

  // Update sidebar
  document.getElementById('sideClient').textContent = document.getElementById('clientName').value || '—';
  document.getElementById('sideNumber').textContent = document.getElementById('invoiceNumber').value || '—';
  document.getElementById('sideCurrency').textContent = document.getElementById('currency').value;
  document.getElementById('sideDue').textContent = document.getElementById('dueDate').value || '—';
}

document.getElementById('addItemBtn').addEventListener('click', () => {
  items.push({ description: '', qty: 1, unit_price: 0 });
  renderItems();
});

document.getElementById('taxRate').addEventListener('input', recalc);
document.getElementById('discountAmt').addEventListener('input', recalc);
document.getElementById('currency').addEventListener('change', recalc);
document.getElementById('clientName').addEventListener('input', recalc);
document.getElementById('dueDate').addEventListener('change', recalc);

// ===== Collect form data =====
function collectData(status) {
  const subtotal = items.reduce((s, item) => s + (item.qty * item.unit_price), 0);
  const taxRate = parseFloat(document.getElementById('taxRate').value) || 0;
  const discount = parseFloat(document.getElementById('discountAmt').value) || 0;
  const taxAmt = subtotal * taxRate / 100;
  const total = subtotal + taxAmt - discount;

  return {
    invoice_number: document.getElementById('invoiceNumber').value,
    client_name: document.getElementById('clientName').value.trim(),
    client_company: document.getElementById('clientCompany').value.trim() || null,
    client_email: document.getElementById('clientEmail').value.trim() || null,
    client_address: document.getElementById('clientAddress').value.trim() || null,
    ship_to: document.getElementById('shipTo').value.trim() || null,
    currency: document.getElementById('currency').value,
    issue_date: document.getElementById('issueDate').value,
    due_date: document.getElementById('dueDate').value || null,
    payment_terms: document.getElementById('paymentTerms').value || null,
    po_number: document.getElementById('poNumber').value.trim() || null,
    items: items.filter(i => i.description),
    subtotal,
    tax_rate: taxRate,
    tax_amount: taxAmt,
    discount,
    total,
    amount_paid: parseFloat(document.getElementById('amountPaid').value) || 0,
    notes: document.getElementById('notes').value.trim() || null,
    terms: document.getElementById('terms').value.trim() || null,
    status,
    updated_at: new Date().toISOString(),
  };
}

// ===== Save =====
async function save(status) {
  const data = collectData(status);
  if (!data.client_name) { alert('Please enter a client name.'); return; }
  if (!data.items.length) { alert('Please add at least one line item.'); return; }

  let error;
  if (editId) {
    ({ error } = await supabase.from('invoices').update(data).eq('id', editId));
  } else {
    ({ error } = await supabase.from('invoices').insert(data));
  }

  if (error) { alert('Error saving invoice: ' + error.message); return; }
  window.location.href = '/dashboard.html';
}

document.getElementById('saveDraftBtn').addEventListener('click', () => save('draft'));
document.getElementById('saveBtn').addEventListener('click', () => save('unpaid'));

// ===== Load existing invoice for edit =====
async function init() {
  if (editId) {
    const { data } = await supabase.from('invoices').select('*').eq('id', editId).single();
    if (data) {
      document.getElementById('invoiceNumber').value = data.invoice_number;
      document.getElementById('currency').value = data.currency;
      document.getElementById('issueDate').value = data.issue_date;
      document.getElementById('dueDate').value = data.due_date || '';
      document.getElementById('clientName').value = data.client_name;
      document.getElementById('clientCompany').value = data.client_company || '';
      document.getElementById('clientEmail').value = data.client_email || '';
      document.getElementById('clientAddress').value = data.client_address || '';
      document.getElementById('taxRate').value = data.tax_rate || 0;
      document.getElementById('discountAmt').value = data.discount || 0;
      document.getElementById('amountPaid').value = data.amount_paid || 0;
      document.getElementById('paymentTerms').value = data.payment_terms || '';
      document.getElementById('poNumber').value = data.po_number || '';
      document.getElementById('shipTo').value = data.ship_to || '';
      document.getElementById('notes').value = data.notes || '';
      document.getElementById('terms').value = data.terms || '';
      items = data.items && data.items.length ? data.items : [{ description: '', qty: 1, unit_price: 0 }];
    }
  } else {
    document.getElementById('invoiceNumber').value = await genInvoiceNumber();
  }
  renderItems();
  recalc();
}

init();
