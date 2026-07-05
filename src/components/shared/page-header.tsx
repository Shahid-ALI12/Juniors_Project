"use client";

import { cn } from "@/lib/utils";

export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between mb-6 gap-2">
      <div>
        <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 leading-tight">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
      </div>
    </div>
  );
}

export function MetricCard({
  label,
  value,
  color = "blue",
  prefix = "",
  suffix = "",
}: {
  label: string;
  value: string | number;
  color?: "blue" | "purple" | "green" | "orange";
  prefix?: string;
  suffix?: string;
}) {
  const colorMap = {
    blue: "border-t-blue-600 text-blue-600",
    purple: "border-t-purple-600 text-purple-600",
    green: "border-t-green-600 text-green-600",
    orange: "border-t-orange-600 text-orange-600",
  };
  return (
    <div className="bg-white rounded-2xl p-5 border border-slate-100 border-t-[3px] shadow-sm">
      <div className={cn("text-xs font-bold uppercase tracking-wider", colorMap[color].split(" ")[1])}>
        {label}
      </div>
      <div className={cn("text-2xl font-extrabold text-slate-900 mt-1", colorMap[color].split(" ")[1])}>
        {prefix}{value}{suffix}
      </div>
    </div>
  );
}