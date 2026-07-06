import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface BillData {
  orderId: string;
  customerName: string;
  customerType: "credit" | "cash";
  orderDate: string;
  location: string;
  items: { product: string; weight_kg: number; rate_per_kg: number; amount: number }[];
  totalWeight: number;
  totalAmount: number;
  cashReceived?: number;
}

export function generateMixBillPDF(bill: BillData) {
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
  doc.text("Location:", m, y);
  doc.setFont("helvetica", "bold");
  doc.text(bill.location || "N/A", r, y);

  doc.setFont("helvetica", "normal");
  doc.text("Target Weight:", pw / 2 + 5, y);
  doc.setFont("helvetica", "bold");
  doc.text(`${bill.totalWeight.toLocaleString("en-PK")} kg`, pw / 2 + 42, y);
  y += 12;

  // Ingredients Table
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(30, 41, 59);
  doc.text("Mix Ingredients", m, y);
  y += 2;
  doc.line(m, y, pw - m, y);
  y += 4;

  const tData = bill.items.map((ing, i) => [
    String(i + 1),
    ing.product,
    ing.weight_kg.toLocaleString("en-PK"),
    `Rs. ${ing.rate_per_kg.toLocaleString("en-PK")}`,
    `Rs. ${ing.amount.toLocaleString("en-PK")}`,
  ]);

  const tw = bill.items.reduce((s, i) => s + i.weight_kg, 0).toLocaleString("en-PK");
  const ta = `Rs. ${bill.totalAmount.toLocaleString("en-PK")}`;

  autoTable(doc, {
    startY: y,
    head: [["#", "Product Name", "Weight (kg)", "Rate / kg", "Amount"]],
    body: tData,
    foot: [["", "TOTAL", `${tw} kg`, "", ta]],
    theme: "grid",
    headStyles: { fillColor: [16, 185, 129], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 9 },
    footStyles: { fillColor: [241, 245, 249], textColor: [30, 41, 59], fontStyle: "bold", fontSize: 9 },
    bodyStyles: { fontSize: 9, textColor: [51, 65, 85] },
    columnStyles: { 0: { cellWidth: 12, halign: "center" }, 2: { cellWidth: 30, halign: "right" }, 3: { cellWidth: 35, halign: "right" }, 4: { cellWidth: 40, halign: "right" } },
    margin: { left: m, right: m },
  });

  // Summary
  const fy = (doc as any).lastAutoTable.finalY + 10;
  const bx = m;
  const bw = pw - m * 2;
  const bh = bill.customerType === "cash" ? 38 : 22;

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(bx, fy, bw, bh, 3, 3, "FD");

  let sy = fy + 8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(16, 185, 129);
  doc.text("Grand Total:", bx + 10, sy);
  doc.text(ta, bx + bw - 15, sy, { align: "right" });

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