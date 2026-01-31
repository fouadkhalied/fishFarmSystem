import { FeedingRecord, FeedingRequirement, SafetyFactors } from "../types/FeedingTypes";
import { FeedingRateMatrix, FishTypeParameters, MealFrequencyRule } from "../types/FishTypeParameters";
import { GrowthRecord } from "../types/GrowthTypes";
import { BatchStatistics } from "../value-objects/BatchStatistics";
import { WaterQuality } from "../value-objects/WaterQuality";
import { Weight } from "../value-objects/Weight";

export class FishBatchId {
  constructor(private readonly value: string) {
    if (!value || value.trim().length === 0) {
      throw new Error('FishBatchId cannot be empty');
    }
  }

  toString(): string {
    return this.value;
  }

  equals(other: FishBatchId): boolean {
    return this.value === other.value;
  }
}

export class FishBatch {
  private constructor(
    private readonly id: FishBatchId,
    private readonly fishTypeId: string,
    private readonly stockedDate: Date,
    private readonly initialCount: number,
    private readonly initialWeight: Weight,
    private currentStats: BatchStatistics,
    private growthHistory: GrowthRecord[],
    private feedingHistory: FeedingRecord[],
    private status: BatchStatus
  ) {}

  static create(params: {
    id: string;
    fishTypeId: string;
    fishCount: number;
    initialWeight: Weight;
    stockedDate?: Date;
  }): FishBatch {
    const batchId = new FishBatchId(params.id);
    const stats = BatchStatistics.create(params.fishCount, params.initialWeight);

    return new FishBatch(
      batchId,
      params.fishTypeId,
      params.stockedDate || new Date(),
      params.fishCount,
      params.initialWeight,
      stats,
      [],
      [],
      BatchStatus.ACTIVE
    );
  }

  // Getters
  getId(): FishBatchId {
    return this.id;
  }

  getFishTypeId(): string {
    return this.fishTypeId;
  }

  getCurrentStats(): BatchStatistics {
    return this.currentStats;
  }

  getStockedDate(): Date {
    return this.stockedDate;
  }

