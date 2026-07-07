const { Document, Packer, Paragraph, TextRun, Header, Footer,
  AlignmentType, HeadingLevel, PageNumber, PageBreak,
  Table, TableRow, TableCell, WidthType, ShadingType,
  BorderStyle, TableOfContents, SectionType, NumberFormat
} = require("docx");
const fs = require("fs");

// ─── Color Palette (Cool Tech) ───
const P = {
  primary: "101820",
  body: "1C2A3D",
  secondary: "5B6B7D",
  accent: "10B981",
  surface: "F5F7FA",
  white: "FFFFFF",
  black: "000000",
  tableBorder: "CBD5E1",
  tableHeaderBg: "101820",
  tableAltBg: "F1F5F9",
  red: "DC2626",
  orange: "F59E0B",
  green: "10B981",
  blue: "3B82F6",
};

const c = (hex) => hex.replace("#", "");
const allNoBorders = {
  top: { style: BorderStyle.NONE, size: 0 },
  bottom: { style: BorderStyle.NONE, size: 0 },
  left: { style: BorderStyle.NONE, size: 0 },
  right: { style: BorderStyle.NONE, size: 0 },
};

// ─── Helpers ───
function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 480, after: 200, line: 312 },
    children: [new TextRun({ text, bold: true, color: c(P.primary), font: { name: "Times New Roman" }, size: 32 })],
  });
}
function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 360, after: 160, line: 312 },
    children: [new TextRun({ text, bold: true, color: c(P.primary), font: { name: "Times New Roman" }, size: 28 })],
  });
}
function h3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 240, after: 120, line: 312 },
    children: [new TextRun({ text, bold: true, color: c(P.body), font: { name: "Times New Roman" }, size: 26 })],
  });
}
function para(text) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: 120, line: 312 },
    children: [new TextRun({ text, size: 22, color: c(P.body), font: { name: "Times New Roman" } })],
  });
}
function paraBold(text) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: 120, line: 312 },
    children: [new TextRun({ text, size: 22, color: c(P.body), font: { name: "Times New Roman" }, bold: true })],
  });
}
function bullet(text, level = 0) {
  const indent = 360 + level * 360;
  return new Paragraph({
    spacing: { after: 60, line: 312 },
    indent: { left: indent, hanging: 260 },
    children: [new TextRun({ text: `\u2022  ${text}`, size: 22, color: c(P.body), font: { name: "Times New Roman" } })],
  });
}
function codeBlock(text) {
  return new Paragraph({
    spacing: { after: 60, line: 276 },
    indent: { left: 480 },
    shading: { type: ShadingType.CLEAR, fill: "F1F5F9" },
    children: [new TextRun({ text, size: 18, color: "334155", font: { name: "Consolas" } })],
  });
}
function emptyLine() {
  return new Paragraph({ spacing: { after: 60 }, children: [] });
}

function makeTableCell(text, opts = {}) {
  const { bold, header, align, width } = opts;
  const isHeader = header || false;
  return new TableCell({
    width: width ? { size: width, type: WidthType.PERCENTAGE } : undefined,
    shading: isHeader
      ? { type: ShadingType.CLEAR, fill: P.tableHeaderBg }
      : opts.alt
      ? { type: ShadingType.CLEAR, fill: P.tableAltBg }
      : undefined,
    verticalAlign: "center",
    margins: { top: 40, bottom: 40, left: 80, right: 80 },
    children: [
      new Paragraph({
        alignment: align || (isHeader ? AlignmentType.CENTER : AlignmentType.LEFT),
        spacing: { after: 0, line: 276 },
        children: [
          new TextRun({
            text: text || "",
            bold: bold || isHeader,
            size: isHeader ? 20 : 20,
            color: isHeader ? c(P.white) : c(P.body),
            font: { name: "Times New Roman" },
          }),
        ],
      }),
    ],
  });
}

function makeTable(headers, rows, colWidths) {
  const total = colWidths.reduce((a, b) => a + b, 0);
  const widths = colWidths.map((w) => (w / total) * 100);
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        tableHeader: true,
        cantSplit: true,
        children: headers.map((h, i) => makeTableCell(h, { header: true, width: widths[i] })),
      }),
      ...rows.map((row, ri) =>
        new TableRow({
          cantSplit: true,
          children: row.map((cell, ci) =>
            makeTableCell(cell, { width: widths[ci], alt: ri % 2 === 1 })
          ),
        })
      ),
    ],
  });
}

// ════════════════════════════════════════════════════════════════
// COVER SECTION
// ════════════════════════════════════════════════════════════════
const coverSection = {
  properties: {
    page: {
      size: { width: 11906, height: 16838, orientation: "portrait" },
      margin: { top: 0, bottom: 0, left: 0, right: 0 },
    },
  },
  children: [
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          height: { value: 16838, rule: "exact" },
          borders: allNoBorders,
          children: [
            new TableCell({
              width: { size: 100, type: WidthType.PERCENTAGE },
              shading: { type: ShadingType.CLEAR, fill: P.primary },
              verticalAlign: "top",
              borders: allNoBorders,
              margins: { top: 0, bottom: 0, left: 1200, right: 1200 },
              children: [
                new Paragraph({ spacing: { before: 3600 }, children: [] }),
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  spacing: { after: 200 },
                  children: [new TextRun({ text: "PROJECT", size: 28, color: c(P.accent), font: { name: "Calibri" }, bold: true, characterSpacing: 300 })],
                }),
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  spacing: { after: 100 },
                  children: [new TextRun({ text: "COMPREHENSIVE SUMMARY", size: 56, color: c(P.white), font: { name: "Times New Roman" }, bold: true })],
                }),
                new Paragraph({ spacing: { after: 600 }, alignment: AlignmentType.CENTER, children: [new TextRun({ text: "\u2500".repeat(30), size: 20, color: c(P.accent) })] }),
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  spacing: { after: 120 },
                  children: [new TextRun({ text: "Danish Cattle Feed", size: 40, color: c(P.white), font: { name: "Times New Roman" }, bold: true })],
                }),
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  spacing: { after: 80 },
                  children: [new TextRun({ text: "Daily Register Management System", size: 24, color: P.secondary, font: { name: "Calibri" } })],
                }),
                new Paragraph({ spacing: { after: 1200 }, children: [] }),
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  spacing: { after: 80 },
                  children: [new TextRun({ text: "Full Codebase, Database, Supabase & Deployment Analysis", size: 22, color: P.secondary, font: { name: "Calibri" } })],
                }),
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  spacing: { after: 80 },
                  children: [new TextRun({ text: "GitHub: Shahid-ALI12/Juniors_Project  |  Branch: main", size: 20, color: P.secondary, font: { name: "Calibri" } })],
                }),
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  spacing: { after: 80 },
                  children: [new TextRun({ text: "Deployment: Vercel  |  Database: Supabase (PostgreSQL)", size: 20, color: P.secondary, font: { name: "Calibri" } })],
                }),
                new Paragraph({ spacing: { after: 2400 }, children: [] }),
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [new TextRun({ text: `Generated: ${new Date().toLocaleDateString("en-PK", { timeZone: "Asia/Karachi", year: "numeric", month: "long", day: "numeric" })}`, size: 20, color: P.secondary, font: { name: "Calibri" } })],
                }),
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  spacing: { after: 200 },
                  children: [new TextRun({ text: "Confidential \u2014 For Internal Use Only", size: 18, color: P.red, font: { name: "Calibri" } })],
                }),
              ],
            }),
          ],
        }),
      ],
    }),
  ],
};

