import type { Sale, Customer } from "@/types";

interface CustomerBillData {
  customer: Pick<Customer, "id" | "name" | "type" | "phone">;
  sales: Sale[];
  openingBalance: number;
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

/* Color palette */
const C_GREEN: [number, number, number] = [8, 80, 57];
const C_GREEN_LIGHT: [number, number, number] = [240, 244, 240];
const C_GOLD: [number, number, number] = [245, 196, 56];
const C_GOLD_LIGHT: [number, number, number] = [252, 247, 232];
const C_DARK: [number, number, number] = [30, 40, 50];
const C_GRAY: [number, number, number] = [110, 120, 130];
const C_GRAY_LIGHT: [number, number, number] = [218, 222, 220];
const C_WHITE: [number, number, number] = [255, 255, 255];

export async function generateCustomerBillPDF(bill: CustomerBillData) {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const { numberToRupeeWords } = await import("@/lib/number-to-words");

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const m = 15;
  let y = m;

  /* ════════════════════════════════════════════════════════
   *  TOP GOLD LINE
   * ════════════════════════════════════════════════════════ */
  doc.setFillColor(...C_GOLD);
  doc.rect(0, 0, pw, 2.5, "F");

  /* ════════════════════════════════════════════════════════
   *  HEADER — Clean letterhead style
   * ════════════════════════════════════════════════════════ */
  const headerH = 36;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(...C_GREEN);
  doc.text(FARM_NAME, m, 14);

  doc.setFont("helvetica", "italic");
  doc.setFontSize(9.5);
  doc.setTextColor(...C_GRAY);
  doc.text(FARM_TAGLINE, m, 20);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(120, 130, 140);
  doc.text(FARM_ADDRESS, m, 26);
  doc.text(`Phone: ${FARM_PHONE}`, m, 30);

  // Right: LEDGER STATEMENT label
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...C_GREEN);
  doc.text("LEDGER", pw - m, 14, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...C_GRAY);
  doc.text("Customer Statement", pw - m, 20, { align: "right" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...C_DARK);
  doc.text(`Customer #${bill.customer.id}`, pw - m, 27, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...C_GRAY);
  doc.text(`Generated: ${bill.generatedAt}`, pw - m, 31, { align: "right" });

  // Gold + green divider
  doc.setDrawColor(...C_GOLD);
  doc.setLineWidth(0.8);
  doc.line(m, headerH, pw - m, headerH);
  doc.setLineWidth(0.2);
  doc.setDrawColor(...C_GREEN);
  doc.line(m, headerH + 1.2, pw - m, headerH + 1.2);

  y = headerH + 8;

  /* ════════════════════════════════════════════════════════
   *  TWO-COLUMN: Customer Info (left) | Summary (right)
   * ════════════════════════════════════════════════════════ */
  const colW = (pw - m * 2 - 6) / 2;
  const colH = 26;
  const leftX = m;
  const rightX = m + colW + 6;

  // Left box — Customer Info
  doc.setFillColor(...C_GREEN_LIGHT);
  doc.setDrawColor(...C_GRAY_LIGHT);
  doc.setLineWidth(0.3);
  doc.roundedRect(leftX, y, colW, colH, 1.5, 1.5, "FD");
  doc.setFillColor(...C_GREEN);
  doc.rect(leftX, y, 1.5, colH, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...C_GREEN);
  doc.text("CUSTOMER INFO", leftX + 5, y + 6);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...C_GRAY);
  doc.text("Name", leftX + 5, y + 11);
  doc.text("Phone", leftX + 5, y + 17);
  doc.text("Type", leftX + 5, y + 23);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(...C_DARK);
  doc.text(bill.customer.name?.slice(0, 24) || "N/A", leftX + 28, y + 11);
  doc.setFontSize(8.5);
  doc.text(bill.customer.phone || "—", leftX + 28, y + 17);
  doc.text(bill.customer.type === "credit" ? "Credit (Udhaar)" : "Cash (Nagad)", leftX + 28, y + 23);

