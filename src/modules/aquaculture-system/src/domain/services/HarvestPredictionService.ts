
import { Weight } from '../value-objects/Weight';
import { BatchStatistics } from '../value-objects/BatchStatistics';
import { HarvestPrediction, HarvestEconomics } from '../types/HarvestTypes';

/**
 * Domain Service: Harvest Prediction
 * 
 * Responsibility: Predict harvest timing and economics
 */
export class HarvestPredictionService {

  /**
   * Predict future weight based on SGR
   * Future Weight = Current Weight × e^(SGR × Days / 100)
   */
  predictFutureWeight(
    currentWeight: Weight,
    sgr: number,
    daysAhead: number
  ): Weight {
    const futureWeightGrams = 
      currentWeight.toGrams() * Math.exp((sgr * daysAhead) / 100);
    
    return Weight.fromGrams(futureWeightGrams);
  }

  /**
   * Calculate days to reach target weight
   * Days = [ln(Target Weight) - ln(Current Weight)] / (SGR / 100)
   */
  calculateDaysToTarget(
    currentWeight: Weight,
    targetWeight: Weight,
    sgr: number
  ): number {
    if (sgr <= 0) {
      throw new Error('SGR must be greater than 0');
    }

    const lnTarget = Math.log(targetWeight.toGrams());
    const lnCurrent = Math.log(currentWeight.toGrams());
    
    const days = (lnTarget - lnCurrent) / (sgr / 100);
    
    return Math.ceil(days);
  }

  /**
   * Predict harvest date
   */
  predictHarvestDate(
    currentWeight: Weight,
    targetWeight: Weight,
    sgr: number,
    currentDate: Date = new Date()
  ): Date {
    const daysRemaining = this.calculateDaysToTarget(currentWeight, targetWeight, sgr);
    
    const harvestDate = new Date(currentDate);
    harvestDate.setDate(harvestDate.getDate() + daysRemaining);
    
    return harvestDate;
  }

  /**
   * Calculate complete harvest prediction
   */
  predictHarvest(
    currentStats: BatchStatistics,
    targetWeight: Weight,
    sgr: number,
    survivalRate: number,
    initialCount: number,
    currentDate: Date = new Date()
  ): HarvestPrediction {
    
    // Calculate days to harvest
    const daysToHarvest = this.calculateDaysToTarget(
      currentStats.averageWeight,
      targetWeight,
      sgr
    );

    // Predict harvest date
    const harvestDate = this.predictHarvestDate(
      currentStats.averageWeight,
      targetWeight,
      sgr,
      currentDate
    );

    // Calculate expected final count
    const expectedFinalCount = Math.floor(
      currentStats.fishCount * (survivalRate / 100)
    );

    // Calculate final production
    const finalProduction = Weight.fromKilograms(
      targetWeight.toKilograms() * expectedFinalCount
    );

    return {
      harvestDate,
      daysToHarvest,
      targetWeight,
      expectedFinalCount,
      finalProduction,
      currentSGR: sgr,
      projectedSurvivalRate: survivalRate,
    };
  }

  /**
   * Calculate harvest economics
   */
  calculateHarvestEconomics(
    prediction: HarvestPrediction,
    averageDailyFeed: Weight,
    feedPricePerKg: number,
    marketPricePerKg: number,
    otherCosts: number = 0
  ): HarvestEconomics {
    
    // Calculate remaining feed needed
    const remainingFeed = Weight.fromKilograms(
      averageDailyFeed.toKilograms() * prediction.daysToHarvest
    );

    // Calculate feed cost
    const remainingFeedCost = remainingFeed.toKilograms() * feedPricePerKg;
    
    // Calculate total remaining costs
    const totalRemainingCosts = remainingFeedCost + otherCosts;

    // Calculate revenue
    const projectedRevenue = 
      prediction.finalProduction.toKilograms() * marketPricePerKg;

    // Calculate gross profit (excluding sunk costs)
    const grossProfit = projectedRevenue - totalRemainingCosts;

    // Calculate profit margin
    const profitMargin = (grossProfit / projectedRevenue) * 100;

    // Calculate break-even production
    const breakEvenProduction = totalRemainingCosts / marketPricePerKg;

    return {
      remainingFeed,
      remainingFeedCost,
      totalRemainingCosts,
      projectedRevenue,
      grossProfit,
      profitMargin,
      breakEvenProduction,
      marketPricePerKg,
      feedPricePerKg,
    };
  }

  /**
   * Determine optimal harvest timing
   * Considers economics and biological factors
   */
  determineOptimalHarvestTiming(
    currentWeight: Weight,
    targetWeights: Weight[], // Array of possible market weights
    sgr: number,
    currentStats: BatchStatistics,
    feedPricePerKg: number,
    marketPrices: number[], // Corresponding market prices
    averageDailyFeed: Weight
  ): {
    optimalWeight: Weight;
    optimalDate: Date;
    reason: string;
    economics: HarvestEconomics;
  } {
    
    let bestOption = {
      weight: targetWeights[0],
      profit: -Infinity,
      index: 0,
    };

    // Evaluate each target weight option
    for (let i = 0; i < targetWeights.length; i++) {
      const prediction = this.predictHarvest(
        currentStats,
        targetWeights[i],
        sgr,
        currentStats.survivalRate,
        currentStats.fishCount
      );

      const economics = this.calculateHarvestEconomics(
        prediction,
        averageDailyFeed,
        feedPricePerKg,
        marketPrices[i]
      );

      if (economics.grossProfit > bestOption.profit) {
        bestOption = {
          weight: targetWeights[i],
          profit: economics.grossProfit,
          index: i,
        };
      }
    }

    const optimalPrediction = this.predictHarvest(
      currentStats,
      bestOption.weight,
      sgr,
      currentStats.survivalRate,
      currentStats.fishCount
    );

    const optimalEconomics = this.calculateHarvestEconomics(
      optimalPrediction,
      averageDailyFeed,
      feedPricePerKg,
      marketPrices[bestOption.index]
    );

    return {
      optimalWeight: bestOption.weight,
      optimalDate: optimalPrediction.harvestDate,
      reason: `Maximizes profit at ${bestOption.weight.toGrams()}g with ${optimalEconomics.profitMargin.toFixed(1)}% margin`,
      economics: optimalEconomics,
    };
  }
}
