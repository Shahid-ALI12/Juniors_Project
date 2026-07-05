import { admin } from "@/lib/supabase/server-admin";

export interface LocationRow {
  id: number;
  name: string;
  created_at: string;
}

export async function getAllLocations(): Promise<LocationRow[]> {
  const { data, error } = await admin.from("locations").select("*").order("name");
  if (error) throw error;
  return (data || []) as LocationRow[];
}