// ════════════════════════════════════════════════════════════════
// TOC SECTION
// ════════════════════════════════════════════════════════════════
const tocSection = {
  properties: {
    page: {
      size: { width: 11906, height: 16838 },
      margin: { top: 1440, bottom: 1440, left: 1701, right: 1417 },
      pageNumbers: { start: 1, formatType: NumberFormat.UPPER_ROMAN },
    },
  },
  footers: {
    default: new Footer({
      children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: ["PAGE \\* ROMAN \\* MERGEFORMAT"], size: 18, font: { name: "Calibri" }, color: c(P.secondary) })] })],
    }),
  },
  children: [
    new Paragraph({
      spacing: { after: 300 },
      children: [new TextRun({ text: "Table of Contents", size: 32, bold: true, color: c(P.primary), font: { name: "Times New Roman" } })],
    }),
    new TableOfContents("TOC", {
      hyperlink: true,
      headingStyleRange: "1-3",
    }),
    new Paragraph({ children: [new PageBreak()] }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 200, after: 200 },
      children: [new TextRun({ text: "Note: Right-click the Table of Contents and select \"Update Field\" to refresh page numbers.", size: 18, color: c(P.secondary), font: { name: "Calibri" }, italics: true })],
    }),
    new Paragraph({ children: [new PageBreak()] }),
  ],
};

// ════════════════════════════════════════════════════════════════
// BODY SECTION
// ════════════════════════════════════════════════════════════════
const body = [];

// ── 1. EXECUTIVE SUMMARY ──
body.push(h1("1. Executive Summary"));
body.push(para("Danish Cattle Feed is a full-stack production web application designed for managing the daily operations of a cattle feed business in Pakistan. The system handles sales, purchases, inventory (stock), customer accounts (khata/ledger), cash management, custom mix orders, expenses, and day-end reconciliation. It features two separate portals: an Admin Portal for business operators and a Customer Portal for credit customers to view their account statements and order history."));
body.push(para("The tech stack comprises Next.js 16 (App Router, React 19, TypeScript), Tailwind CSS 4, shadcn/ui component library, Supabase (PostgreSQL database with Row Level Security), and Zustand for state management. The application is deployed on Vercel with automatic builds from the GitHub repository Shahid-ALI12/Juniors_Project on the main branch. The Supabase instance is hosted at https://hyylnlgmbujkoadfejjy.supabase.co. The entire project follows a service-role-based architecture where all database operations are performed server-side using the Supabase service role key, bypassing Row Level Security for authenticated admin operations while keeping the data protected from anonymous access."));
body.push(para("This document provides a comprehensive A-to-Z analysis covering the complete codebase architecture, every database table and its columns, all 8 RPC (Remote Procedure Call) functions, the authentication and authorization flow, all API route endpoints, every page component and its functionality, the known bugs and issues (both resolved and pending), deployment configuration, and the security posture. This is intended to give any developer a complete understanding of the project within a single reading."));

// ── 2. PROJECT OVERVIEW & TECH STACK ──
body.push(h1("2. Project Overview & Technology Stack"));
body.push(h2("2.1 Project Name & Purpose"));
body.push(para("The project is called \"Danish Cattle Feed \u2014 Daily Register.\" It serves as a comprehensive business management system specifically designed for a cattle feed trading business. The primary functions include recording daily sales transactions (both bag-based and kilogram-based), tracking purchase orders from suppliers, maintaining real-time inventory/stock levels at multiple locations (Farm and Shop), managing customer credit accounts (khata), handling cash accounts and transfers, generating PDF bills, and performing day-end financial reconciliation."));
body.push(para("The business operates with two types of customers: \"cash\" customers who pay immediately, and \"credit\" customers who buy on credit (udhaar) with outstanding balances that accumulate over time. The system tracks all of this and provides detailed reports on outstanding amounts, over-credit-limit warnings, and customer-wise balance sheets."));

body.push(h2("2.2 Technology Stack"));
body.push(makeTable(
  ["Layer", "Technology", "Version", "Purpose"],
  [
    ["Framework", "Next.js (App Router)", "16.1.1", "Full-stack React framework with SSR/SSG"],
    ["Language", "TypeScript", "5.x", "Type-safe development"],
    ["UI Library", "React", "19.0.0", "Component rendering"],
    ["Styling", "Tailwind CSS", "4.x", "Utility-first CSS"],
    ["Component Kit", "shadcn/ui", "latest", "Pre-built accessible UI components"],
    ["Database", "Supabase (PostgreSQL)", "latest", "Hosted relational database with RLS"],
    ["DB Client", "@supabase/supabase-js", "2.110.0", "TypeScript Supabase client"],
    ["SSR Auth", "@supabase/ssr", "0.12.0", "Server-side auth with cookies"],
    ["State Mgmt", "Zustand", "5.0.14", "Lightweight client state management"],
    ["Data Fetching", "TanStack React Query", "5.82.0", "Server state management"],
    ["Tables", "TanStack React Table", "8.21.3", "Headless table logic"],
    ["PDF Generation", "jsPDF + jspdf-autotable", "4.2.1 / 5.0.8", "Client-side PDF bill generation"],
    ["Excel", "xlsx (SheetJS)", "0.18.5", "Excel import/export"],
    ["Password Hashing", "bcryptjs", "2.4.3", "Secure password hashing"],
    ["Rate Limiting", "@upstash/ratelimit + Redis", "2.0.8", "Login brute-force protection"],
    ["Icons", "lucide-react", "0.525.0", "SVG icon library"],
    ["Notifications", "sonner", "2.0.6", "Toast notifications"],
    ["Forms", "react-hook-form + zod", "7.60.0 / 4.0.2", "Form validation"],
    ["Date Utils", "date-fns", "4.1.0", "Date formatting"],
    ["Animations", "framer-motion", "12.23.2", "Page transitions"],
    ["Number Words", "Custom (number-to-words.ts)", "-", "Pakistani Lakh/Crore number system"],
  ],
  [18, 25, 12, 45]
));

