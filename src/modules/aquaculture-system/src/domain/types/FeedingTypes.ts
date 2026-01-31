import { WaterQuality } from "../value-objects/WaterQuality";
import { Weight } from "../value-objects/Weight";

export interface SafetyFactors {
  temperature: number;
  oxygen: number;
  ammonia: number;
}

export interface FeedingRecord {
  feedAmount: Weight;
  mealsPerDay: number;
  feedDate: Date;
  waterQuality: WaterQuality;
}

export interface FeedingRequirement {
  totalDailyFeed: Weight;
  feedPerMeal: Weight;
  mealsPerDay: number;
  safetyStatus: 'OK' | 'WARNING' | 'STOPPED';
  factors: SafetyFactors;
}

export interface BatchFeedingRequirement {
  batchId: string;
  requirement: FeedingRequirement;
}

export interface TankFeedingRequirement {
  tankId: string;
  totalDailyFeed: Weight;
  batchRequirements: BatchFeedingRequirement[];
  overallStatus: 'OK' | 'WARNING' | 'STOPPED';
  waterQuality: WaterQuality;
}

export interface FarmFeedingRequirement {
  farmId: string;
  totalDailyFeed: Weight;
  tankRequirements: TankFeedingRequirement[];
  overallStatus: 'OK' | 'WARNING' | 'STOPPED';
}
