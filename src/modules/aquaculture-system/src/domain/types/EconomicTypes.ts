import { Weight } from "../value-objects/Weight";

export interface FarmStatistics {
  totalTanks: number;
  activeTanks: number;
  totalBatches: number;
  totalFish: number;
  totalBiomass: Weight;
}