body.push(h2("2.3 Project Structure"));
body.push(para("The project follows Next.js 16 App Router conventions with a clear separation of concerns. The src/ directory contains all source code, organized into app/ (routes, pages, API endpoints), components/ (UI components and page components), lib/ (utilities, data access, auth, Supabase clients), store/ (Zustand state), hooks/, types/, and middleware.ts. The supabase/ directory contains SQL files for database schema and RPC functions. A prisma/schema.prisma file exists but is deprecated (Prisma was removed in favor of direct Supabase queries)."));
body.push(makeTable(
  ["Directory/File", "Purpose"],
  [
    ["src/app/admin/", "Admin portal pages (login, dashboard, customer management)"],
    ["src/app/customer/", "Customer portal pages (login, dashboard with all modules)"],
    ["src/app/api/", "All REST API route handlers (20+ endpoints)"],
    ["src/components/pages/", "10 page-level components (dashboard, daily-entry, etc.)"],
    ["src/components/ui/", "40+ shadcn/ui base components"],
    ["src/components/shared/", "Shared components (PageHeader, ConfirmAction)"],
    ["src/components/layout/", "Sidebar navigation component"],
    ["src/components/auth/", "Auth provider component"],
    ["src/lib/data/", "10 data access modules (purchases, stock, sales, etc.)"],
    ["src/lib/supabase/", "4 Supabase client files (client, server, server-admin, ts)"],
    ["src/lib/auth/", "3 auth modules (server-user, cookie-sign, password)"],
    ["src/store/", "Zustand stores + master data cache + API helpers"],
    ["src/types/", "TypeScript interfaces for all DB entities"],
    ["src/lib/pkt-date.ts", "Pakistan Standard Time (UTC+5) date utilities"],
    ["src/lib/rate-limit.ts", "Upstash Redis rate limiting (login: 5/min, API: 60/min)"],
    ["src/lib/api-error.ts", "Error detail extraction from Supabase errors"],
    ["src/lib/customer-db.ts", "App customer CRUD (subscription portal users)"],
    ["src/lib/generate-customer-bill.ts", "PDF bill generation for customer khata"],
    ["src/lib/generate-mix-bill.ts", "PDF bill generation for custom mix orders"],
    ["src/lib/number-to-words.ts", "Pakistani Lakh/Crore number to English words"],
    ["src/middleware.ts", "Next.js Edge middleware (auth, CSRF, routing)"],
    ["supabase/schema.sql", "Full database schema (13 tables, indexes, RLS, seed data)"],
    ["supabase/all-rpc-functions.sql", "8 RPC functions (DROP + CREATE with TABLE returns)"],
  ],
  [35, 65]
));

// ── 3. DATABASE ARCHITECTURE ──
body.push(h1("3. Database Architecture (Supabase PostgreSQL)"));
body.push(para("The database is hosted on Supabase at https://hyylnlgmbujkoadfejjy.supabase.co. It uses PostgreSQL with Row Level Security (RLS) enabled on all tables. The application uses a dual-client architecture: a service-role client (server-admin.ts) that bypasses RLS for all server-side operations, and a regular anon-key client (client.ts) used only in browser components for auth session management. Business data tables have NO policies for anon or authenticated roles, meaning only the service-role client can access them. This is a deliberate security design."));

body.push(h2("3.1 Complete Table Schema"));
body.push(para("There are 13 tables in total, divided into four categories: subscription customers, master data, transactional data, and cash management. Every table uses bigint auto-incrementing primary keys (except app_customers which uses text UUID) and timestamptz for created_at timestamps. All tables have RLS enabled with no public read/write policies."));

// Tables
const tables = [
  { name: "app_customers", desc: "Subscription-based customer portal login accounts. Uses text UUID primary key. Stores bcrypt-hashed passwords, subscription type (monthly/yearly/custom), subscription dates, and active status. Accessed via verify_customer_login() RPC for secure password verification.", cols: "id (text PK), name, email (unique), password (bcrypt hash), subscription_type, subscription_start, subscription_end, is_active, created_at" },
  { name: "products", desc: "Master product catalog. Stores cattle feed product names (e.g., Wheat Bran/Choker, Cotton Seed Cake, Maize Gluten, Soya Bean Meal) with default rates per bag. Unique lowercase name index prevents duplicates.", cols: "id (bigint PK), name (unique), default_rate (numeric 12,2), is_active, created_at" },
  { name: "locations", desc: "Storage/sale locations. Seeded with two locations: 'Farm' and 'Shop'. Every sale, purchase, and stock entry must reference a location.", cols: "id (bigint PK), name (unique), created_at" },
  { name: "customers", desc: "Business customers (buyers of cattle feed). Two types: 'credit' (udhaar) and 'cash' (nagad). Credit customers accumulate outstanding balances. Has phone field for contact tracking.", cols: "id (bigint PK), name, type (credit/cash), phone, is_active, created_at" },
  { name: "suppliers", desc: "Raw material suppliers. Referenced by purchase records. Has is_active flag for soft deactivation.", cols: "id (bigint PK), name, is_active, created_at" },
  { name: "product_stock", desc: "Current stock levels per product per location. Uses a unique constraint on (product_id, location_id) for upsert behavior. stock_quantity can go negative (allowed, logged). last_bag_weight_kg tracks the weight of the last bag received. Auto-managed by RPC functions.", cols: "id (bigint PK), product_id (FK), location_id (FK), stock_quantity (numeric 14,3), last_bag_weight_kg (numeric 10,2), created_at" },
  { name: "sales", desc: "Core transactional table. Records every sale with customer, product, location, quantity, rate, rickshaw fare, cash received, and unit type (bags or kg). Supports transaction grouping (multiple items in one sale), mix orders (custom feed blends), and tracks the entering admin.", cols: "id, customer_id (FK), product_id (FK), location_id (FK), quantity, rate_per_bag, rickshaw_fare, cash_received, sale_date, unit_type (bags/kg), bag_weight_kg, mix_order_id (FK nullable), transaction_group_id (text), rickshaw_driver_name, entered_by, created_at" },
  { name: "mix_orders", desc: "Parent table for custom feed mix orders. Each mix order links to multiple sales rows (one per ingredient) via mix_order_id. Tracks target weight, cash received, and customer.", cols: "id (bigint PK), customer_id (FK), location_id (FK), order_date, target_weight_kg, cash_received, entered_by, created_at" },
  { name: "purchases", desc: "Records raw material purchases from suppliers. Supports goods settlement (settled_by_customer_id) where a customer provides goods in exchange for credit reduction. Tracks cash paid, and unit type. Auto-increments stock via RPC.", cols: "id, purchase_date, product_id (FK), quantity, rate_per_bag, supplier_id (FK nullable), settled_by_customer_id (FK nullable), cash_paid, location_id (FK), notes, entered_by, unit_type, bag_weight_kg, created_at" },
  { name: "expenses", desc: "Daily business expenses (labour, electricity, transport, etc.). Auto-creates cash_ledger 'out' entry via RPC. No category column exists (description field is used for categorization).", cols: "id, description, amount (numeric 14,2, >=0), expense_date, entered_by, created_at" },
  { name: "cash_accounts", desc: "Named cash holding accounts. Seeded with 'Cash In Hand' and 'Cash In Locker'. Cash balances are computed dynamically from cash_ledger entries (not stored as a field).", cols: "id (bigint PK), name (unique), created_at" },
  { name: "cash_ledger", desc: "Append-only cash transaction log. Every sale, purchase, expense, transfer, and balance correction creates ledger entries. Direction is 'in' (money received) or 'out' (money spent). Balances are computed as SUM(in) - SUM(out) per account.", cols: "id, entry_date, account_id (FK), direction (in/out), amount (numeric 14,2, >=0), source_type, source_id, description, entered_by, created_at" },
  { name: "cash_transfers", desc: "Records money movement between cash accounts (e.g., from 'Cash In Hand' to 'Cash In Locker'). Creates two ledger entries automatically via RPC.", cols: "id, transfer_date, from_account_id (FK), to_account_id (FK), amount (numeric >0), notes, entered_by, created_at" },
];

for (const t of tables) {
  body.push(h3(`Table: ${t.name}`));
  body.push(para(t.desc));
  body.push(paraBold("Columns:"));
  body.push(codeBlock(t.cols));
}

body.push(h2("3.2 Database Indexes"));
body.push(para("Strategic indexes exist on frequently queried columns to optimize performance. These include indexes on sale_date, customer_id, and mix_order_id in the sales table for dashboard queries, expense_date in expenses for daily filtering, purchase_date in purchases for purchase history, account_id + entry_date in cash_ledger for balance calculations, and email in app_customers for login lookups."));

