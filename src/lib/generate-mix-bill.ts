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

export async function generateMixBillPDF(bill: BillData) {
  // Dynamic imports to avoid SSR crash on Vercel (jsPDF needs window/document)
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pw = doc.internal.pageSize.getWidth();
  const m = 15;
  let y = m;

  // Header
  doc.setFillColor(16, 185, 129);
  doc.rect(0, 0, pw, 38, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("Custom Mix Order Bill", pw / 2, 16, { align: "center" });
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Order ID: ${bill.orderId}`, pw / 2, 26, { align: "center" });
  doc.text(`Date: ${bill.orderDate}`, pw / 2, 33, { align: "center" });

  y = 48;

  // Customer Info
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Customer Details", m, y);
  y += 2;
  doc.setDrawColor(226, 232, 240);
  doc.line(m, y, pw - m, y);
  y += 6;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(51, 65, 85);
  const r = m + 50;

  doc.text("Customer Name:", m, y);
  doc.setFont("helvetica", "bold");
  doc.text(bill.customerName || "N/A", r, y);

  doc.setFont("helvetica", "normal");
  doc.text("Order Type:", pw / 2 + 5, y);
  doc.setFont("helvetica", "bold");
  doc.text(bill.customerType === "credit" ? "Credit (Udhaar)" : "Cash (Nagad)", pw / 2 + 38, y);
  y += 7;

  doc.setFont("helvetica", "normal");
  doc.text("Target Weight:", m, y);
  doc.setFont("helvetica", "bold");
  doc.text(`${bill.totalWeight.toLocaleString("en-PK")} kg`, r, y);

  doc.setFont("helvetica", "normal");
  if (bill.driverName) {
    doc.text("Driver:", pw / 2 + 5, y);
    doc.setFont("helvetica", "bold");
    doc.text(bill.driverName, pw / 2 + 28, y);
  } else {
    doc.text("Driver:", pw / 2 + 5, y);
    doc.setFont("helvetica", "bold");
    doc.text("—", pw / 2 + 28, y);
  }
  y += 7;

  // Driver Rent line — shown only when > 0
  if (bill.driverRent && bill.driverRent > 0) {
    doc.setFont("helvetica", "normal");
    doc.text("Driver Rent:", m, y);
    doc.setFont("helvetica", "bold");
    doc.text(`Rs. ${bill.driverRent.toLocaleString("en-PK")}`, r, y);
    y += 7;
  }

  y += 5;

  // Ingredients Table
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(30, 41, 59);
  doc.text("Mix Ingredients", m, y);
  y += 2;
  doc.line(m, y, pw - m, y);
  y += 4;

  // Decide columns: if any item has bag info, show Bags + Rate/Bag + Bag Amount columns
  const hasBagInfo = bill.items.some(
    (i) => (i.bags && i.bags > 0) || (i.rate_per_bag && i.rate_per_bag > 0)
  );

  let tData: string[][];
  let head: string[];
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
    headStyles: { fillColor: [16, 185, 129], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8 },
    footStyles: { fillColor: [241, 245, 249], textColor: [30, 41, 59], fontStyle: "bold", fontSize: 8 },
    bodyStyles: { fontSize: 8, textColor: [51, 65, 85] },
    columnStyles,
    margin: { left: m, right: m },
  });

  // Summary
  const fy = (doc as any).lastAutoTable.finalY + 10;
  const bx = m;
  const bw = pw - m * 2;
  // Taller box if driver rent is shown
  const hasDriverRent = bill.driverRent && bill.driverRent > 0;
  const bh = bill.customerType === "cash"
    ? (hasDriverRent ? 52 : 38)
    : (hasDriverRent ? 36 : 22);

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(bx, fy, bw, bh, 3, 3, "FD");

  let sy = fy + 8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(16, 185, 129);
  doc.text("Grand Total:", bx + 10, sy);
  doc.text(ta, bx + bw - 15, sy, { align: "right" });

  // Driver Rent in summary box
  if (hasDriverRent) {
    sy += 8;
    doc.setFontSize(10);
    doc.setTextColor(51, 65, 85);
    doc.setFont("helvetica", "normal");
    doc.text("Driver Rent:", bx + 10, sy);
    doc.setFont("helvetica", "bold");
    doc.text(`Rs. ${bill.driverRent!.toLocaleString("en-PK")}`, bx + bw - 15, sy, { align: "right" });
  }

  if (bill.customerType === "cash" && bill.cashReceived !== undefined) {
    sy += 8;
    doc.setFontSize(10);
    doc.setTextColor(51, 65, 85);
    doc.setFont("helvetica", "normal");
    doc.text("Cash Received:", bx + 10, sy);
    doc.setFont("helvetica", "bold");
    doc.text(`Rs. ${bill.cashReceived.toLocaleString("en-PK")}`, bx + bw - 15, sy, { align: "right" });

    sy += 7;
    const change = bill.cashReceived - bill.totalAmount;
    doc.setFont("helvetica", "normal");
    doc.text("Change:", bx + 10, sy);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(change >= 0 ? 16 : 220, change >= 0 ? 185 : 38, change >= 0 ? 129 : 38);
    doc.text(`Rs. ${change.toLocaleString("en-PK")}`, bx + bw - 15, sy, { align: "right" });
  }

  // Footer
  const footY = fy + bh + 12;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text(`Generated on ${new Date().toLocaleString("en-PK")} | Computer-generated bill.`, pw / 2, footY, { align: "center" });

  doc.save(`Mix-Bill-${bill.orderId}-${bill.customerName.replace(/\s+/g, "-")}.pdf`);
}
