import { WaterQuality } from '../value-objects/WaterQuality';
import { Weight } from '../value-objects/Weight';
import { BatchStatistics } from '../value-objects/BatchStatistics';
import { FishTypeParameters, FeedingRateMatrix, MealFrequencyRule } from '../types/FishTypeParameters';
import { FeedingRequirement, SafetyFactors } from '../types/FeedingTypes';

/**
 * Domain Service: Feeding Calculation
 * 
 * Responsibility: Calculate feed requirements based on fish parameters and water quality
 * This is a domain service because the logic doesn't belong to a single entity
 */
export class FeedingCalculationService {
  
  /**
   * Calculate daily feed requirement for a batch
   */
  calculateDailyFeed(
    biomass: Weight,
    averageWeight: Weight,
    waterQuality: WaterQuality,
    fishTypeParams: FishTypeParameters
  ): FeedingRequirement {
    
    // 1. Find base feeding rate from matrix
    const baseFeedingRate = this.findBaseFeedingRate(
      averageWeight.toGrams(),
      waterQuality.temperature,
      fishTypeParams.feedingRateMatrix
    );

    // 2. Calculate safety factors
    const factors = this.calculateSafetyFactors(
      waterQuality,
      fishTypeParams
    );

    // 3. Determine safety status
    const safetyStatus = this.determineSafetyStatus(factors);

    // 4. Calculate final feeding rate
    const finalRate = baseFeedingRate * factors.temperature * factors.oxygen * factors.ammonia;

    // 5. Calculate total daily feed
    const dailyFeedKg = biomass.toKilograms() * (finalRate / 100);
    const totalDailyFeed = Weight.fromKilograms(dailyFeedKg);

    // 6. Determine meals per day
    const mealsPerDay = this.determineMealsPerDay(
      averageWeight.toGrams(),
      fishTypeParams.mealFrequencyRules
    );

    // 7. Calculate feed per meal
    const feedPerMeal = Weight.fromGrams(totalDailyFeed.toGrams() / mealsPerDay);

    return {
      totalDailyFeed,
      feedPerMeal,
      mealsPerDay,
      safetyStatus,
      factors,
      baseFeedingRate,
      finalFeedingRate: finalRate,
    };
  }

  /**
   * Find base feeding rate from feeding matrix
   */
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
      // If weight is below minimum, use first range
      if (weightGrams < matrix.weight_ranges[0].min) {
        return matrix.rates[0][this.findClosestTemperatureIndex(temperature, matrix.temperatures)];
      }
      // If weight is above maximum, use last range
      const lastIndex = matrix.weight_ranges.length - 1;
      return matrix.rates[lastIndex][this.findClosestTemperatureIndex(temperature, matrix.temperatures)];
    }

    // Find closest temperature index
    const tempIndex = this.findClosestTemperatureIndex(temperature, matrix.temperatures);

    return matrix.rates[weightRangeIndex][tempIndex];
  }

  /**
   * Find closest temperature index in array
   */
  private findClosestTemperatureIndex(temperature: number, temperatures: number[]): number {
    return temperatures.reduce((prev, curr, idx) => {
      return Math.abs(curr - temperature) < Math.abs(temperatures[prev] - temperature)
        ? idx
        : prev;
    }, 0);
  }

  /**
   * Calculate all safety factors
   */
  calculateSafetyFactors(
    waterQuality: WaterQuality,
    fishTypeParams: FishTypeParameters
  ): SafetyFactors {
    return {
      temperature: this.calculateTemperatureFactor(
        waterQuality.temperature,
        fishTypeParams.tempOptimal
      ),
      oxygen: this.calculateOxygenFactor(
        waterQuality.dissolvedOxygen,
        fishTypeParams.doMin,
        fishTypeParams.doSafe
      ),
      ammonia: this.calculateAmmoniaFactor(
        waterQuality.calculateToxicAmmonia(),
        fishTypeParams.nh3Safe,
        fishTypeParams.nh3Critical
      ),
    };
  }

  /**
   * Calculate temperature correction factor
   */
  private calculateTemperatureFactor(currentTemp: number, optimalTemp: number): number {
    const tempDiff = currentTemp - optimalTemp;

    if (tempDiff < -3) return 0.75;
    if (tempDiff >= -3 && tempDiff < -1) return 0.85;
    if (tempDiff >= -1 && tempDiff <= 1) return 1.0;
    if (tempDiff > 1 && tempDiff <= 2) return 1.05;
    if (tempDiff > 2) return 0.95;

    return 1.0;
  }

  /**
   * Calculate dissolved oxygen factor
   */
  private calculateOxygenFactor(currentDO: number, minDO: number, safeDO: number): number {
    if (currentDO < minDO) return 0.0; // Critical - stop feeding
    if (currentDO < 4) return 0.75;
    if (currentDO < safeDO) return 0.9;
    return 1.0;
  }

  /**
   * Calculate ammonia toxicity factor
   */
  private calculateAmmoniaFactor(nh3: number, safeLimit: number, criticalLimit: number): number {
    if (nh3 > criticalLimit) return 0.0; // Critical - stop feeding
    if (nh3 > 0.05) return 0.5;
    if (nh3 > safeLimit) return 0.8;
    return 1.0;
  }

  /**
   * Determine meals per day based on fish weight
   */
  private determineMealsPerDay(weightGrams: number, rules: MealFrequencyRule[]): number {
    for (const rule of rules) {
      if (rule.maxWeight === null || weightGrams <= rule.maxWeight) {
        return rule.mealsPerDay;
      }
    }
    return 2; // Default fallback
  }

  /**
   * Determine overall safety status
   */
  private determineSafetyStatus(factors: SafetyFactors): 'OK' | 'WARNING' | 'STOPPED' {
    if (factors.oxygen === 0 || factors.ammonia === 0) {
      return 'STOPPED';
    }
    if (factors.oxygen < 1 || factors.ammonia < 1 || factors.temperature < 1) {
      return 'WARNING';
    }
    return 'OK';
  }

  /**
   * Calculate feed amount with safety checks across multiple parameters
   */
  calculateSafeFeedAmount(
    biomass: Weight,
    averageWeight: Weight,
    waterQuality: WaterQuality,
    fishTypeParams: FishTypeParameters
  ): Weight {
    const requirement = this.calculateDailyFeed(
      biomass,
      averageWeight,
      waterQuality,
      fishTypeParams
    );

    if (requirement.safetyStatus === 'STOPPED') {
      return Weight.fromGrams(0);
    }

    return requirement.totalDailyFeed;
  }
}
