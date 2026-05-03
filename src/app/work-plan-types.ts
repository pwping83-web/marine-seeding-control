export interface WorkEntry {
  id: string;
  date: string;
  zone: string;
  targetSeeds: number;
  vessel: string;
  status: "scheduled" | "completed" | "weather-hold" | "cancelled";
  actual?: number;
  note?: string;
}