  // Right box — Statement Summary
  doc.setFillColor(...C_GREEN_LIGHT);
  doc.setDrawColor(...C_GRAY_LIGHT);
  doc.roundedRect(rightX, y, colW, colH, 1.5, 1.5, "FD");
  doc.setFillColor(...C_GREEN);
  doc.rect(rightX, y, 1.5, colH, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...C_GREEN);
  doc.text("SUMMARY", rightX + 5, y + 6);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...C_GRAY);
  doc.text("Opening Bal.", rightX + 5, y + 11);
  doc.text("Total Sales", rightX + 5, y + 17);
  doc.text("Cash Paid", rightX + 5, y + 23);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(...C_DARK);
  doc.setFontSize(8.5);
  doc.text(`Rs. ${bill.openingBalance.toLocaleString("en-PK")}`, rightX + 32, y + 11);
  doc.text(`Rs. ${bill.totalBill.toLocaleString("en-PK")}`, rightX + 32, y + 17);
  doc.text(`Rs. ${bill.totalCashPaid.toLocaleString("en-PK")}`, rightX + 32, y + 23);

  y += colH + 8;

  /* ════════════════════════════════════════════════════════
   *  TRANSACTION TABLE
   *  Row 1 (if opening balance > 0): highlighted "Opening Balance" row
   *  Then sales rows indexed 1..N
   * ════════════════════════════════════════════════════════ */
  type TableRow = { data: string[]; opening?: boolean };

  const rows: TableRow[] = [];

  // Opening Balance row — only when there is a previous balance
  if (bill.openingBalance > 0) {
    rows.push({
      opening: true,
      data: [
        "—",
        bill.customer.name ? "" : "", // (no date for opening balance)
        "Opening Balance (purana balance)",
        "—",
        "—",
        "—",
        `Rs. ${bill.openingBalance.toLocaleString("en-PK")}`,
        "—",
      ],
    });
  }

  let rowNum = 1;
  bill.sales.forEach((sale, i) => {
    // ─── Mix Order rows are collapsed into a single "Mix Order" row ───
    // All ingredients share the same mix_order_id, sale_date, and cash_received.
    // We aggregate the bill amount and rickshaw, and show "Mix Order" as the product.
    if (sale.mix_order_id) {
      // Skip if we've already processed this mix order (first ingredient emits the row)
      // We detect this by checking if this is the first occurrence of this mix_order_id
      const mixOrderId = sale.mix_order_id;
      const firstOccurrenceIndex = bill.sales.findIndex((s) => s.mix_order_id === mixOrderId);
      if (firstOccurrenceIndex !== i) return; // already emitted, skip

      // Gather all ingredients of this mix order
      const ingredients = bill.sales.filter((s) => s.mix_order_id === mixOrderId);
      const totalBillAmount = ingredients.reduce(
        (sum, s) => sum + (s.quantity * s.rate_per_bag + s.rickshaw_fare),
        0
      );
      const totalRickshaw = ingredients.reduce((sum, s) => sum + s.rickshaw_fare, 0);
      const totalCashReceived = ingredients.reduce((sum, s) => sum + s.cash_received, 0);

      rows.push({
        data: [
          String(rowNum),
          sale.sale_date || "",
          "Mix Order",
          "—", // qty varies per ingredient, not meaningful as a single value
          "—", // rate varies per ingredient
          totalRickshaw > 0 ? `Rs. ${totalRickshaw.toLocaleString("en-PK")}` : "—",
          `Rs. ${totalBillAmount.toLocaleString("en-PK")}`,
          totalCashReceived > 0 ? `Rs. ${totalCashReceived.toLocaleString("en-PK")}` : "—",
        ],
      });
      rowNum++;
      return;
    }

    // ─── Solo sale — render normally ───
    const unitLabel = sale.unit_type === "kg" ? "kg" : "bags";
    const billAmount = sale.quantity * sale.rate_per_bag + sale.rickshaw_fare;
    rows.push({
      data: [
        String(rowNum),
        sale.sale_date || "",
        sale.products?.name || `Product #${sale.product_id}`,
        `${sale.quantity.toLocaleString("en-PK")} ${unitLabel}`,
        `Rs. ${sale.rate_per_bag.toLocaleString("en-PK")}`,
        sale.rickshaw_fare > 0 ? `Rs. ${sale.rickshaw_fare.toLocaleString("en-PK")}` : "—",
        `Rs. ${billAmount.toLocaleString("en-PK")}`,
        sale.cash_received > 0 ? `Rs. ${sale.cash_received.toLocaleString("en-PK")}` : "—",
      ],
    });
    rowNum++;
  });

  // The opening-balance row spans the date column visually using empty string,
  // we leave the date column empty for it.
  // (autoTable doesn't natively support rowSpan; using a "—" marker is fine.)
  if (bill.openingBalance > 0 && rows[0].opening) {
    rows[0].data[1] = "Prev. Bal.";
  }

  const tData = rows.map((r) => r.data);
  const openingRowIndices = rows
    .map((r, i) => (r.opening ? i : -1))
    .filter((i) => i >= 0);

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
      fillColor: C_GREEN,
      textColor: C_WHITE,
      fontStyle: "bold",
      fontSize: 8.5,
      halign: "center",
      lineColor: C_GREEN,
      lineWidth: 0.1,
      cellPadding: 2.5,
    },
    footStyles: {
      fillColor: C_GOLD_LIGHT,
      textColor: C_GREEN,
      fontStyle: "bold",
      fontSize: 9,
      cellPadding: 2.5,
    },
    bodyStyles: {
      fontSize: 8.5,
      textColor: [40, 50, 60],
      lineColor: C_GRAY_LIGHT,
      cellPadding: 2.5,
    },
    // Highlight the opening-balance row(s) in amber
    didParseCell: (hookData) => {
      if (
        hookData.section === "body" &&
        openingRowIndices.includes(hookData.row.index)
      ) {
        hookData.cell.styles.fillColor = C_GOLD_LIGHT;
        hookData.cell.styles.textColor = C_GREEN;
        hookData.cell.styles.fontStyle = "bold";
      }
    },
    alternateRowStyles: { fillColor: [249, 251, 249] },
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
   *  TOTALS BOX (right) + Amount in words (left)
   * ════════════════════════════════════════════════════════ */
  const fy = (doc as any).lastAutoTable.finalY + 8;
  const tBoxW = 80;
  const tBoxX = pw - m - tBoxW;
  // 4 rows when opening balance > 0, else 3 rows
  const hasOpening = bill.openingBalance > 0;
  const tBoxH = 8 + (hasOpening ? 4 : 3) * 7 + 10;

  doc.setFillColor(...C_WHITE);
  doc.setDrawColor(...C_GREEN);
  doc.setLineWidth(0.5);
  doc.roundedRect(tBoxX, fy, tBoxW, tBoxH, 1.5, 1.5, "FD");
  doc.setLineWidth(0.2);

  let ty = fy + 7;
  const labelX = tBoxX + 6;
  const valX = tBoxX + tBoxW - 6;

  // Opening Balance (only when > 0)
  if (hasOpening) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...C_GRAY);
    doc.text("Opening Bal:", labelX, ty);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...C_DARK);
    doc.text(`Rs. ${bill.openingBalance.toLocaleString("en-PK")}`, valX, ty, { align: "right" });
    ty += 7;
  }

  // Total Bill
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...C_GRAY);
  doc.text("Total Bill:", labelX, ty);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...C_DARK);
  doc.text(totalBillStr, valX, ty, { align: "right" });

  // Cash Paid
  ty += 7;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...C_GRAY);
  doc.text("Cash Paid:", labelX, ty);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...C_DARK);
  doc.text(totalCashStr, valX, ty, { align: "right" });

  // Divider
  ty += 5;
  doc.setDrawColor(...C_GOLD);
  doc.setLineWidth(0.5);
  doc.line(tBoxX + 4, ty, tBoxX + tBoxW - 4, ty);
  doc.setLineWidth(0.2);

  // Balance Due
  ty += 7;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...C_GREEN);
  doc.text("BALANCE DUE", labelX, ty);
  doc.text(balanceStr, valX, ty, { align: "right" });

  // Amount in words — left side
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8.5);
  doc.setTextColor(...C_GRAY);
  doc.text("Balance in words:", m, fy + 6);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...C_DARK);
  const wordsText = numberToRupeeWords(bill.balanceDue);
  const wordsLines = doc.splitTextToSize(wordsText, tBoxX - m - 6);
  doc.text(wordsLines, m, fy + 12);

  /* ════════════════════════════════════════════════════════
   *  TERMS & CONDITIONS
   * ════════════════════════════════════════════════════════ */
  const tcY = fy + tBoxH + 8;
  doc.setDrawColor(...C_GRAY_LIGHT);
  doc.setLineWidth(0.3);
  doc.line(m, tcY, pw - m, tcY);
  doc.setLineWidth(0.2);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...C_GREEN);
  doc.text("TERMS & CONDITIONS", m, tcY + 4);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...C_GRAY);
  doc.text("1. This is a computer-generated statement based on recorded transactions.", m, tcY + 8);
  doc.text("2. Please verify balances and report discrepancies within 7 days.", m, tcY + 11.5);
  doc.text("3. All disputes are subject to Kasur jurisdiction.", m, tcY + 15);

  /* ════════════════════════════════════════════════════════
   *  SIGNATURE SECTION
   * ════════════════════════════════════════════════════════ */
  let sigY = tcY + 22;
  if (sigY > ph - 30) sigY = ph - 30;

  doc.setDrawColor(...C_DARK);
  doc.setLineWidth(0.3);
  doc.line(pw - m - 65, sigY, pw - m, sigY);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...C_GRAY);
  doc.text("For Danish Farmhouse", pw - m - 32.5, sigY + 4, { align: "center" });
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...C_DARK);
  doc.text("Authorised Signatory", pw - m - 32.5, sigY + 8, { align: "center" });

  // Stamp circle on left
  doc.setDrawColor(...C_GREEN);
  doc.setLineWidth(0.5);
  doc.circle(m + 14, sigY - 3, 11, "S");
  doc.setLineWidth(0.2);
  doc.setDrawColor(...C_GOLD);
  doc.circle(m + 14, sigY - 3, 9, "S");
  doc.setFontSize(5.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...C_GREEN);
  doc.text("DANISH", m + 14, sigY - 5, { align: "center" });
  doc.text("FARMHOUSE", m + 14, sigY - 1.5, { align: "center" });
  doc.setFontSize(4.5);
  doc.setTextColor(...C_GOLD);
  doc.text("★ KASUR ★", m + 14, sigY + 2, { align: "center" });

  /* ════════════════════════════════════════════════════════
   *  FOOTER BAND
   * ════════════════════════════════════════════════════════ */
  const footBandH = 13;
  const footY = ph - footBandH - 3;

  doc.setDrawColor(...C_GOLD);
  doc.setLineWidth(0.6);
  doc.line(m, footY - 2, pw - m, footY - 2);
  doc.setDrawColor(...C_GREEN);
  doc.setLineWidth(0.2);
  doc.line(m, footY - 0.8, pw - m, footY - 0.8);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...C_GREEN);
  doc.text(DEV_LINE1, pw / 2, footY + 3.5, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...C_GRAY);
  doc.text(DEV_LINE2, pw / 2, footY + 8, { align: "center" });

  doc.setFillColor(...C_GOLD);
  doc.rect(0, ph - 1.5, pw, 1.5, "F");

  doc.save(`Khata-Bill-${bill.customer.name.replace(/\s+/g, "-")}-${bill.customer.id}.pdf`);
}
