import { BatchStatistics } from "../value-objects/BatchStatistics";
import { Weight } from "../value-objects/Weight";

export interface GrowthRecord {
  recordedAt: Date;
  statistics: BatchStatistics;
  weightGain: Weight;
  daysInCulture: number;
  sgr: number; // Specific Growth Rate
  adg: number; // Average Daily Gain
}