import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const DARK = [30, 30, 30];
const GRAY = [120, 120, 120];
const LIGHT_GRAY = [210, 210, 210];
const NAVY = [0, 45, 85];
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

function drawWatermark(doc, logoData, pageWidth, pageHeight) {
  if (!logoData) return;

  const width = 120;
  const height = 60;
  const x = (pageWidth - width) / 2;
  const y = (pageHeight - height) / 2;

  doc.saveGraphicsState();
  if (typeof doc.setGState === 'function') {
    doc.setGState(new doc.GState({ opacity: 0.07 }));
  }
  doc.addImage(logoData, 'PNG', x, y, width, height, undefined, 'FAST', 28);
  doc.restoreGraphicsState();
}

export async function generatePDF(invoice, isReceipt = false) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 14;
  const logoData = await loadLogo();

  const title = isReceipt ? 'RECEIPT' : 'INVOICE';
  const amountPaid = Number(invoice.amount_paid) || 0;
  const balanceDue = Math.max(0, Number(invoice.total) - amountPaid);

  drawWatermark(doc, logoData, W, H);

  // ── HEADER: logo left, title right ──────────────────────────────
  if (logoData) {
    doc.addImage(logoData, 'PNG', M, M, 44, 22);
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(...NAVY);
    doc.text('TRIAXIS IT SOLUTIONS', M, 22);
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(30);
  doc.setTextColor(...DARK);
  doc.text(title, W - M, 20, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...GRAY);
  doc.text(`# ${invoice.invoice_number}`, W - M, 28, { align: 'right' });

  // ── COMPANY INFO ────────────────────────────────────────────────
  let y = 42;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...DARK);
  doc.text('TriAxis IT Solutions', M, y);
  y += 4.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...GRAY);
  doc.text('14 Independence Avenue, Accra, Ghana', M, y);
  y += 4;
  doc.text('info@triaxistechnologies.com  ·  triaxistechnologies.com', M, y);
  y += 7;

  doc.setDrawColor(...LIGHT_GRAY);
  doc.setLineWidth(0.3);
  doc.line(M, y, W - M, y);
  y += 8;

  // ── BILL TO / SHIP TO + METADATA TABLE ──────────────────────────
  const sectionY = y;
  const halfW = (W / 2) - M - 4;
  const billX = M;
  const shipX = M + halfW / 2 + 2;
  const metaX = W / 2 + 6;
  const metaW = W - M - metaX;
  const rowH = 8;

  // Labels
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...GRAY);
  doc.text('Bill To', billX, sectionY);
  doc.text('Ship To', shipX, sectionY);

  // Names
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...DARK);
  doc.text(invoice.client_name || '—', billX, sectionY + 5.5);
  doc.text(invoice.ship_to || invoice.client_name || '—', shipX, sectionY + 5.5);

  let leftY = sectionY + 11;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...GRAY);
  if (invoice.client_company) { doc.text(invoice.client_company, billX, leftY); leftY += 4.5; }
  if (invoice.client_email)   { doc.text(invoice.client_email, billX, leftY); leftY += 4.5; }
  if (invoice.client_phone)   { doc.text(invoice.client_phone, billX, leftY); leftY += 4.5; }
  if (invoice.client_address) { doc.text(invoice.client_address, billX, leftY); leftY += 4.5; }

  // Metadata rows (right side)
  const metaRows = [
    ['Date',            invoice.issue_date || '—'],
    ['Payment Terms',   invoice.payment_terms || '—'],
    ['Due Date',        invoice.due_date || '—'],
    ['PO Number',       invoice.po_number || '—'],
  ];

  metaRows.forEach(([label, value], i) => {
    const ry = sectionY + i * rowH;
    doc.setDrawColor(...LIGHT_GRAY);
    doc.setLineWidth(0.2);
    doc.rect(metaX, ry, metaW, rowH);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...GRAY);
    doc.text(label, metaX + 3, ry + 5.2);
    doc.setFontSize(8.5);
    doc.setTextColor(...DARK);
    doc.text(value, metaX + metaW - 3, ry + 5.2, { align: 'right' });
  });

  // Balance Due row (highlighted)
  const balRowY = sectionY + metaRows.length * rowH;
  const balRowH = 10;
  doc.setFillColor(235, 242, 250);
  doc.rect(metaX, balRowY, metaW, balRowH, 'FD');
  doc.setDrawColor(...LIGHT_GRAY);
  doc.setLineWidth(0.3);
  doc.rect(metaX, balRowY, metaW, balRowH);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...DARK);
  doc.text('Balance Due', metaX + 3, balRowY + 6.5);
  doc.setFontSize(11);
  doc.text(fmt(balanceDue, invoice.currency), metaX + metaW - 3, balRowY + 6.8, { align: 'right' });

  y = Math.max(leftY, sectionY + metaRows.length * rowH + balRowH) + 10;

  doc.setDrawColor(...LIGHT_GRAY);
  doc.setLineWidth(0.3);
  doc.line(M, y - 4, W - M, y - 4);

  // ── LINE ITEMS TABLE ────────────────────────────────────────────
  const items = invoice.items || [];
  autoTable(doc, {
    startY: y,
    head: [['Item', 'Quantity', 'Rate', 'Amount']],
    body: items.map(item => [
      item.description || '',
      item.qty || 1,
      fmt(item.unit_price || 0, invoice.currency),
      fmt((item.qty || 1) * (item.unit_price || 0), invoice.currency),
    ]),
    headStyles: {
      fillColor: [51, 51, 51],
      textColor: [255, 255, 255],
      fontSize: 8.5,
      fontStyle: 'bold',
    },
    bodyStyles: { fontSize: 8.5, textColor: DARK },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { cellWidth: 24, halign: 'center' },
      2: { cellWidth: 32, halign: 'right' },
      3: { cellWidth: 32, halign: 'right' },
    },
    margin: { left: M, right: M },
    theme: 'grid',
    tableLineColor: LIGHT_GRAY,
    tableLineWidth: 0.2,
  });

  y = doc.lastAutoTable.finalY + 8;

  // ── TOTALS ───────────────────────────────────────────────────────
  const totalsX = W - 82;
  const totalsRows = [['Subtotal', fmt(invoice.subtotal, invoice.currency)]];
  if (Number(invoice.tax_rate) > 0)
    totalsRows.push([`Tax (${invoice.tax_rate}%)`, fmt(invoice.tax_amount, invoice.currency)]);
  if (Number(invoice.discount) > 0)
    totalsRows.push(['Discount', `-${fmt(invoice.discount, invoice.currency)}`]);
  totalsRows.push(['Total', fmt(invoice.total, invoice.currency)]);
  if (amountPaid > 0)
    totalsRows.push(['Amount Paid', fmt(amountPaid, invoice.currency)]);

  totalsRows.forEach(([label, value]) => {
    const isTotal = label === 'Total';
    if (isTotal) {
      doc.setDrawColor(...LIGHT_GRAY);
      doc.setLineWidth(0.3);
      doc.line(totalsX, y - 1, W - M, y - 1);
    }
    doc.setFont('helvetica', isTotal ? 'bold' : 'normal');
    doc.setFontSize(isTotal ? 9.5 : 8.5);
    doc.setTextColor(...(isTotal ? DARK : GRAY));
    doc.text(label, totalsX, y + 4);
    doc.setTextColor(...DARK);
    doc.text(value, W - M, y + 4, { align: 'right' });
    y += 7;
  });

  // Balance due line (if partial payment)
  if (amountPaid > 0) {
    doc.setDrawColor(...LIGHT_GRAY);
    doc.setLineWidth(0.3);
    doc.line(totalsX, y - 1, W - M, y - 1);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...DARK);
    doc.text('Balance Due', totalsX, y + 4);
    doc.text(fmt(balanceDue, invoice.currency), W - M, y + 4, { align: 'right' });
    y += 10;
  }

  y += 8;

  // PAID stamp
  if (isReceipt || invoice.status === 'paid') {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(40);
    doc.setTextColor(22, 163, 74);
    doc.saveGraphicsState();
    doc.text('PAID', W / 2, y, { align: 'center', angle: 15 });
    doc.restoreGraphicsState();
    y += 18;
  }

  // ── NOTES ────────────────────────────────────────────────────────
  if (invoice.notes) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...GRAY);
    doc.text('Notes:', M, y);
    y += 5;
    doc.setFontSize(8.5);
    doc.setTextColor(...DARK);
    const noteLines = doc.splitTextToSize(invoice.notes, W - 28);
    doc.text(noteLines, M, y);
    y += noteLines.length * 4.5 + 6;
  }

  // ── TERMS ─────────────────────────────────────────────────────────
  if (invoice.terms) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...GRAY);
    doc.text('Terms:', M, y);
    y += 5;
    doc.setFontSize(8.5);
    doc.setTextColor(...DARK);
    const termLines = doc.splitTextToSize(invoice.terms, W - 28);
    doc.text(termLines, M, y);
  }

  // ── FOOTER ───────────────────────────────────────────────────────
  doc.setDrawColor(...LIGHT_GRAY);
  doc.setLineWidth(0.3);
  doc.line(M, H - 16, W - M, H - 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(160, 160, 160);
  doc.text('Thank you for your business — TriAxis IT Solutions  ·  triaxistechnologies.com', W / 2, H - 9, { align: 'center' });

  return doc;
}

export async function downloadPDF(invoice, isReceipt = false) {
  const doc = await generatePDF(invoice, isReceipt);
  const prefix = isReceipt ? 'Receipt' : 'Invoice';
  doc.save(`${prefix}-${invoice.invoice_number}.pdf`);
}

export async function previewPDF(invoice, isReceipt = false) {
  const doc = await generatePDF(invoice, isReceipt);
  const url = doc.output('bloburl');
  window.open(url, '_blank');
}

export async function getPDFBase64(invoice, isReceipt = false) {
  const doc = await generatePDF(invoice, isReceipt);
  return doc.output('datauristring').split(',')[1];
}