body.push(h2("3.3 Row Level Security (RLS)"));
body.push(para("RLS is enabled on ALL 13 tables. The security model is as follows: Business tables (products, locations, customers, suppliers, product_stock, mix_orders, sales, expenses, purchases, cash_accounts, cash_ledger, cash_transfers) have ZERO policies for anon or aalhenticated roles. This means only the service-role key can access them. The app_customers table has two policies: 'app_customers admin read' and 'app_customers admin write', both requiring auth.role() = 'authenticated'. In practice, all data access goes through the server-side admin client which uses the service-role key, completely bypassing RLS. This design ensures that even if the anon key is exposed in the browser, no one can directly query business data."));

body.push(h2("3.4 Seed Data"));
body.push(para("Two locations are seeded: 'Farm' and 'Shop'. Two cash accounts are seeded: 'Cash In Hand' and 'Cash In Locker'. Eight products are seeded with default rates: Wheat Bran (Choker) at Rs. 2,200, Cotton Seed Cake (Khal Banola) at Rs. 5,800, Maize Gluten (Ghalla) at Rs. 4,600, Soya Bean Meal at Rs. 7,200, Canola Meal at Rs. 5,400, Rice Polish at Rs. 3,200, DCP (Dicalcium Phosphate) at Rs. 12,000, and Salt (Namak) at Rs. 800. All seed inserts are idempotent (only insert if tables are empty)."));

// ── 4. RPC FUNCTIONS ──
body.push(h1("4. Database RPC Functions (Atomic Operations)"));
body.push(para("All RPC (Remote Procedure Call) functions use SECURITY DEFINER and SET search_path = public, meaning they execute with the privileges of the function owner (typically the superuser/postgres role that created them). This allows them to bypass RLS when needed. They are designed as atomic operations that perform multiple database writes in a single transaction, ensuring data consistency."));

body.push(h2("4.1 Function: verify_customer_login(p_email, p_password)"));
body.push(para("Purpose: Securely authenticate a customer portal user without exposing the password hash. Takes an email and plain password, finds the customer row, and uses PostgreSQL's crypt() function to compare the bcrypt hash. Returns a TABLE with safe fields (id, name, email, subscription info, is_active) excluding the password. Returns NULL (empty result set) on any failure (user not found, wrong password). This is the ONLY function with a void-like return pattern (no explicit return type row, just returns query or nothing)."));

body.push(h2("4.2 Function: create_sale(p_items JSONB, ...)"));
body.push(para("Purpose: Atomically create a sale with stock decrement and cash ledger entry. Accepts a JSONB array of items, each with product_id, quantity, rate_per_bag, unit_type, and bag_weight_kg. For each item, it locks the product_stock row (FOR UPDATE), decrements stock quantity for bag-type items, and inserts a sales row. Rickshaw fare and cash received are applied only to the first item in the group. After all items are processed, a single cash_ledger 'in' entry is created for the total cash received to the 'Cash In Hand' account. Returns void. Falls back to direct non-atomic inserts if the RPC fails."));

body.push(h2("4.3 Function: record_purchase(...)"));
body.push(para("Purpose: Atomically record a purchase with stock increment and cash ledger entry. Inserts the purchase row, then for bag-type purchases, uses UPSERT on product_stock to increment stock_quantity (with ON CONFLICT handling for the unique product_id + location_id constraint). If not a goods settlement and cash was paid, creates a cash_ledger 'out' entry. Returns TABLE(id bigint). The original function returned a scalar bigint, which caused a Supabase client error ('cannot extract elements from a scalar'). This was fixed by changing to TABLE return type with explicit DROP FUNCTION before CREATE."));

body.push(h2("4.4 Function: record_expense(p_description, p_amount, p_expense_date, p_entered_by)"));
body.push(para("Purpose: Atomically record an expense and its corresponding cash outflow. Inserts the expense row, then creates a cash_ledger 'out' entry to the 'Cash In Hand' account with the expense's ID as source_id and description as the ledger description. Returns TABLE(id bigint). Same scalar-to-TABLE fix was applied as record_purchase."));

body.push(h2("4.5 Function: transfer_cash(p_from, p_to, p_amount, p_date, p_notes, p_entered_by)"));
body.push(para("Purpose: Atomically transfer money between cash accounts with triple-entry recording. Validates that from_account_id and to_account_id are different. Creates a cash_transfers record, then two cash_ledger entries: 'out' from the source account and 'in' to the destination account. Returns TABLE(id bigint)."));

body.push(h2("4.6 Function: correct_cash_balance(p_account_id, p_target, p_date, p_entered_by)"));
body.push(para("Purpose: Atomically correct a cash account balance to a target amount. Calculates the current balance by summing all ledger entries for the account (SUM of 'in' amounts minus SUM of 'out' amounts). Computes the difference needed. If the difference is zero, returns NULL (no correction needed). Otherwise, creates a single 'correction' ledger entry with direction 'in' (if target > current) or 'out' (if target < current). Returns TABLE(id bigint) or NULL."));

body.push(h2("4.7 Function: create_mix_order(p_customer_id, p_location_id, p_order_date, p_target_weight_kg, p_cash_received, p_entered_by, p_items JSONB)"));
body.push(para("Purpose: Atomically create a custom mix order with multiple sale lines. The items JSONB array contains product_id, quantity (in kg), and rate_per_kg. Inserts a mix_orders parent row, then iterates over items creating sales rows with unit_type='kg' and the mix_order_id reference. If cash was received, creates a cash_ledger 'in' entry. Returns TABLE(id bigint) with the mix order ID."));

body.push(h2("4.8 Function: decrement_stock_fallback(p_product_id, p_location_id, p_quantity)"));
body.push(para("Purpose: Non-atomic fallback for stock decrement when the main create_sale RPC fails. Uses INSERT ... ON CONFLICT DO NOTHING to ensure a product_stock row exists, then UPDATE to decrement. This is called from the client-side sale creation fallback path. Returns void."));

// ── 5. AUTHENTICATION & AUTHORIZATION ──
body.push(h1("5. Authentication & Authorization"));
body.push(h2("5.1 Admin Authentication"));
body.push(para("Admin authentication uses Supabase Auth (email/password). The login flow is: (1) User enters email and password on /admin/login page. (2) Client-side Supabase client calls supabase.auth.signInWithPassword(). (3) On success, Supabase sets session cookies automatically. (4) Middleware (src/middleware.ts) validates the session on every /admin/* request using supabase.auth.getUser(). (5) If no valid session, redirects to /admin/login. The admin user is a Supabase Auth user with an email/password created in the Supabase dashboard. There is only ONE admin user."));

body.push(h2("5.2 Customer Portal Authentication"));
body.push(para("Customer portal authentication is completely separate from admin auth and does NOT use Supabase Auth. It uses a custom cookie-based system: (1) Customer enters email and password on /customer/login. (2) POST /api/customer/auth verifies credentials server-side using bcrypt comparison in src/lib/customer-db.ts (verifyCustomerLogin). (3) On success, a JWT-like HMAC-SHA256 signed token is created containing {id, name, email, subscription_end, is_active}. (4) Token is stored in an httpOnly, secure, sameSite=lax cookie named 'customer_session' with 30-day max age. (5) Middleware validates this token on every /customer/* request using Web Crypto API (Edge-compatible). (6) Checks subscription status (active and not expired). The signing secret comes from CUSTOMER_TOKEN_SECRET env var (server-only, NOT NEXT_PUBLIC_)."));

