import { admin } from "@/lib/supabase/server-admin";

export interface LocationRow {
  id: number;
  name: string;
  created_at: string;
}

/**
 * Fetch all locations (e.g. Shop, Farmhouse).
 * Used by the LocationSelect component.
 */
export async function getAllLocations(): Promise<LocationRow[]> {
  const { data, error } = await admin
    .from("locations")
    .select("id, name, created_at")
    .order("id", { ascending: true });
  if (error) throw error;
  return (data || []) as unknown as LocationRow[];
}

/**
 * Default location ID (Shop = 2).
 *
 * Project-wide policy: Shop is the default location shown across
 * the app (stock view, daily sale, mix order, sale flow). The
 * Farmhouse (id=1) is the secondary location.
 *
 * Used as fallback when no location is explicitly selected.
 */
export const DEFAULT_LOCATION_ID = 2;

/**
 * Find a location by name (case-insensitive).
 */
export async function getLocationByName(name: string): Promise<LocationRow | null> {
  const { data, error } = await admin
    .from("locations")
    .select("id, name, created_at")
    .ilike("name", name)
    .limit(1)
    .single();
  if (error) return null;
  return data as unknown as LocationRow;
}
