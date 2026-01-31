class FarmId {
  constructor(private readonly value: string) {
    if (!value || value.trim().length === 0) {
      throw new Error('FarmId cannot be empty');
    }
  }

  toString(): string {
    return this.value;
  }

  equals(other: FarmId): boolean {
    return this.value === other.value;
  }
}

class Farm {
  private constructor(
    private readonly id: FarmId,
    private name: string,
    private location: string,
    private tanks: Map<string, Tank>,
    private createdAt: Date
  ) {}

  static create(params: {
    id: string;
    name: string;
    location: string;
  }): Farm {
    return new Farm(
      new FarmId(params.id),
      params.name,
      params.location,
      new Map(),
      new Date()
    );
  }

  // Getters
  getId(): FarmId {
    return this.id;
  }

  getName(): string {
    return this.name;
  }

  getLocation(): string {
    return this.location;
  }

  getTanks(): Tank[] {
    return Array.from(this.tanks.values());
  }

  getTank(tankId: string): Tank | null {
    return this.tanks.get(tankId) || null;
  }

  // Business Logic - Add Tank
  addTank(tank: Tank): void {
    if (this.tanks.has(tank.getId().toString())) {
      throw new Error('Tank already exists in farm');
    }
    this.tanks.set(tank.getId().toString(), tank);
  }

  // Business Logic - Remove Tank
  removeTank(tankId: string): void {
    const tank = this.tanks.get(tankId);
    if (!tank) {
      throw new Error('Tank not found in farm');
    }

    if (tank.getBatches().length > 0) {
      throw new Error('Cannot remove tank with active batches');
    }

    this.tanks.delete(tankId);
  }

  // Business Logic - Calculate Farm-Level Feeding
  calculateFarmDailyFeed(
    fishTypeParamsMap: Map<string, FishTypeParameters>
  ): FarmFeedingRequirement {
    const tankRequirements: TankFeedingRequirement[] = [];
    let totalFeed = Weight.fromGrams(0);
    let overallStatus: 'OK' | 'WARNING' | 'STOPPED' = 'OK';

    for (const tank of this.tanks.values()) {
      if (tank.getStatus() !== TankStatus.ACTIVE) continue;

      try {
        const tankReq = tank.calculateTotalDailyFeed(fishTypeParamsMap);
        tankRequirements.push(tankReq);

        totalFeed = Weight.fromGrams(
          totalFeed.toGrams() + tankReq.totalDailyFeed.toGrams()
        );

        // Update overall status
        if (tankReq.overallStatus === 'STOPPED') {
          overallStatus = 'STOPPED';
        } else if (
          tankReq.overallStatus === 'WARNING' &&
          overallStatus !== 'STOPPED'
        ) {
          overallStatus = 'WARNING';
        }
      } catch (error) {
        // Skip tanks without water quality data
        continue;
      }
    }

    return {
      farmId: this.id.toString(),
      totalDailyFeed: totalFeed,
      tankRequirements,
      overallStatus,
    };
  }

  // Business Logic - Get Farm Statistics
  getFarmStatistics(): FarmStatistics {
    let totalBiomass = Weight.fromGrams(0);
    let totalBatches = 0;
    let totalFish = 0;
    let activeTanks = 0;

    for (const tank of this.tanks.values()) {
      if (tank.getStatus() === TankStatus.ACTIVE) {
        activeTanks++;
        totalBiomass = Weight.fromGrams(
          totalBiomass.toGrams() + tank.getTotalBiomass().toGrams()
        );

        for (const batch of tank.getBatches()) {
          if (batch.isActive()) {
            totalBatches++;
            totalFish += batch.getCurrentStats().fishCount;
          }
        }
      }
    }

    return {
      totalTanks: this.tanks.size,
      activeTanks,
      totalBatches,
      totalFish,
      totalBiomass,
    };
  }

  // Business Logic - Update Farm Name
  updateName(newName: string): void {
    if (!newName || newName.trim().length === 0) {
      throw new Error('Farm name cannot be empty');
    }
    this.name = newName;
  }
}