body.push(h2("5.3 API Route Authorization"));
body.push(para("Every API route calls requireUser() or requireAdmin() from src/lib/auth/server-user.ts before processing any request. requireAdmin() creates a Supabase server client from cookies, calls getUser(), and returns {ok: true, user: {id, email}} or {ok: false, response: 401/503}. requireUser() tries admin first, then falls back to customer cookie verification. It returns {ok: true, type: 'admin' | 'customer', user: {...}} or {ok: false, response: 401}. Important: requireAdmin() returns ONLY {ok, user} with NO 'type' property. Previous code that accessed auth.type was a bug that has been fixed."));

body.push(h2("5.4 CSRF Protection"));
body.push(para("The middleware (src/middleware.ts) implements CSRF protection for all mutating requests (POST, PUT, PATCH, DELETE). It checks that the Origin or Referer header matches the request's Host header. If there's a mismatch, it returns a 403 error. Non-browser clients (curl, server-to-server) that omit both headers are allowed through. This prevents cross-site request forgery attacks from malicious websites."));

body.push(h2("5.5 Rate Limiting"));
body.push(para("Rate limiting is implemented using Upstash Redis (via @upstash/ratelimit). Two tiers exist: (1) Login rate limit: 5 attempts per minute per IP address (sliding window). Applied to both /api/auth/login (admin) and /api/customer/auth (customer). (2) General API rate limit: 60 requests per minute per IP. Available but not yet applied to all API routes. If Redis is not configured (missing KV_REST_API_URL or KV_REST_API_TOKEN env vars), rate limiting fails open (allows all requests) with a console warning in production. The IP is extracted from x-forwarded-for header (set by Vercel)."));

// ── 6. ALL API ROUTES ──
body.push(h1("6. API Routes (Complete Reference)"));
body.push(para("The application has 20+ API route files under src/app/api/. All routes use export const dynamic = 'force-dynamic' to prevent Next.js response caching. Every route validates authentication via requireUser() or requireAdmin(). All mutation routes (POST/PUT/DELETE) also pass through CSRF protection in the middleware. Error responses follow a consistent pattern: { error: string, detail?: string } with appropriate HTTP status codes."));

body.push(makeTable(
  ["Endpoint", "Methods", "Purpose", "Auth"],
  [
    ["/api/auth/login", "POST", "Admin email/password login via Supabase Auth", "Public (rate limited)"],
    ["/api/auth/logout", "POST", "Admin session sign-out", "Admin"],
    ["/api/customer/auth", "POST / DELETE", "Customer portal login (cookie set) / logout (cookie clear)", "Public (rate limited)"],
    ["/api/customer/me", "GET", "Get current customer's profile (from cookie)", "Customer cookie"],
    ["/api/customer/khata", "GET", "Customer-scoped khata (linked_customer_id filtered sales + balance)", "Customer cookie"],
    ["/api/purchases", "GET / POST / DELETE", "List purchases (with date filters) / Create purchase (RPC) / Delete purchase", "requireUser"],
    ["/api/stock", "GET / POST", "List all product stock / Upsert stock for product+location", "requireUser"],
    ["/api/sales", "GET / POST / DELETE", "List sales (with date/customer/group filters) / Create sale (RPC) / Delete by id/group/mix", "requireUser"],
    ["/api/mix-orders", "GET / POST / DELETE", "List mix orders with their sale lines / Create mix order (RPC) / Delete mix order", "requireUser"],
    ["/api/expenses", "GET / POST / DELETE", "List expenses (with date filters) / Create expense (RPC) / Delete expense", "requireUser"],
    ["/api/customers", "GET / POST / PUT / DELETE", "CRUD for business customers (credit/cash buyers)", "requireUser"],
    ["/api/suppliers", "GET / POST", "List suppliers / Create supplier", "requireUser"],
    ["/api/products", "GET / POST / PUT", "List products / Create product / Update product rate", "requireUser"],
    ["/api/locations", "GET", "List all locations (Farm, Shop)", "requireUser"],
    ["/api/cash/accounts", "GET / POST", "List cash accounts / Create new account", "requireUser"],
    ["/api/cash/balances", "GET", "Calculate running balances from ledger entries", "requireUser"],
    ["/api/cash/transfer", "GET / POST", "List transfers (with date filters) / Create transfer (RPC)", "requireUser"],
    ["/api/cash/correction", "POST", "Correct a cash account balance (RPC)", "requireUser"],
    ["/api/reports/dashboard", "GET", "Dashboard metrics (sales today, billed, cash, expenses, customers, outstanding)", "requireUser"],
    ["/api/reports/dashboard/details", "GET", "Dashboard drill-down: sales-today, billed-today, cash-collected, expenses-today, customers, outstanding, over-credit", "requireUser"],
    ["/api/reports/reconciliation", "GET", "Day reconciliation summary (bags sold, total billed, cash, expenses)", "requireUser"],
    ["/api/reports/reconciliation/details", "GET", "Reconciliation drill-down: bags-sold, total-billed, cash-received, credit/cash-customers, expenses", "requireUser"],
    ["/api/reports/customer-balance", "GET", "Single customer or all customer balance calculations (bill - paid - goods)", "requireUser"],
    ["/api/admin/customers", "GET / POST / PUT / DELETE", "Manage app_customers (subscription portal users) - admin only", "requireAdmin"],
    ["/api/debug/db-check", "GET", "Debug endpoint for database connectivity check", "requireUser"],
  ],
  [28, 15, 42, 15]
));

// ── 7. PAGE COMPONENTS ──
body.push(h1("7. Page Components & Features"));
body.push(para("The admin portal uses a single-page architecture with a dark sidebar (src/components/layout/sidebar.tsx) and dynamically loaded page components via next/dynamic with SSR disabled. The customer portal has its own separate sidebar and page routing. All pages are client components ('use client') that fetch data from API routes using the shared fetchCached() utility and Zustand stores."));

body.push(h2("7.1 Dashboard (dashboard.tsx)"));
body.push(para("The main overview page showing 7 clickable metric cards: Sales Today (transaction count), Billed Today (total amount), Cash Collected Today, Expenses Today, Total Customers, Total Outstanding/Khata, and Over Credit Limit Customers. Clicking any card expands a detail panel below showing a table of records for that metric. The dashboard uses PKT (Pakistan Standard Time) dates for accurate daily filtering. Includes Excel download button on detail tables using the xlsx library. Quick Action links at the bottom provide shortcuts to frequently used pages."));

body.push(h2("7.2 Daily Entry (daily-entry.tsx)"));
body.push(para("The primary data entry page with a tabbed interface: Sales Entry and Expense Entry. Sales entry supports multi-item cart with product/location/customer selection, quantity, rate, unit type (bags/kg), bag weight, rickshaw fare, and cash received. Items can be added to a cart, edited, and submitted as a grouped transaction. Expense entry has a simple form with description and amount. Both sections show today's records in collapsible tables with delete capability. Uses useCartStore (Zustand) for cart state management."));

