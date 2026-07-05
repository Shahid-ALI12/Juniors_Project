import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Customer Portal — Danish Cattle Feed",
  description: "Customer portal for Danish Cattle Feed subscription management.",
};

export default function CustomerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}