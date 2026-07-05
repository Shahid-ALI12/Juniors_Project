import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin Portal — Danish Cattle Feed",
  description: "Admin dashboard for Danish Cattle Feed daily register management.",
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}