body.push(h2("7.3 Purchases & Stock (purchases-stock.tsx)"));
body.push(para("A comprehensive page with two tabs: Purchases and Stock. The Purchases tab shows a form to record new purchases with product, supplier, customer (for goods settlement), quantity, rate, cash paid, location, unit type, and notes. Below the form is a filterable table of all purchases with date range filtering. A total purchase value is calculated and displayed. The Stock tab shows current stock levels grouped by location (Farm and Shop) with product names, quantities, and last bag weights. Both tabs support data refresh and show loading states. This page has the 'column reference id is ambiguous' bug (detailed in Section 9)."));

body.push(h2("7.4 Customer Khata (customer-khata.tsx)"));
body.push(para("Customer account/ledger page showing all customers with their balance calculations. Features include: customer dropdown selector, balance summary cards (Total Bill, Cash Paid, Goods Value, Balance Due) with number-to-words conversion, detailed transaction history table with sale date, product, quantity, rate, fare, amount, cash paid, and running balance. Includes PDF bill generation (generateCustomerBillPDF) and Excel download. Shows over-credit-limit warnings when balance exceeds Rs. 3,000,000. The balance calculation is: Balance Due = Total Bill - Total Cash Paid - Total Goods Settlement Value."));

body.push(h2("7.5 Day Reconciliation (day-reconciliation.tsx)"));
body.push(para("End-of-day financial reconciliation page. Shows 8 metric cards: Total Bags Sold, Total Billed, Cash Actually Received, From Credit Customers, From Cash Customers, Total Expenses, Cash In, and Cash Out. Each card is clickable and expands a detail table. Also shows an Expected Cash in Hand calculation (Cash Received - Expenses). Supports date range selection (defaults to today). Includes Excel download for all detail tables."));

body.push(h2("7.6 Cash Management (cash-management.tsx)"));
body.push(para("Multi-section cash management page. Sections include: (1) Cash Balances - shows current balance for each account (Cash In Hand, Cash In Locker) computed dynamically from ledger. (2) Cash Transfer - form to move money between accounts with date and notes. (3) Balance Correction - manually set an account's balance to a target amount (creates a correction ledger entry). (4) Transfer History - table of all past transfers with from/to account names and amounts."));

body.push(h2("7.7 Custom Mix Order (custom-mix-order.tsx)"));
body.push(para("Specialized page for creating custom cattle feed mix orders. The operator specifies a target weight, selects ingredients (products) with weight in kg and rate per kg, and assigns to a customer and location. The page shows real-time calculations: current weight vs target weight, total amount, and per-ingredient costs. On submission, creates a mix_orders parent row with multiple linked sales rows. Supports PDF bill generation with ingredient breakdown, total weight, and cash/change calculation. Shows past mix orders in a table."));

body.push(h2("7.8 Manage Products (manage-products.tsx)"));
body.push(para("Product catalog management page. Displays all products in a table with editable default rates. The operator can update rates inline and save changes. Includes a form to add new products with name and default rate. Shows stock levels alongside each product by joining with product_stock data. Supports activation/deactivation of products."));

body.push(h2("7.9 Admin Customer Management (admin-customer-mgmt.tsx)"));
body.push(para("Admin-only page (separate from main admin layout) for managing subscription portal customers. Accessible from /admin route (not the sidebar SPA). Two tabs: Customer Registration (create new portal customers with name, email, password, subscription type/dates) and Blocked/Expired Users (view and manage customer account status). Uses requireAdmin() for authorization."));

body.push(h2("7.10 Customer Portal Pages"));
body.push(para("The customer portal at /customer has its own layout with sidebar and dynamic page loading. Pages include: About (customer profile info), Dashboard (same component as admin but customer-scoped), Daily Entry, Custom Mix Order, Day Reconciliation, Cash Management, Customer Khata, Purchases & Stock, and Manage Products. The portal uses the customer cookie for authentication and fetches data from /api/customer/* endpoints. The customer can only see data linked to their account via linked_customer_id."));

// ── 8. STATE MANAGEMENT & DATA LAYER ──
body.push(h1("8. State Management & Data Layer Architecture"));

body.push(h2("8.1 Zustand Stores"));
body.push(para("Three Zustand stores manage client-side state: (1) useAppStore - stores the active page name (string) for SPA navigation, used by the sidebar to highlight the current page and by the main admin page to render the correct component. (2) useCartStore - manages the shopping cart for daily sales entry, with addItem, removeItem, clearCart, and getTotal methods. (3) useMixStore - manages custom mix order state including targetWeight, customerName, customerType, orderDate, locationId, ingredients array, with startOrder, addIngredient, removeIngredient, reset, getUsedWeight, and getTotalAmount methods."));

body.push(h2("8.2 Master Data Cache (fetchCached)"));
body.push(para("A module-level cache (not in Zustand) stores frequently accessed master data: products, locations, customers, suppliers, and stock. The fetchCached() function checks if cached data is less than 60 seconds old (CACHE_TTL). If stale or missing, it fetches from the API and updates the cache. On 401/403 errors, it throws (allowing pages to redirect). On 500 errors, it returns stale cache if available (graceful degradation). The invalidateCache() function can clear specific or all cache entries, called after mutations to ensure fresh data."));

body.push(h2("8.3 Data Access Layer"));
body.push(para("Ten data access modules under src/lib/data/ provide typed functions for database operations: purchases.ts (getPurchases, deletePurchase, recordPurchaseRPC with fallback), stock.ts (getAllStock, getStockForProduct, upsertStock), sales.ts (getSales, deleteSale, deleteSalesByGroup, deleteSalesByMixOrder, createSaleRPC with fallback), mix-orders.ts (getMixOrders, getMixOrderById, createMixOrderRPC with fallback, deleteMixOrder), cash.ts (getCashAccounts, createCashAccount, getCashBalances, getCashTransfers, transferCashRPC, correctBalanceRPC with fallbacks), reports.ts (getDashboardMetrics, getReconciliation, getCustomerBalance, getAllCustomerBalances), expenses.ts (getExpenses, deleteExpense, recordExpenseRPC with fallback), customers.ts (getAllCustomers, getCustomerById, createCustomer, updateCustomer, deleteCustomer), suppliers.ts (getAllSuppliers, createSupplier), products.ts (getAllProducts, getProductById, createProduct, updateProduct), and locations.ts (getAllLocations)."));

body.push(h2("8.4 RPC Fallback Pattern"));
body.push(para("All write operations (create sale, record purchase, record expense, transfer cash, correct balance, create mix order) follow a consistent pattern: (1) Try the atomic RPC function first via admin.rpc(). (2) If the RPC fails with 'does not exist', 'Could not find the function', or 'cannot extract elements from a scalar', fall back to a non-atomic direct insert. (3) The fallback performs individual database operations (insert, update) without transaction guarantees. (4) Cash ledger entries in the fallback are best-effort (caught errors are logged but don't fail the operation). This pattern ensures the app works even if RPC functions haven't been deployed to the database yet."));

// ── 9. KNOWN ISSUES & BUGS ──
body.push(h1("9. Known Issues, Bugs & Pending Fixes"));
body.push(para("This section documents all known issues in the project, categorized by severity. Some have been partially addressed but not yet resolved, while others are fully documented pending fixes."));

