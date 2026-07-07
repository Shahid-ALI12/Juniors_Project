import type { Sale, Customer } from "@/types";

interface CustomerBillData {
  customer: Pick<Customer, "id" | "name" | "type" | "phone">;
  sales: Sale[];
  totalBill: number;
  totalCashPaid: number;
  balanceDue: number;
  generatedAt: string;
}

/* ─── Farm branding constants ─── */
const FARM_NAME = "DANISH FARMHOUSE";
const FARM_TAGLINE = "Cattle Feed Supplier";
const FARM_ADDRESS = "Main Road, Tehsil & District Kasur, Punjab";
const FARM_PHONE = "0300-0000000";
const DEV_LINE1 = "Software By: Shahid ALI";
const DEV_LINE2 = "Contact: 03271487858";

export async function generateCustomerBillPDF(bill: CustomerBillData) {
  // Dynamic imports to avoid SSR crash on Vercel
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const { numberToRupeeWords } = await import("@/lib/number-to-words");

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const m = 15;
  let y = m;

  /* ════════════════════════════════════════════════════════
   *  HEADER BAND — Dark green double-border farmhouse style
   * ════════════════════════════════════════════════════════ */
  const headerH = 38;
  doc.setFillColor(8, 80, 57); // deep emerald
  doc.rect(0, 0, pw, headerH, "F");
  // Gold accent line
  doc.setDrawColor(245, 196, 56);
  doc.setLineWidth(0.6);
  doc.line(0, headerH - 4, pw, headerH - 4);
  doc.setLineWidth(0.2);
  doc.setDrawColor(255, 255, 255);
  doc.line(0, headerH - 1.5, pw, headerH - 1.5);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(26);
  doc.setFont("helvetica", "bold");
  doc.text(FARM_NAME, pw / 2, 16, { align: "center" });

  doc.setFontSize(11);
  doc.setFont("helvetica", "italic");
  doc.setTextColor(245, 230, 200);
  doc.text(FARM_TAGLINE, pw / 2, 23, { align: "center" });

  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(220, 230, 222);
  doc.text(`${FARM_ADDRESS}  |  Phone: ${FARM_PHONE}`, pw / 2, 30, { align: "center" });

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text("CUSTOMER LEDGER STATEMENT", pw / 2, 36, { align: "center" });

  y = headerH + 8;

  /* ════════════════════════════════════════════════════════
   *  CUSTOMER META BOX
   * ════════════════════════════════════════════════════════ */
  const metaBoxX = m;
  const metaBoxW = pw - m * 2;
  const metaBoxH = 22;

  doc.setFillColor(252, 253, 252);
  doc.setDrawColor(8, 80, 57);
  doc.setLineWidth(0.5);
  doc.roundedRect(metaBoxX, y, metaBoxW, metaBoxH, 1.5, 1.5, "FD");
  doc.setLineWidth(0.2);

  const lx = metaBoxX + 5;
  const rx = metaBoxX + metaBoxW / 2 + 3;

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(110, 120, 130);
  doc.text("Customer ID", lx, y + 6);
  doc.text("Customer Name", lx, y + 13);
  doc.text("Type", lx, y + 20);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(20, 30, 40);
  doc.setFontSize(9.5);
  doc.text(`#${bill.customer.id}`, lx + 22, y + 6);
  doc.text(bill.customer.name?.slice(0, 28) || "N/A", lx + 28, y + 13);
  doc.text(bill.customer.type === "credit" ? "Credit (Udhaar)" : "Cash (Nagad)", lx + 16, y + 20);

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(110, 120, 130);
  doc.text("Phone", rx, y + 6);
  doc.text("Total Sales", rx, y + 13);
  doc.text("Generated", rx, y + 20);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(20, 30, 40);
  doc.setFontSize(9.5);
  doc.text(bill.customer.phone || "—", rx + 16, y + 6);
  doc.text(String(bill.sales.length), rx + 24, y + 13);
  doc.setFontSize(8.5);
  doc.text(bill.generatedAt, rx + 22, y + 20);

  // Vertical divider
  doc.setDrawColor(210, 215, 220);
  doc.line(metaBoxX + metaBoxW / 2, y + 4, metaBoxX + metaBoxW / 2, y + metaBoxH - 4);

  y += metaBoxH + 6;

  /* ════════════════════════════════════════════════════════
   *  TRANSACTION TABLE
   * ════════════════════════════════════════════════════════ */
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
    foot: [["", "", "", "", "", "TOTAL", totalBillStr, totalCashStr]],
    theme: "grid",
    headStyles: {
      fillColor: [8, 80, 57],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8.5,
      halign: "center",
      lineColor: [245, 196, 56],
      lineWidth: 0.1,
    },
    footStyles: {
      fillColor: [240, 244, 240],
      textColor: [8, 80, 57],
      fontStyle: "bold",
      fontSize: 9,
    },
    bodyStyles: { fontSize: 8.5, textColor: [40, 50, 60], lineColor: [218, 222, 220] },
    alternateRowStyles: { fillColor: [248, 250, 248] },
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

  /* ════════════════════════════════════════════════════════
   *  BALANCE DUE BOX
   * ════════════════════════════════════════════════════════ */
  const fy = (doc as any).lastAutoTable.finalY + 10;
  const bx = m;
  const bw = pw - m * 2;
  const bh = 28;

  doc.setFillColor(252, 253, 252);
  doc.setDrawColor(8, 80, 57);
  doc.setLineWidth(0.5);
  doc.roundedRect(bx, fy, bw, bh, 1.5, 1.5, "FD");
  doc.setLineWidth(0.2);

  // Inner gold accent line on left
  doc.setDrawColor(245, 196, 56);
  doc.setLineWidth(1.2);
  doc.line(bx + 2, fy + 4, bx + 2, fy + bh - 4);
  doc.setLineWidth(0.2);

  let sy = fy + 10;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(8, 80, 57);
  doc.text("Balance Due:", bx + 10, sy);
  doc.text(balanceStr, bx + bw - 10, sy, { align: "right" });

  sy += 7;
  doc.setFontSize(8);
  doc.setFont("helvetica", "italic");
  doc.setTextColor(100, 110, 120);
  doc.text(`(In words: ${numberToRupeeWords(bill.balanceDue)})`, bx + 10, sy);

  sy += 6;
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(80, 90, 100);
  doc.text(`Total Bill: ${totalBillStr}    |    Total Cash Paid: ${totalCashStr}`, bx + 10, sy);

  /* ════════════════════════════════════════════════════════
   *  SIGNATURE LINE
   * ════════════════════════════════════════════════════════ */
  let sigY = fy + bh + 18;
  if (sigY > ph - 35) sigY = ph - 35;
  doc.setDrawColor(120, 130, 140);
  doc.setLineWidth(0.3);
  doc.line(pw - m - 60, sigY, pw - m, sigY);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(80, 90, 100);
  doc.text("Authorised Signature", pw - m - 30, sigY + 5, { align: "center" });

  // Stamp-like circle on left
  doc.setDrawColor(8, 80, 57);
  doc.setLineWidth(0.4);
  doc.circle(m + 18, sigY - 2, 10, "S");
  doc.setFontSize(6);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(8, 80, 57);
  doc.text("DANISH", m + 18, sigY - 4, { align: "center" });
  doc.text("FARMHOUSE", m + 18, sigY - 0.5, { align: "center" });
  doc.text("• KASUR •", m + 18, sigY + 2.5, { align: "center" });

  /* ════════════════════════════════════════════════════════
   *  FOOTER BAND — Software By credit (mandatory on every bill)
   * ════════════════════════════════════════════════════════ */
  const footBandH = 14;
  const footY = ph - footBandH - 4;

  doc.setDrawColor(8, 80, 57);
  doc.setLineWidth(0.5);
  doc.line(m, footY - 2, pw - m, footY - 2);
  doc.setLineWidth(0.2);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(8, 80, 57);
  doc.text(DEV_LINE1, pw / 2, footY + 4, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(80, 90, 100);
  doc.text(DEV_LINE2, pw / 2, footY + 9, { align: "center" });

  doc.setFontSize(7);
  doc.setTextColor(150, 160, 170);
  doc.text(`Generated: ${new Date().toLocaleString("en-PK")}`, m, footY + 9);
  doc.text(`${FARM_NAME} • Computer-generated statement`, pw - m, footY + 9, { align: "right" });

  doc.save(`Khata-Bill-${bill.customer.name.replace(/\s+/g, "-")}-${bill.customer.id}.pdf`);
}
