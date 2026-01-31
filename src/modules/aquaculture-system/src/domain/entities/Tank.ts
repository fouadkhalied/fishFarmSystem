import { BatchFeedingRequirement, TankFeedingRequirement } from "../types/FeedingTypes";
import { FishTypeParameters } from "../types/FishTypeParameters";
import { WaterQuality } from "../value-objects/WaterQuality";
import { Weight } from "../value-objects/Weight";
import { FishBatch } from "./FishBatch";

class TankId {
  constructor(private readonly value: string) {
    if (!value || value.trim().length === 0) {
      throw new Error('TankId cannot be empty');
    }
  }

  toString(): string {
    return this.value;
  }

  equals(other: TankId): boolean {
    return this.value === other.value;
  }
}

class Tank {
  private constructor(
    private readonly id: TankId,
    private name: string,
    private readonly volume: Volume,
    private batches: Map<string, FishBatch>,
    private waterQuality: WaterQuality | null,
    private status: TankStatus
  ) {}

  static create(params: {
    id: string;
    name: string;
    volume: Volume;
    status?: TankStatus;
  }): Tank {
    return new Tank(
      new TankId(params.id),
      params.name,
      params.volume,
      new Map(),
      null,
      params.status || TankStatus.EMPTY
    );
  }

  // Getters
  getId(): TankId {
    return this.id;
  }

  getName(): string {
    return this.name;
  }

  getVolume(): Volume {
    return this.volume;
  }

  getWaterQuality(): WaterQuality | null {
    return this.waterQuality;
  }

  getStatus(): TankStatus {
    return this.status;
  }

  getBatches(): FishBatch[] {
    return Array.from(this.batches.values());
  }

  getBatch(batchId: string): FishBatch | null {
    return this.batches.get(batchId) || null;
  }

  // Business Logic - Add Batch
  addBatch(batch: FishBatch): void {
    if (this.status !== TankStatus.ACTIVE) {
      throw new Error('Cannot add batch to inactive tank');
    }

    if (this.batches.has(batch.getId().toString())) {
      throw new Error('Batch already exists in tank');
    }

    this.batches.set(batch.getId().toString(), batch);

    if (this.status === TankStatus.EMPTY) {
      this.status = TankStatus.ACTIVE;
    }
  }

  // Business Logic - Remove Batch
  removeBatch(batchId: string): void {
    if (!this.batches.has(batchId)) {
      throw new Error('Batch not found in tank');
    }

    this.batches.delete(batchId);

    if (this.batches.size === 0) {
      this.status = TankStatus.EMPTY;
    }
  }

  // Business Logic - Update Water Quality
  updateWaterQuality(waterQuality: WaterQuality): void {
    this.waterQuality = waterQuality;
  }

  // Business Logic - Calculate Total Tank Feeding
  calculateTotalDailyFeed(
    fishTypeParamsMap: Map<string, FishTypeParameters>
  ): TankFeedingRequirement {
    if (!this.waterQuality) {
      throw new Error('Water quality not available for tank');
    }

    const batchRequirements: BatchFeedingRequirement[] = [];
    let totalFeed = Weight.fromGrams(0);
    let overallStatus: 'OK' | 'WARNING' | 'STOPPED' = 'OK';

    for (const batch of this.batches.values()) {
      if (!batch.isActive()) continue;

      const fishTypeParams = fishTypeParamsMap.get(batch.getFishTypeId());
      if (!fishTypeParams) {
        throw new Error(`Fish type parameters not found: ${batch.getFishTypeId()}`);
      }

      const requirement = batch.calculateDailyFeed(
        this.waterQuality,
        fishTypeParams
      );

      batchRequirements.push({
        batchId: batch.getId().toString(),
        requirement,
      });

      totalFeed = Weight.fromGrams(
        totalFeed.toGrams() + requirement.totalDailyFeed.toGrams()
      );

      // Update overall status
      if (requirement.safetyStatus === 'STOPPED') {
        overallStatus = 'STOPPED';
      } else if (
        requirement.safetyStatus === 'WARNING' &&
        overallStatus !== 'STOPPED'
      ) {
        overallStatus = 'WARNING';
      }
    }

    return {
      tankId: this.id.toString(),
      totalDailyFeed: totalFeed,
      batchRequirements,
      overallStatus,
      waterQuality: this.waterQuality,
    };
  }

  // Business Logic - Calculate Total Biomass
  getTotalBiomass(): Weight {
    let totalGrams = 0;
    for (const batch of this.batches.values()) {
      totalGrams += batch.getCurrentStats().getTotalBiomass().toGrams();
    }
    return Weight.fromGrams(totalGrams);
  }

  // Business Logic - Calculate Stocking Density
  getStockingDensity(): number {
    // kg/m³
    return this.getTotalBiomass().toKilograms() / this.volume.toCubicMeters();
  }

  // Business Logic - Set Maintenance Mode
  setMaintenance(): void {
    if (this.batches.size > 0) {
      throw new Error('Cannot set maintenance mode while tank has batches');
    }
    this.status = TankStatus.MAINTENANCE;
  }

  activate(): void {
    if (this.status === TankStatus.INACTIVE) {
      throw new Error('Cannot activate inactive tank');
    }
    this.status = this.batches.size === 0 ? TankStatus.EMPTY : TankStatus.ACTIVE;
  }
}