body.push(h2("9.1 CRITICAL: Column Reference 'id' is Ambiguous (UNRESOLVED)"));
body.push(para("The Purchases & Stock page displays an error: \"column reference 'id' is ambiguous.\" A previous fix attempt (commit abb8bdb) modified the data layer files (src/lib/data/purchases.ts and stock.ts) to use explicit column names instead of select('*') with joins. However, this fix DID NOT WORK when deployed to Vercel. The error likely originates from the mix-orders API route (src/app/api/mix-orders/route.ts line 23) which still uses select('*') with joins: .select('*, products(id,name), customers(id,name), locations(id,name)'). When mixing * with explicit column selections that include 'id', PostgreSQL cannot determine which table's 'id' is being referenced. The fix needs to replace this * with explicit column names, similar to what was done in the data layer files. Additionally, the dashboard details API route (src/app/api/reports/dashboard/details/route.ts) uses inline queries that may have similar ambiguous column issues."));

body.push(h2("9.2 'Failed to Load' Error on Shop Front Bags (UNRESOLVED)"));
body.push(para("Below the Shop Front Bags section on the Purchases & Stock page, a 'Failed to load' error message appears. This has not been investigated at all in previous sessions. The likely cause is a client-side fetch error that is being silently caught and displayed. The stock data is fetched from /api/stock which calls getAllStock() from src/lib/data/stock.ts. The error may be related to the same ambiguous column issue if stock queries also have join problems, or it could be a separate API timeout/authentication issue. Investigation requires reading the client-side error handling in purchases-stock.tsx."));

body.push(h2("9.3 Dashboard Empty Lists (UNRESOLVED)"));
body.push(para("The dashboard detail lists (Sales Today, Billed Today, Cash Collected, Expenses Today) show empty tables even when data exists. A previous fix removed references to 'expense_category' (a column that doesn't exist in the expenses table) from the dashboard details and reconciliation details API routes. However, the dashboard lists remain empty, suggesting additional silent failure points. Possible causes include: (1) Date mismatch between client and server (PKT vs UTC), (2) The dashboard metrics API returning zeros causing detail APIs to not be called, (3) API errors being silently caught in the client-side fetchDetails function."));

body.push(h2("9.4 RPC Scalar Return Type Error (PARTIALLY FIXED)"));
body.push(para("Several RPC functions (record_purchase, record_expense, transfer_cash, correct_cash_balance, create_mix_order) were originally defined with scalar return types (RETURNS bigint). The Supabase client cannot extract elements from a scalar return, causing the error: 'cannot extract elements from a scalar.' The fix is in supabase/all-rpc-functions.sql which: (1) DROPs the old functions with exact signature matching, (2) Recreates them with TABLE(id bigint) return type. The data layer code (purchases.ts, expenses.ts, cash.ts, mix-orders.ts) was also updated to handle both array and scalar return formats. However, the DROP FUNCTION statements must be run manually in the Supabase SQL Editor before the CREATE statements. If the old functions still exist in the database, the new ones cannot be created due to signature conflicts (PostgreSQL error 42P13)."));

body.push(h2("9.5 requireAdmin() Return Type Bug (FIXED)"));
body.push(para("requireAdmin() in src/lib/auth/server-user.ts returns { ok: true; user: { id, email } } with NO 'type' property. Previous code in several API routes accessed auth.type, which was undefined. This was fixed by either using hardcoded 'admin' string or removing the type access entirely. The correct approach for admin-only routes is to use requireAdmin(), and for dual-access routes to use requireUser() which does include the type field."));

body.push(h2("9.6 expenses Table Missing expense_category Column (FIXED)"));
body.push(para("The expenses table schema has columns: id, description, amount, expense_date, entered_by, created_at. There is NO expense_category column. Previous code in dashboard details and reconciliation details routes referenced this non-existent column, causing query failures. These references were removed. If category-based expense filtering is needed in the future, the column must be added to the database schema first."));

body.push(h2("9.7 Missing Features (PENDING)"));
body.push(para("Several features have been discussed but not yet implemented: (1) Download Excel button below total purchase value on Purchases & Stock page - the xlsx package is installed and the dashboard already has Excel download functionality that can be replicated. (2) Void columns on sales and purchases for cancelled transactions. (3) linked_customer_id column on app_customers to associate portal users with business customers for the customer portal khata feature (the API route already references this column but it may not exist in the database). (4) Duplicate supplier cleanup in the database. (5) Customer portal missing modules (several pages use the same admin components but customer-scoped data). (6) Past Mix Orders table showing empty. (7) Dashboard customers list showing 0 count."));

// ── 10. MIDDLEWARE & SECURITY ──
body.push(h1("10. Middleware & Security Configuration"));

body.push(h2("10.1 Next.js Middleware (src/middleware.ts)"));
body.push(para("The Edge middleware runs on every request (except static assets matching /_next, favicon, and image extensions). It handles three concerns: (1) CSRF Protection - for all POST/PUT/PATCH/DELETE requests to /api/*, validates that the Origin or Referer header matches the Host header. Returns 403 on mismatch. (2) Root Redirect - redirects / to /admin/login. (3) Admin Routes - /admin/login is always accessible; if already authenticated, redirects to /admin. All other /admin/* routes require a valid Supabase Auth session (getUser() check), redirecting to /admin/login if not authenticated. (4) Customer Routes - /customer/login is always accessible. All other /customer/* routes require a valid customer_session cookie with an active, non-expired subscription."));

body.push(h2("10.2 Security Headers (next.config.ts)"));
body.push(para("The following security headers are applied to all routes: Strict-Transport-Security (max-age=31536000, includeSubDomains, preload) for HTTPS enforcement. X-Frame-Options: DENY to prevent clickjacking. X-Content-Type-Options: nosniff to prevent MIME sniffing. Referrer-Policy: strict-origin-when-cross-origin. Permissions-Policy to disable camera, microphone, and geolocation APIs. Content-Security-Policy allowing scripts from self (with unsafe-inline and unsafe-eval for Next.js), styles from self and Google Fonts, fonts from self and gstatic, images from self/data/blob/https, connections to self and *.supabase.co (both https and wss), and frame-ancestors: none."));

body.push(h2("10.3 Environment Variables"));
body.push(para("The application requires these environment variables (set in Vercel dashboard): NEXT_PUBLIC_SUPABASE_URL - the Supabase project URL (https://hyylnlgmbujkoadfejjy.supabase.co). NEXT_PUBLIC_SUPABASE_KEY - the Supabase anon/public key for client-side auth. SUPABASE_SERVICE_ROLE_KEY - the Supabase service role key for server-side RLS-bypass operations. CUSTOMER_TOKEN_SECRET - server-only secret for signing customer session tokens (MUST NOT be prefixed with NEXT_PUBLIC_). KV_REST_API_URL and KV_REST_API_TOKEN - Upstash Redis credentials for rate limiting (optional - fails open if missing)."));

// ── 11. DEPLOYMENT ──
body.push(h1("11. Deployment Architecture"));

body.push(h2("11.1 Vercel Deployment"));
body.push(para("The application is deployed on Vercel and automatically builds from the GitHub repository Shahid-ALI12/Juniors_Project on the main branch. Every push to main triggers a new build and deployment. The latest deployed commit is abb8bdb. Vercel provides the production URL, automatic SSL certificates, edge function middleware execution, serverless function execution for API routes, and static asset optimization. The app uses export const dynamic = 'force-dynamic' on all API routes to prevent response caching, ensuring real-time data on every request."));