  getDaysInCulture(): number {
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - this.stockedDate.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  getStatus(): BatchStatus {
    return this.status;
  }

  isActive(): boolean {
    return this.status === BatchStatus.ACTIVE;
  }

  // Business Logic - Growth Recording
  recordGrowth(newAverageWeight: Weight): void {
    if (!this.isActive()) {
      throw new Error('Cannot record growth for inactive batch');
    }

    const daysInCulture = this.getDaysInCulture();
    const weightGainGrams =
      newAverageWeight.toGrams() - this.currentStats.averageWeight.toGrams();

    // Calculate SGR (Specific Growth Rate)
    const sgr =
      ((Math.log(newAverageWeight.toGrams()) -
        Math.log(this.initialWeight.toGrams())) /
        daysInCulture) *
      100;

    // Calculate ADG (Average Daily Gain)
    const adg = weightGainGrams / daysInCulture;

    const growthRecord: GrowthRecord = {
      recordedAt: new Date(),
      statistics: this.currentStats.updateWeight(newAverageWeight),
      weightGain: Weight.fromGrams(weightGainGrams),
      daysInCulture,
      sgr,
      adg,
    };

    this.currentStats = this.currentStats.updateWeight(newAverageWeight);
    this.growthHistory.push(growthRecord);
  }

  // Business Logic - Mortality Recording
  recordMortality(deadCount: number): void {
    if (!this.isActive()) {
      throw new Error('Cannot record mortality for inactive batch');
    }

    if (deadCount > this.currentStats.fishCount) {
      throw new Error('Dead count exceeds current fish count');
    }

    this.currentStats = this.currentStats.recordMortality(
      deadCount,
      this.initialCount
    );
  }

  // Business Logic - Feeding
  recordFeeding(feedAmount: Weight, mealsPerDay: number, waterQuality: WaterQuality): void {
    if (!this.isActive()) {
      throw new Error('Cannot feed inactive batch');
    }

    const record: FeedingRecord = {
      feedAmount,
      mealsPerDay,
      feedDate: new Date(),
      waterQuality,
    };

    this.feedingHistory.push(record);
  }

  // Business Logic - Calculate Feed Requirements
  calculateDailyFeed(
    waterQuality: WaterQuality,
    fishTypeParams: FishTypeParameters
  ): FeedingRequirement {
    if (!this.isActive()) {
      return {
        totalDailyFeed: Weight.fromGrams(0),
        feedPerMeal: Weight.fromGrams(0),
        mealsPerDay: 0,
        safetyStatus: 'STOPPED',
        factors: { temperature: 0, oxygen: 0, ammonia: 0 },
      };
    }

    const biomass = this.currentStats.getTotalBiomass();
    const avgWeightGrams = this.currentStats.averageWeight.toGrams();

    // Find base feeding rate from matrix
    const baseFeedingRate = this.findBaseFeedingRate(
      avgWeightGrams,
      waterQuality.temperature,
      fishTypeParams.feedingRateMatrix
    );

    // Calculate safety factors
    const factors = this.calculateSafetyFactors(
      waterQuality,
      fishTypeParams
    );

    // Determine safety status
    let safetyStatus: 'OK' | 'WARNING' | 'STOPPED' = 'OK';
    if (factors.oxygen === 0 || factors.ammonia === 0) {
      safetyStatus = 'STOPPED';
    } else if (factors.oxygen < 1 || factors.ammonia < 1 || factors.temperature < 1) {
      safetyStatus = 'WARNING';
    }

    // Calculate final feeding rate
    const finalRate =
      baseFeedingRate *
      factors.temperature *
      factors.oxygen *
      factors.ammonia;

    // Calculate total daily feed
    const dailyFeedKg = biomass.toKilograms() * (finalRate / 100);
    const totalDailyFeed = Weight.fromKilograms(dailyFeedKg);

    // Determine meals per day
    const mealsPerDay = this.determineMealsPerDay(
      avgWeightGrams,
      fishTypeParams.mealFrequencyRules
    );

    // Calculate feed per meal
    const feedPerMeal = Weight.fromGrams(
      totalDailyFeed.toGrams() / mealsPerDay
    );

    return {
      totalDailyFeed,
      feedPerMeal,
      mealsPerDay,
      safetyStatus,
      factors,
    };
  }

  private findBaseFeedingRate(
    weightGrams: number,
    temperature: number,
    matrix: FeedingRateMatrix
  ): number {
    // Find weight range index
    const weightRangeIndex = matrix.weight_ranges.findIndex(
      (range) => weightGrams >= range.min && weightGrams <= range.max
    );

    if (weightRangeIndex === -1) {
      throw new Error(`No feeding rate found for weight: ${weightGrams}g`);
    }

    // Find temperature index (closest match)
    const tempIndex = matrix.temperatures.reduce((prev, curr, idx) => {
      return Math.abs(curr - temperature) < Math.abs(matrix.temperatures[prev] - temperature)
        ? idx
        : prev;
    }, 0);

    return matrix.rates[weightRangeIndex][tempIndex];
  }

  private calculateSafetyFactors(
    waterQuality: WaterQuality,
    fishTypeParams: FishTypeParameters
  ): SafetyFactors {
    // Temperature Factor
    let tf = 1.0;
    const tempDiff = waterQuality.temperature - fishTypeParams.tempOptimal;
    if (tempDiff < -3) tf = 0.75;
    else if (tempDiff >= -3 && tempDiff < -1) tf = 0.85;
    else if (tempDiff > 1 && tempDiff <= 2) tf = 1.05;
    else if (tempDiff > 2) tf = 0.95;

    // Oxygen Factor
    let df = 1.0;
    if (waterQuality.dissolvedOxygen < fishTypeParams.doMin) df = 0.0;
    else if (waterQuality.dissolvedOxygen < 4) df = 0.75;
    else if (waterQuality.dissolvedOxygen < fishTypeParams.doSafe) df = 0.9;

    // Ammonia Factor
    const nh3 = waterQuality.calculateToxicAmmonia();
    let af = 1.0;
    if (nh3 > fishTypeParams.nh3Critical) af = 0.0;
    else if (nh3 > 0.05) af = 0.5;
    else if (nh3 > fishTypeParams.nh3Safe) af = 0.8;

    return {
      temperature: tf,
      oxygen: df,
      ammonia: af,
    };
  }

  private determineMealsPerDay(
    weightGrams: number,
    rules: MealFrequencyRule[]
  ): number {
    for (const rule of rules) {
      if (rule.maxWeight === null || weightGrams <= rule.maxWeight) {
        return rule.mealsPerDay;
      }
    }
    return 2; // default
  }

  // Business Logic - Harvest
  harvest(): void {
    if (!this.isActive()) {
      throw new Error('Batch is not active');
    }
    this.status = BatchStatus.HARVESTED;
  }

  // Calculate Performance Metrics
  calculateFCR(totalFeedConsumed: Weight): number {
    const totalWeightGain =
      this.currentStats.getTotalBiomass().toKilograms() -
      this.initialWeight.toKilograms() * this.initialCount;

    return totalFeedConsumed.toKilograms() / totalWeightGain;
  }

  getLatestGrowthRecord(): GrowthRecord | null {
    return this.growthHistory.length > 0
      ? this.growthHistory[this.growthHistory.length - 1]
      : null;
  }

  getGrowthHistory(): readonly GrowthRecord[] {
    return this.growthHistory;
  }

  getFeedingHistory(): readonly FeedingRecord[] {
    return this.feedingHistory;
  }
}