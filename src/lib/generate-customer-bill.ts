import type { Sale, Customer } from "@/types";

interface CustomerBillData {
  customer: Pick<Customer, "id" | "name" | "type" | "phone">;
  sales: Sale[];
  totalBill: number;
  totalCashPaid: number;
  balanceDue: number;
  generatedAt: string;
}

export async function generateCustomerBillPDF(bill: CustomerBillData) {
  // Dynamic imports to avoid SSR crash on Vercel
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const { numberToRupeeWords } = await import("@/lib/number-to-words");

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pw = doc.internal.pageSize.getWidth();
  const m = 15;
  let y = m;

  // ── Header ──
  doc.setFillColor(16, 185, 129);
  doc.rect(0, 0, pw, 42, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text("Customer Ledger Bill", pw / 2, 16, { align: "center" });
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("Danish Cattle Feed — Daily Register", pw / 2, 24, { align: "center" });
  doc.text(`Generated: ${bill.generatedAt}`, pw / 2, 31, { align: "center" });
  doc.text(`Customer ID: #${bill.customer.id}`, pw / 2, 37, { align: "center" });

  y = 50;

  // ── Customer Info ──
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Customer Details", m, y);
  y += 2;
  doc.setDrawColor(226, 232, 240);
  doc.line(m, y, pw - m, y);
  y += 6;

  doc.setFontSize(10);
  const r = m + 50;
  const r2 = pw / 2 + 10;

  doc.setFont("helvetica", "normal");
  doc.text("Customer Name:", m, y);
  doc.setFont("helvetica", "bold");
  doc.text(bill.customer.name || "N/A", r, y);

  doc.setFont("helvetica", "normal");
  doc.text("Phone:", r2, y);
  doc.setFont("helvetica", "bold");
  doc.text(bill.customer.phone || "N/A", r2 + 25, y);
  y += 7;

  doc.setFont("helvetica", "normal");
  doc.text("Type:", m, y);
  doc.setFont("helvetica", "bold");
  doc.text(bill.customer.type === "credit" ? "Credit (Udhaar)" : "Cash (Nagad)", r, y);

  doc.setFont("helvetica", "normal");
  doc.text("Total Sales:", r2, y);
  doc.setFont("helvetica", "bold");
  doc.text(String(bill.sales.length), r2 + 30, y);
  y += 12;

  // ── Sales Table ──
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(30, 41, 59);
  doc.text("Transaction History", m, y);
  y += 2;
  doc.line(m, y, pw - m, y);
  y += 4;

  const tData = bill.sales.map((sale, i) => {
    const unitLabel = sale.unit_type === "kg" ? "kg" : "bags";
    const billAmount = sale.quantity * sale.rate_per_bag + sale.rickshaw_fare;
    return [
      String(i + 1),
      sale.sale_date || "",
      sale.products?.name || `Product #${sale.product_id}`,
      `${sale.quantity.toLocaleString("en-PK")} ${unitLabel}`,
      `Rs. ${sale.rate_per_bag.toLocaleString("en-PK")}`,
      sale.rickshaw_fare > 0 ? `Rs. ${sale.rickshaw_fare.toLocaleString("en-PK")}` : "—",
      `Rs. ${billAmount.toLocaleString("en-PK")}`,
      sale.cash_received > 0 ? `Rs. ${sale.cash_received.toLocaleString("en-PK")}` : "—",
    ];
  });

  const totalBillStr = `Rs. ${bill.totalBill.toLocaleString("en-PK")}`;
  const totalCashStr = `Rs. ${bill.totalCashPaid.toLocaleString("en-PK")}`;
  const balanceStr = `Rs. ${bill.balanceDue.toLocaleString("en-PK")}`;

  autoTable(doc, {
    startY: y,
    head: [["#", "Date", "Product", "Qty", "Rate", "Rickshaw", "Bill Amt", "Cash Paid"]],
    body: tData,
    foot: [["", "", "", "", "", "Total", totalBillStr, totalCashStr]],
    theme: "grid",
    headStyles: { fillColor: [16, 185, 129], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8 },
    footStyles: { fillColor: [241, 245, 249], textColor: [30, 41, 59], fontStyle: "bold", fontSize: 8 },
    bodyStyles: { fontSize: 8, textColor: [51, 65, 85] },
    columnStyles: {
      0: { cellWidth: 10, halign: "center" },
      1: { cellWidth: 22 },
      2: { cellWidth: 35 },
      3: { cellWidth: 22, halign: "right" },
      4: { cellWidth: 22, halign: "right" },
      5: { cellWidth: 20, halign: "right" },
      6: { cellWidth: 28, halign: "right" },
      7: { cellWidth: 28, halign: "right" },
    },
    margin: { left: m, right: m },
  });

  // ── Summary Box ──
  const fy = (doc as any).lastAutoTable.finalY + 10;
  const bx = m;
  const bw = pw - m * 2;
  const bh = 32;

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(bx, fy, bw, bh, 3, 3, "FD");

  let sy = fy + 9;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(16, 185, 129);
  doc.text("Balance Due:", bx + 10, sy);
  doc.text(balanceStr, bx + bw - 15, sy, { align: "right" });

  sy += 9;
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.setFont("helvetica", "italic");
  doc.text(numberToRupeeWords(bill.balanceDue), bx + 10, sy);

  // ── Footer ──
  const footY = fy + bh + 10;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184);
  doc.text("Computer-generated bill — Danish Cattle Feed Daily Register", pw / 2, footY, { align: "center" });

  doc.save(`Khata-Bill-${bill.customer.name.replace(/\s+/g, "-")}-${bill.customer.id}.pdf`);
}