body.push(h2("11.2 Caddy Reverse Proxy (Local)"));
body.push(para("A Caddyfile exists for local deployment using Caddy as a reverse proxy. It listens on port 81 and supports a special XTransformPort query parameter for dynamic port forwarding. By default, it proxies all requests to localhost:3000 (the Next.js dev server). This is only used for local development/testing, not for production."));

body.push(h2("11.3 GitHub Repository"));
body.push(para("The code is hosted at https://github.com/Shahid-ALI12/Juniors_Project on the main branch. A GitHub Personal Access Token (PAT) is used for programmatic push operations. Each bug fix is intended to be a separate commit pushed individually to main, allowing for clear tracking of changes."));

// ── 12. DATA FLOW DIAGRAMS ──
body.push(h1("12. Key Data Flows"));

body.push(h2("12.1 Sale Creation Flow"));
body.push(para("1. Operator fills cart items on Daily Entry page (client-side Zustand store). 2. On submit, POST /api/sales is called with items array, customer_id, location_id, etc. 3. API route generates a unique transaction_group_id. 4. recordPurchaseRPC (or fallback) is called. 5. For each item: stock is decremented (bags only), a sales row is inserted. 6. Cash ledger 'in' entry is created if cash_received > 0. 7. Created sales are fetched and returned to the client. 8. Cache is invalidated to refresh dashboard and other pages."));

body.push(h2("12.2 Purchase Recording Flow"));
body.push(para("1. Operator fills purchase form on Purchases & Stock page. 2. POST /api/purchases is called with product, supplier, quantity, rate, etc. 3. recordPurchaseRPC (or fallback) is called. 4. Purchase row is inserted. 5. For bag-type purchases, product_stock is upserted (quantity incremented). 6. If not a goods settlement and cash was paid, cash_ledger 'out' entry is created. 7. The purchase ID is returned. 8. Cache is invalidated."));

body.push(h2("12.3 Customer Balance Calculation"));
body.push(para("Balance = Total Bill (sum of all quantity * rate_per_bag + rickshaw_fare for all sales) - Total Cash Paid (sum of all cash_received) - Total Goods Value (sum of quantity * rate_per_bag for all purchases where settled_by_customer_id matches). This calculation is performed in getCustomerBalance() and getAllCustomerBalances() in src/lib/data/reports.ts. The credit limit is Rs. 3,000,000 (hardcoded constant)."));

// ── 13. PDF BILL GENERATION ──
body.push(h1("13. PDF Bill Generation"));
body.push(para("Two PDF bill generators exist, both using jsPDF with jspdf-autotable for table rendering: (1) generateCustomerBillPDF (src/lib/generate-customer-bill.ts) - generates a customer ledger/bill showing customer details, complete transaction history table with date, product, quantity, rate, fare, amount, and cash paid columns, a summary box with balance due in both numbers and English words (Pakistani Lakh/Crore system), and a footer. (2) generateMixBillPDF (src/lib/generate-mix-bill.ts) - generates a custom mix order bill with order ID, customer details, ingredient breakdown table (product, weight kg, rate/kg, amount), total weight and amount summary, and cash received/change calculation for cash customers. Both use dynamic imports to avoid SSR crashes on Vercel (jsPDF requires browser APIs). The number-to-words conversion uses the Pakistani numbering system (Lakh, Crore) implemented in src/lib/number-to-words.ts."));

// ── 14. PROJECT HISTORY ──
body.push(h1("14. Project Evolution & Fixes Applied"));
body.push(para("The project originally shipped as a prototype/demo with ALL business pages using hardcoded mock data. No real database existed. The following major overhauls were performed (documented in Project_Analysis.md): (1) Complete database schema created in Supabase with 13 tables. (2) All 8 RPC functions written for atomic operations. (3) Every page migrated from mock data to real API + database. (4) Password hashing added (bcryptjs with 12 salt rounds) replacing plaintext storage. (5) Customer auth token signing fixed from public NEXT_PUBLIC_ secret to server-only CUSTOMER_TOKEN_SECRET. (6) Admin API route protection added via requireAdmin()/requireUser(). (7) RLS tightened - removed 'allow all' policies from all business tables. (8) Prisma (SQLite) completely removed in favor of Supabase Postgres. (9) Security headers added (HSTS, X-Frame-Options, CSP, etc.). (10) Conflicting Supabase client files cleaned up. (11) TypeScript strict mode enabled (ignoreBuildErrors removed)."));

// ── 15. FUTURE WORK ──
body.push(h1("15. Recommended Future Work"));
body.push(bullet("Fix the ambiguous column 'id' error on Purchases & Stock page by replacing select('*') with explicit columns in mix-orders API route and any other routes with joins"));
body.push(bullet("Investigate and fix 'Failed to load' error on Shop Front Bags section"));
body.push(bullet("Debug dashboard empty list issue - verify PKT date handling, check API error propagation"));
body.push(bullet("Run the DROP FUNCTION + CREATE FUNCTION SQL in Supabase SQL Editor for all RPC functions"));
body.push(bullet("Implement Download Excel button on Purchases & Stock page (xlsx package is available)"));
body.push(bullet("Add void/is_void columns to sales and purchases tables for cancellation support"));
body.push(bullet("Add linked_customer_id column to app_customers table (API already references it)"));
body.push(bullet("Clean duplicate suppliers in the database"));
body.push(bullet("Apply rate limiting to all API routes (currently only on login endpoints)"));
body.push(bullet("Add ESLint rules back gradually (currently most rules are disabled)"));
body.push(bullet("Write unit and integration tests (currently no test files exist)"));
body.push(bullet("Add README.md with setup, deployment, and development instructions"));
body.push(bullet("Fix Past Mix Orders table showing empty (likely data or query issue)"));
body.push(bullet("Fix Dashboard customers list showing 0 count"));
body.push(bullet("Complete customer portal modules with proper data scoping"));

// ── BODY SECTION CONFIG ──
const bodySection = {
  properties: {
    page: {
      size: { width: 11906, height: 16838 },
      margin: { top: 1440, bottom: 1440, left: 1701, right: 1417 },
      pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL },
    },
  },
  headers: {
    default: new Header({
      children: [
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [new TextRun({ text: "Danish Cattle Feed \u2014 Project Summary", size: 16, color: c(P.secondary), font: { name: "Calibri" }, italics: true })],
        }),
      ],
    }),
  },
  footers: {
    default: new Footer({
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: "Page ", size: 16, color: c(P.secondary), font: { name: "Calibri" } }),
            new TextRun({ children: ["PAGE \\* arabic \\* MERGEFORMAT"], size: 16, color: c(P.secondary), font: { name: "Calibri" } }),
            new TextRun({ text: " of [n]", size: 16, color: c(P.secondary), font: { name: "Calibri" } }),
          ],
        }),
      ],
    }),
  },
  children: body,
};

// ════════════════════════════════════════════════════════════════
// DOCUMENT ASSEMBLY
// ════════════════════════════════════════════════════════════════
const doc = new Document({
  styles: {
    default: {
      document: {
        run: {
          font: { name: "Times New Roman" },
          size: 22,
          color: c(P.body),
        },
        paragraph: {
          spacing: { line: 312 },
        },
      },
    },
  },
  sections: [coverSection, tocSection, bodySection],
});

const OUTPUT = "/home/z/my-project/download/Danish_Cattle_Feed_Project_Summary.docx";

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(OUTPUT, buf);
  console.log("Document generated:", OUTPUT);
});