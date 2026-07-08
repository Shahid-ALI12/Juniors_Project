"use client";

import * as React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Location } from "@/types";

interface LocationSelectProps {
  value: number | null;
  onChange: (locationId: number) => void;
  className?: string;
  /** Show an "All Locations" option (value = 0) — useful for list filters */
  showAllOption?: boolean;
  /** Disable the select */
  disabled?: boolean;
}

/**
 * Reusable location selector (Farmhouse / Shop).
 * Fetches locations from /api/locations on mount.
 *
 * Usage:
 *   <LocationSelect value={locId} onChange={setLocId} />
 *   <LocationSelect value={locId} onChange={setLocId} showAllOption />
 */
export function LocationSelect({
  value,
  onChange,
  className,
  showAllOption = false,
  disabled = false,
}: LocationSelectProps) {
  const [locations, setLocations] = React.useState<Location[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch("/api/locations", { cache: "no-store" });
        if (!res.ok) throw new Error("Failed to load locations");
        const data = await res.json();
        if (mounted && Array.isArray(data.locations)) {
          setLocations(data.locations);
          // If no value set, default to first location (Farmhouse id=1)
          if (!value && data.locations.length > 0) {
            onChange(data.locations[0].id);
          }
        }
      } catch (err) {
        console.error("LocationSelect: failed to load locations", err);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  if (loading) {
    return (
      <Select disabled>
        <SelectTrigger className={className} size="sm">
          <SelectValue placeholder="Loading..." />
        </SelectTrigger>
      </Select>
    );
  }

  return (
    <Select
      value={value ? String(value) : undefined}
      onValueChange={(v) => onChange(Number(v))}
      disabled={disabled}
    >
      <SelectTrigger className={className} size="sm">
        <SelectValue placeholder="Select location" />
      </SelectTrigger>
      <SelectContent>
        {showAllOption && <SelectItem value="0">All Locations</SelectItem>}
        {locations.map((loc) => (
          <SelectItem key={loc.id} value={String(loc.id)}>
            {loc.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
