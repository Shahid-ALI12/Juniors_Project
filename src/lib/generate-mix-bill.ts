interface BillItem {
  product: string;
  weight_kg: number;
  rate_per_kg: number;
  amount: number;
  bags?: number | null;
  rate_per_bag?: number | null;
  bag_amount?: number | null;
}

interface BillData {
  orderId: string;
  customerName: string;
  customerType: "credit" | "cash";
  orderDate: string;
  location?: string | null;
  items: BillItem[];
  totalWeight: number;
  totalAmount: number;
  totalBagAmount?: number;
  cashReceived?: number;
  driverName?: string | null;
  driverRent?: number;
}

/* ─── Farm branding constants ─── */
const FARM_NAME = "DANISH FARMHOUSE";
const FARM_TAGLINE = "Cattle Feed Supplier";
const FARM_ADDRESS = "Main Road, Tehsil & District Kasur, Punjab";
const FARM_PHONE = "0300-0000000";
const DEV_LINE1 = "Software By: Shahid ALI";
const DEV_LINE2 = "Contact: 03271487858";

export async function generateMixBillPDF(bill: BillData) {
  // Dynamic imports to avoid SSR crash on Vercel (jsPDF needs window/document)
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const { numberToRupeeWords } = await import("@/lib/number-to-words");

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const m = 14;
  let y = m;

  /* ════════════════════════════════════════════════════════
   *  HEADER BAND — Dark green double-border farmhouse style
   * ════════════════════════════════════════════════════════ */
  const headerH = 38;
  // Outer dark green band
  doc.setFillColor(8, 80, 57); // deep emerald
  doc.rect(0, 0, pw, headerH, "F");
  // Inner accent line
  doc.setDrawColor(245, 196, 56); // gold accent
  doc.setLineWidth(0.6);
  doc.line(0, headerH - 4, pw, headerH - 4);
  doc.setLineWidth(0.2);
  doc.setDrawColor(255, 255, 255);
  doc.line(0, headerH - 1.5, pw, headerH - 1.5);

  // Farm name — big bold
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(26);
  doc.setFont("helvetica", "bold");
  doc.text(FARM_NAME, pw / 2, 16, { align: "center" });

  // Tagline
  doc.setFontSize(11);
  doc.setFont("helvetica", "italic");
  doc.setTextColor(245, 230, 200);
  doc.text(FARM_TAGLINE, pw / 2, 23, { align: "center" });

  // Address + phone
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(220, 230, 222);
  doc.text(`${FARM_ADDRESS}  |  Phone: ${FARM_PHONE}`, pw / 2, 30, { align: "center" });

  // Bill subtitle
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text("MIX ORDER INVOICE", pw / 2, 36, { align: "center" });

  y = headerH + 8;

  /* ════════════════════════════════════════════════════════
   *  META BOX — Order #, Date, Type, Driver (two-column table)
   * ════════════════════════════════════════════════════════ */
  const metaBoxX = m;
  const metaBoxW = pw - m * 2;
  const metaBoxH = 22;

  doc.setFillColor(252, 253, 252);
  doc.setDrawColor(8, 80, 57);
  doc.setLineWidth(0.5);
  doc.roundedRect(metaBoxX, y, metaBoxW, metaBoxH, 1.5, 1.5, "FD");
  doc.setLineWidth(0.2);

  // Left column block
  const lx = metaBoxX + 5;
  const rx = metaBoxX + metaBoxW / 2 + 3;

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(110, 120, 130);
  doc.text("Bill No.", lx, y + 6);
  doc.text("Date", lx, y + 13);
  doc.text("Customer", lx, y + 20);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(20, 30, 40);
  doc.setFontSize(9.5);
  doc.text(`#${bill.orderId}`, lx + 16, y + 6);
  doc.text(bill.orderDate, lx + 16, y + 13);
  doc.setFontSize(9);
  doc.text(bill.customerName?.slice(0, 28) || "N/A", lx + 22, y + 20);

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(110, 120, 130);
  doc.text("Type", rx, y + 6);
  doc.text("Target Wt.", rx, y + 13);
  doc.text("Driver", rx, y + 20);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(20, 30, 40);
  doc.setFontSize(9.5);
  doc.text(bill.customerType === "credit" ? "Credit (Udhaar)" : "Cash (Nagad)", rx + 14, y + 6);
  doc.text(`${bill.totalWeight.toLocaleString("en-PK")} kg`, rx + 22, y + 13);
  doc.setFontSize(9);
  doc.text(bill.driverName?.slice(0, 22) || "—", rx + 16, y + 20);

  // Vertical divider
  doc.setDrawColor(210, 215, 220);
  doc.line(metaBoxX + metaBoxW / 2, y + 4, metaBoxX + metaBoxW / 2, y + metaBoxH - 4);

  y += metaBoxH + 6;

  /* ════════════════════════════════════════════════════════
   *  INGREDIENTS TABLE
   * ════════════════════════════════════════════════════════ */
  const hasBagInfo = bill.items.some(
    (i) => (i.bags && i.bags > 0) || (i.rate_per_bag && i.rate_per_bag > 0)
  );

  let head: string[];
  let tData: string[][];
  let columnStyles: Record<number, any>;

  if (hasBagInfo) {
    head = ["#", "Product", "Wt (kg)", "Rate/kg", "Amount", "Bags", "Rate/Bag", "Bag Amt"];
    tData = bill.items.map((ing, i) => [
      String(i + 1),
      ing.product,
      ing.weight_kg.toLocaleString("en-PK"),
      `Rs. ${ing.rate_per_kg.toLocaleString("en-PK")}`,
      `Rs. ${ing.amount.toLocaleString("en-PK")}`,
      ing.bags ? String(ing.bags) : "—",
      ing.rate_per_bag ? `Rs. ${ing.rate_per_bag.toLocaleString("en-PK")}` : "—",
      ing.bag_amount ? `Rs. ${ing.bag_amount.toLocaleString("en-PK")}` : "—",
    ]);
    columnStyles = {
      0: { cellWidth: 8, halign: "center" },
      1: { cellWidth: 38 },
      2: { cellWidth: 18, halign: "right" },
      3: { cellWidth: 22, halign: "right" },
      4: { cellWidth: 26, halign: "right" },
      5: { cellWidth: 14, halign: "right" },
      6: { cellWidth: 22, halign: "right" },
      7: { cellWidth: 22, halign: "right" },
    };
  } else {
    head = ["#", "Product Name", "Weight (kg)", "Rate / kg", "Amount"];
    tData = bill.items.map((ing, i) => [
      String(i + 1),
      ing.product,
      ing.weight_kg.toLocaleString("en-PK"),
      `Rs. ${ing.rate_per_kg.toLocaleString("en-PK")}`,
      `Rs. ${ing.amount.toLocaleString("en-PK")}`,
    ]);
    columnStyles = {
      0: { cellWidth: 12, halign: "center" },
      2: { cellWidth: 30, halign: "right" },
      3: { cellWidth: 35, halign: "right" },
      4: { cellWidth: 40, halign: "right" },
    };
  }

  const tw = bill.items.reduce((s, i) => s + i.weight_kg, 0).toLocaleString("en-PK");
  const ta = `Rs. ${bill.totalAmount.toLocaleString("en-PK")}`;

  const foot: string[] = hasBagInfo
    ? ["", "TOTAL", `${tw} kg`, "", ta, "", "", (bill.totalBagAmount ?? 0) > 0 ? `Rs. ${(bill.totalBagAmount ?? 0).toLocaleString("en-PK")}` : ""]
    : ["", "TOTAL", `${tw} kg`, "", ta];

  autoTable(doc, {
    startY: y,
    head: [head],
    body: tData,
    foot: [foot],
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
    columnStyles,
    margin: { left: m, right: m },
  });

  /* ════════════════════════════════════════════════════════
   *  TOTALS BOX + Amount in words
   * ════════════════════════════════════════════════════════ */
  const fy = (doc as any).lastAutoTable.finalY + 8;
  const bx = m;
  const bw = pw - m * 2;
  const hasDriverRent = bill.driverRent && bill.driverRent > 0;
  const isCash = bill.customerType === "cash" && bill.cashReceived !== undefined;
  // Calculate box height
  let extraRows = 0;
  if (hasDriverRent) extraRows++;
  if (isCash) extraRows += 2; // cash received + change
  const bh = 18 + extraRows * 8 + 10; // base + extras + words

  // Outer box
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

  let sy = fy + 9;
  // Grand Total
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(8, 80, 57);
  doc.text("Grand Total:", bx + 10, sy);
  doc.text(ta, bx + bw - 10, sy, { align: "right" });

  // Amount in words
  sy += 6;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.setTextColor(100, 110, 120);
  doc.text(`(In words: ${numberToRupeeWords(bill.totalAmount)})`, bx + 10, sy);

  // Driver Rent
  if (hasDriverRent) {
    sy += 8;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(60, 70, 80);
    doc.text("Driver Rent:", bx + 10, sy);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(8, 80, 57);
    doc.text(`Rs. ${bill.driverRent!.toLocaleString("en-PK")}`, bx + bw - 10, sy, { align: "right" });
  }

  // Cash received + change
  if (isCash) {
    const cash = bill.cashReceived as number;
    sy += 8;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(60, 70, 80);
    doc.text("Cash Received:", bx + 10, sy);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(20, 30, 40);
    doc.text(`Rs. ${cash.toLocaleString("en-PK")}`, bx + bw - 10, sy, { align: "right" });

    sy += 7;
    const change = cash - bill.totalAmount;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 70, 80);
    doc.text("Change:", bx + 10, sy);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(change >= 0 ? 8 : 180, change >= 0 ? 120 : 30, change >= 0 ? 60 : 30);
    doc.text(`Rs. ${change.toLocaleString("en-PK")}`, bx + bw - 10, sy, { align: "right" });
  }

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

  // Top divider
  doc.setDrawColor(8, 80, 57);
  doc.setLineWidth(0.5);
  doc.line(m, footY - 2, pw - m, footY - 2);
  doc.setLineWidth(0.2);

  // Footer text
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(8, 80, 57);
  doc.text(DEV_LINE1, pw / 2, footY + 4, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(80, 90, 100);
  doc.text(DEV_LINE2, pw / 2, footY + 9, { align: "center" });

  // Small generated-on tag (left) + farm name (right)
  doc.setFontSize(7);
  doc.setTextColor(150, 160, 170);
  doc.text(`Generated: ${new Date().toLocaleString("en-PK")}`, m, footY + 9);
  doc.text(`${FARM_NAME} • Computer-generated invoice`, pw - m, footY + 9, { align: "right" });

  doc.save(`Mix-Bill-${bill.orderId}-${bill.customerName.replace(/\s+/g, "-")}.pdf`);
}
