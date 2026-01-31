import { Weight } from "./Weight";

export class BatchStatistics {
  private constructor(
    public readonly fishCount: number,
    public readonly averageWeight: Weight,
    public readonly survivalRate: number // percentage (0-100)
  ) {
    if (fishCount < 0) throw new Error('Fish count cannot be negative');
    if (survivalRate < 0 || survivalRate > 100) {
      throw new Error('Survival rate must be between 0 and 100');
    }
  }

  static create(
    fishCount: number,
    averageWeight: Weight,
    survivalRate: number = 100
  ): BatchStatistics {
    return new BatchStatistics(fishCount, averageWeight, survivalRate);
  }

  getTotalBiomass(): Weight {
    const totalGrams = this.fishCount * this.averageWeight.toGrams();
    return Weight.fromGrams(totalGrams);
  }

  updateWeight(newAverageWeight: Weight): BatchStatistics {
    return new BatchStatistics(
      this.fishCount,
      newAverageWeight,
      this.survivalRate
    );
  }

  recordMortality(deadCount: number, initialCount: number): BatchStatistics {
    const newCount = this.fishCount - deadCount;
    const newSurvivalRate = (newCount / initialCount) * 100;
    return new BatchStatistics(
      newCount,
      this.averageWeight,
      newSurvivalRate
    );
  }

  equals(other: BatchStatistics): boolean {
    return (
      this.fishCount === other.fishCount &&
      this.averageWeight.equals(other.averageWeight) &&
      this.survivalRate === other.survivalRate
    );
  }
}
