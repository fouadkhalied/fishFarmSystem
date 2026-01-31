import { Weight } from '../value-objects/Weight';
import { GrowthMetrics, GrowthPerformance } from '../types/GrowthTypes';
import { FishTypeParameters } from '../types/FishTypeParameters';

/**
 * Domain Service: Growth Analysis
 * 
 * Responsibility: Calculate and analyze fish growth metrics
 */
export class GrowthAnalysisService {

  /**
   * Calculate Specific Growth Rate (SGR)
   * SGR = [(ln(Final Weight) - ln(Initial Weight)) / Days] × 100
   */
  calculateSGR(initialWeight: Weight, finalWeight: Weight, days: number): number {
    if (days <= 0) {
      throw new Error('Days must be greater than 0');
    }

    const lnFinal = Math.log(finalWeight.toGrams());
    const lnInitial = Math.log(initialWeight.toGrams());

    return ((lnFinal - lnInitial) / days) * 100;
  }

  /**
   * Calculate Average Daily Gain (ADG)
   * ADG = (Final Weight - Initial Weight) / Days
   */
  calculateADG(initialWeight: Weight, finalWeight: Weight, days: number): number {
    if (days <= 0) {
      throw new Error('Days must be greater than 0');
    }

    const gainGrams = finalWeight.toGrams() - initialWeight.toGrams();
    return gainGrams / days;
  }

  /**
   * Calculate Weight Gain
   */
  calculateWeightGain(initialWeight: Weight, finalWeight: Weight): Weight {
    const gainGrams = finalWeight.toGrams() - initialWeight.toGrams();
    return Weight.fromGrams(gainGrams);
  }

  /**
   * Calculate Feed Conversion Ratio (FCR)
   * FCR = Total Feed Consumed / Total Weight Gain
   */
  calculateFCR(totalFeedConsumed: Weight, totalWeightGain: Weight): number {
    const gainKg = totalWeightGain.toKilograms();
    
    if (gainKg <= 0) {
      throw new Error('Weight gain must be greater than 0');
    }

    return totalFeedConsumed.toKilograms() / gainKg;
  }

  /**
   * Calculate Protein Efficiency Ratio (PER)
   * PER = Weight Gain / Protein Consumed
   */
  calculatePER(weightGain: Weight, proteinConsumed: Weight): number {
    const proteinKg = proteinConsumed.toKilograms();
    
    if (proteinKg <= 0) {
      throw new Error('Protein consumed must be greater than 0');
    }

    return weightGain.toKilograms() / proteinKg;
  }

  /**
   * Calculate Feed Efficiency (FE)
   * FE = (Weight Gain / Feed Consumed) × 100
   */
  calculateFeedEfficiency(weightGain: Weight, feedConsumed: Weight): number {
    const feedKg = feedConsumed.toKilograms();
    
    if (feedKg <= 0) {
      throw new Error('Feed consumed must be greater than 0');
    }

    return (weightGain.toKilograms() / feedKg) * 100;
  }

  /**
   * Calculate Condition Factor (K-Factor)
   * K = (Weight / Length³) × 100
   */
  calculateConditionFactor(weight: Weight, lengthCm: number): number {
    if (lengthCm <= 0) {
      throw new Error('Length must be greater than 0');
    }

    return (weight.toGrams() / Math.pow(lengthCm, 3)) * 100;
  }

  /**
   * Calculate complete growth metrics
   */
  calculateGrowthMetrics(
    initialWeight: Weight,
    currentWeight: Weight,
    days: number,
    totalFeedConsumed: Weight,
    proteinPercentage: number
  ): GrowthMetrics {
    
    const weightGain = this.calculateWeightGain(initialWeight, currentWeight);
    const sgr = this.calculateSGR(initialWeight, currentWeight, days);
    const adg = this.calculateADG(initialWeight, currentWeight, days);
    const fcr = this.calculateFCR(totalFeedConsumed, weightGain);
    
    const proteinConsumed = Weight.fromKilograms(
      totalFeedConsumed.toKilograms() * (proteinPercentage / 100)
    );
    const per = this.calculatePER(weightGain, proteinConsumed);
    const fe = this.calculateFeedEfficiency(weightGain, totalFeedConsumed);

    return {
      weightGain,
      sgr,
      adg,
      fcr,
      per,
      feedEfficiency: fe,
      daysInCulture: days,
    };
  }

  /**
   * Evaluate growth performance against benchmarks
   */
  evaluatePerformance(
    metrics: GrowthMetrics,
    fishTypeParams: FishTypeParameters
  ): GrowthPerformance {
    
    // Evaluate FCR
    let fcrRating: 'EXCELLENT' | 'GOOD' | 'ACCEPTABLE' | 'POOR';
    if (metrics.fcr < fishTypeParams.fcrMin) {
      fcrRating = 'EXCELLENT';
    } else if (metrics.fcr <= fishTypeParams.fcrMax) {
      fcrRating = 'GOOD';
    } else if (metrics.fcr <= fishTypeParams.fcrMax * 1.2) {
      fcrRating = 'ACCEPTABLE';
    } else {
      fcrRating = 'POOR';
    }

    // Evaluate SGR (assuming benchmarks exist)
    const sgrRating = this.evaluateSGR(metrics.sgr);

    // Overall assessment
    const overallRating = this.determineOverallRating(fcrRating, sgrRating);

    return {
      fcrRating,
      sgrRating,
      overallRating,
      metrics,
      recommendations: this.generateRecommendations(fcrRating, sgrRating, metrics),
    };
  }

  /**
   * Evaluate SGR performance
   */
  private evaluateSGR(sgr: number): 'EXCELLENT' | 'GOOD' | 'ACCEPTABLE' | 'POOR' {
    // These thresholds can be customized per fish type
    if (sgr > 3.0) return 'EXCELLENT';
    if (sgr > 2.0) return 'GOOD';
    if (sgr > 1.0) return 'ACCEPTABLE';
    return 'POOR';
  }

  /**
   * Determine overall rating
   */
  private determineOverallRating(
    fcrRating: string,
    sgrRating: string
  ): 'EXCELLENT' | 'GOOD' | 'ACCEPTABLE' | 'POOR' {
    const ratings = { 'EXCELLENT': 4, 'GOOD': 3, 'ACCEPTABLE': 2, 'POOR': 1 };
    const average = (ratings[fcrRating] + ratings[sgrRating]) / 2;

    if (average >= 3.5) return 'EXCELLENT';
    if (average >= 2.5) return 'GOOD';
    if (average >= 1.5) return 'ACCEPTABLE';
    return 'POOR';
  }

  /**
   * Generate performance recommendations
   */
  private generateRecommendations(
    fcrRating: string,
    sgrRating: string,
    metrics: GrowthMetrics
  ): string[] {
    const recommendations: string[] = [];

    if (fcrRating === 'POOR') {
      recommendations.push('Review feed quality and protein content');
      recommendations.push('Check for disease or stress factors');
      recommendations.push('Verify feeding schedule adherence');
    }

    if (sgrRating === 'POOR') {
      recommendations.push('Optimize water temperature');
      recommendations.push('Increase feeding frequency for small fish');
      recommendations.push('Check for overcrowding');
    }

    if (metrics.fcr > 2.5) {
      recommendations.push('Consider reducing feeding rate by 10-15%');
    }

    if (metrics.sgr < 1.0) {
      recommendations.push('Investigate potential growth inhibitors');
    }

    if (recommendations.length === 0) {
      recommendations.push('Performance is on target - maintain current protocol');
    }

    return recommendations;
  }
}