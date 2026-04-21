import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const NAVY = [0, 45, 85];
const ORANGE = [244, 122, 32];
const MUTED = [95, 113, 132];
const LIGHT = [240, 244, 248];

function fmt(amount, currency) {
  const sym = currency === 'GHS' ? '₵' : '$';
  return `${sym}${Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
}

async function loadLogo() {
  try {
    const res = await fetch('/assets/logo.png');
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function generatePDF(invoice, isReceipt = false) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const logoData = await loadLogo();

  // Header background
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, W, 46, 'F');

  // Logo image or text fallback
  if (logoData) {
    doc.addImage(logoData, 'PNG', 12, 6, 38, 19);
  } else {
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text('TRIAXIS IT SOLUTIONS', 14, 17);
  }

  doc.setTextColor(168, 196, 224);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('14 Independence Avenue, Accra, Ghana', 14, 28);
  doc.text('info@triaxistechnologies.com  |  +233 30 123 4567', 14, 33);
  doc.text('triaxistechnologies.com', 14, 38);

  // Invoice / Receipt title
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  const title = isReceipt ? 'RECEIPT' : 'INVOICE';
  doc.text(title, W - 14, 18, { align: 'right' });

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(168, 196, 224);
  doc.text(`#${invoice.invoice_number}`, W - 14, 26, { align: 'right' });

  let y = 56;

  // Dates + Status block
  doc.setFillColor(...LIGHT);
  doc.roundedRect(14, y, W - 28, 24, 3, 3, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  doc.text('ISSUE DATE', 20, y + 7);
  doc.text('DUE DATE', 70, y + 7);
  if (isReceipt) doc.text('PAID DATE', 120, y + 7);
  doc.text('STATUS', W - 50, y + 7);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...NAVY);
  doc.text(invoice.issue_date || '—', 20, y + 16);
  doc.text(invoice.due_date || '—', 70, y + 16);
  if (isReceipt && invoice.paid_at) {
    doc.text(new Date(invoice.paid_at).toLocaleDateString('en-GB'), 120, y + 16);
  }

  // Status badge
  const statusColor = invoice.status === 'paid' ? [22, 163, 74] : invoice.status === 'overdue' ? [220, 38, 38] : [217, 119, 6];
  doc.setTextColor(...statusColor);
  doc.text((invoice.status || 'unpaid').toUpperCase(), W - 50, y + 16);

  y += 32;

  // Bill To
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  doc.text('BILL TO', 14, y);
  y += 6;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...NAVY);
  doc.text(invoice.client_name || '—', 14, y);
  y += 5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  if (invoice.client_company) { doc.text(invoice.client_company, 14, y); y += 5; }
  if (invoice.client_email) { doc.text(invoice.client_email, 14, y); y += 5; }
  if (invoice.client_address) { doc.text(invoice.client_address, 14, y); y += 5; }

  y += 6;

  // Line items table
  const items = invoice.items || [];
  autoTable(doc, {
    startY: y,
    head: [['Description', 'Qty', 'Unit Price', 'Total']],
    body: items.map(item => [
      item.description || '',
      item.qty || 1,
      fmt(item.unit_price || 0, invoice.currency),
      fmt((item.qty || 1) * (item.unit_price || 0), invoice.currency),
    ]),
    headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontSize: 8, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8.5, textColor: [10, 41, 72] },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { cellWidth: 18, halign: 'center' },
      2: { cellWidth: 32, halign: 'right' },
      3: { cellWidth: 32, halign: 'right', fontStyle: 'bold' },
    },
    margin: { left: 14, right: 14 },
    theme: 'grid',
  });

  y = doc.lastAutoTable.finalY + 8;

  // Totals
  const totalsX = W - 80;
  const rows = [
    ['Subtotal', fmt(invoice.subtotal, invoice.currency)],
  ];
  if (Number(invoice.tax_rate) > 0) rows.push([`Tax (${invoice.tax_rate}%)`, fmt(invoice.tax_amount, invoice.currency)]);
  if (Number(invoice.discount) > 0) rows.push(['Discount', `-${fmt(invoice.discount, invoice.currency)}`]);

  rows.forEach(([label, value]) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    doc.text(label, totalsX, y);
    doc.setTextColor(...NAVY);
    doc.text(value, W - 14, y, { align: 'right' });
    y += 6;
  });

  // Total line
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(0.5);
  doc.line(totalsX, y, W - 14, y);
  y += 5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...NAVY);
  doc.text('TOTAL', totalsX, y);
  doc.text(fmt(invoice.total, invoice.currency), W - 14, y, { align: 'right' });
  y += 10;

  // PAID stamp for receipts
  if (isReceipt || invoice.status === 'paid') {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(36);
    doc.setTextColor(22, 163, 74);
    doc.saveGraphicsState();
    doc.text('PAID', W / 2, y + 10, { align: 'center', angle: 15 });
    doc.restoreGraphicsState();
    y += 20;
  }

  // Notes
  if (invoice.notes) {
    y += 4;
    doc.setFillColor(...LIGHT);
    const noteLines = doc.splitTextToSize(invoice.notes, W - 48);
    const noteH = noteLines.length * 5 + 14;
    doc.roundedRect(14, y, W - 28, noteH, 3, 3, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text('NOTES', 20, y + 8);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...NAVY);
    doc.text(noteLines, 20, y + 14);
    y += noteH + 8;
  }

  // Footer
  doc.setFillColor(...NAVY);
  doc.rect(0, 285, W, 12, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(168, 196, 224);
  doc.text('Thank you for your business — TriAxis IT Solutions', W / 2, 292, { align: 'center' });

  return doc;
}

export async function downloadPDF(invoice, isReceipt = false) {
  const doc = await generatePDF(invoice, isReceipt);
  const prefix = isReceipt ? 'Receipt' : 'Invoice';
  doc.save(`${prefix}-${invoice.invoice_number}.pdf`);
}

export async function getPDFBase64(invoice, isReceipt = false) {
  const doc = await generatePDF(invoice, isReceipt);
  return doc.output('datauristring').split(',')[1];
}
