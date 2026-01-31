
import { WaterQuality } from '../value-objects/WaterQuality';
import { FishTypeParameters } from '../types/FishTypeParameters';
import { WaterQualityAssessment, WaterQualityStatus, WaterQualityAlert } from '../types/WaterQualityTypes';

/**
 * Domain Service: Water Quality Assessment
 * 
 * Responsibility: Assess water quality and generate alerts
 */
export class WaterQualityAssessmentService {

  /**
   * Perform comprehensive water quality assessment
   */
  assessWaterQuality(
    waterQuality: WaterQuality,
    fishTypeParams: FishTypeParameters
  ): WaterQualityAssessment {
    
    const alerts: WaterQualityAlert[] = [];
    let overallStatus: WaterQualityStatus = 'OPTIMAL';

    // Assess each parameter
    const doStatus = this.assessDissolvedOxygen(waterQuality.dissolvedOxygen, fishTypeParams, alerts);
    const phStatus = this.assessPH(waterQuality.pH, fishTypeParams, alerts);
    const nh3Status = this.assessAmmonia(waterQuality, fishTypeParams, alerts);
    const no2Status = this.assessNitrite(waterQuality.nitrite, fishTypeParams, alerts);
    const tempStatus = this.assessTemperature(waterQuality.temperature, fishTypeParams, alerts);

    // Determine overall status (worst case)
    const statuses = [doStatus, phStatus, nh3Status, no2Status, tempStatus];
    overallStatus = this.determineOverallStatus(statuses);

    return {
      status: overallStatus,
      alerts,
      parameters: {
        dissolvedOxygen: { value: waterQuality.dissolvedOxygen, status: doStatus },
        pH: { value: waterQuality.pH, status: phStatus },
        ammonia: { value: waterQuality.calculateToxicAmmonia(), status: nh3Status },
        nitrite: { value: waterQuality.nitrite, status: no2Status },
        temperature: { value: waterQuality.temperature, status: tempStatus },
      },
      assessedAt: waterQuality.measuredAt,
      actionRequired: overallStatus === 'CRITICAL' || overallStatus === 'WARNING',
    };
  }

  /**
   * Assess Dissolved Oxygen
   */
  private assessDissolvedOxygen(
    do_value: number,
    fishParams: FishTypeParameters,
    alerts: WaterQualityAlert[]
  ): WaterQualityStatus {
    
    if (do_value < fishParams.doMin) {
      alerts.push({
        parameter: 'Dissolved Oxygen',
        severity: 'CRITICAL',
        message: `DO critically low (${do_value} mg/L). Immediate aeration required!`,
        currentValue: do_value,
        threshold: fishParams.doMin,
        action: 'Start aerators immediately and reduce feeding to zero',
      });
      return 'CRITICAL';
    }

    if (do_value < fishParams.doSafe) {
      alerts.push({
        parameter: 'Dissolved Oxygen',
        severity: 'WARNING',
        message: `DO below safe level (${do_value} mg/L)`,
        currentValue: do_value,
        threshold: fishParams.doSafe,
        action: 'Increase aeration and reduce feeding by 25%',
      });
      return 'WARNING';
    }

    if (do_value < fishParams.doSafe + 1) {
      return 'ACCEPTABLE';
    }

    return 'OPTIMAL';
  }

  /**
   * Assess pH
   */
  private assessPH(
    ph: number,
    fishParams: FishTypeParameters,
    alerts: WaterQualityAlert[]
  ): WaterQualityStatus {
    
    if (ph < fishParams.phMin || ph > fishParams.phMax) {
      alerts.push({
        parameter: 'pH',
        severity: 'CRITICAL',
        message: `pH out of range (${ph})`,
        currentValue: ph,
        threshold: `${fishParams.phMin}-${fishParams.phMax}`,
        action: ph < fishParams.phMin 
          ? 'Add lime to raise pH' 
          : 'Partial water change to lower pH',
      });
      return 'CRITICAL';
    }

    const optimalMin = 7.0;
    const optimalMax = 8.5;

    if (ph < optimalMin || ph > optimalMax) {
      alerts.push({
        parameter: 'pH',
        severity: 'WARNING',
        message: `pH suboptimal (${ph})`,
        currentValue: ph,
        threshold: `${optimalMin}-${optimalMax}`,
        action: 'Monitor closely and prepare corrective measures',
      });
      return 'WARNING';
    }

    return 'OPTIMAL';
  }

  /**
   * Assess Ammonia (NH3)
   */
  private assessAmmonia(
    waterQuality: WaterQuality,
    fishParams: FishTypeParameters,
    alerts: WaterQualityAlert[]
  ): WaterQualityStatus {
    
    const nh3 = waterQuality.calculateToxicAmmonia();

    if (nh3 > fishParams.nh3Critical) {
      alerts.push({
        parameter: 'Toxic Ammonia (NH3)',
        severity: 'CRITICAL',
        message: `Toxic ammonia critically high (${nh3.toFixed(4)} mg/L)`,
        currentValue: nh3,
        threshold: fishParams.nh3Critical,
        action: 'Stop feeding immediately and change 30-50% of water',
      });
      return 'CRITICAL';
    }

    if (nh3 > fishParams.nh3Safe) {
      alerts.push({
        parameter: 'Toxic Ammonia (NH3)',
        severity: 'WARNING',
        message: `Toxic ammonia elevated (${nh3.toFixed(4)} mg/L)`,
        currentValue: nh3,
        threshold: fishParams.nh3Safe,
        action: 'Reduce feeding by 50% and prepare for water change',
      });
      return 'WARNING';
    }

    if (nh3 > fishParams.nh3Safe * 0.5) {
      return 'ACCEPTABLE';
    }

    return 'OPTIMAL';
  }

  /**
   * Assess Nitrite
   */
  private assessNitrite(
    no2: number,
    fishParams: FishTypeParameters,
    alerts: WaterQualityAlert[]
  ): WaterQualityStatus {
    
    if (no2 > fishParams.no2Max) {
      alerts.push({
        parameter: 'Nitrite (NO2)',
        severity: 'WARNING',
        message: `Nitrite elevated (${no2} mg/L)`,
        currentValue: no2,
        threshold: fishParams.no2Max,
        action: 'Add salt (1-2 ppt) and increase aeration',
      });
      return 'WARNING';
    }

    if (no2 > fishParams.no2Max * 0.5) {
      return 'ACCEPTABLE';
    }

    return 'OPTIMAL';
  }

  /**
   * Assess Temperature
   */
  private assessTemperature(
    temp: number,
    fishParams: FishTypeParameters,
    alerts: WaterQualityAlert[]
  ): WaterQualityStatus {
    
    if (temp < fishParams.tempMin || temp > fishParams.tempMax) {
      alerts.push({
        parameter: 'Temperature',
        severity: 'CRITICAL',
        message: `Temperature out of tolerance range (${temp}°C)`,
        currentValue: temp,
        threshold: `${fishParams.tempMin}-${fishParams.tempMax}°C`,
        action: temp < fishParams.tempMin 
          ? 'Fish under thermal stress - reduce feeding' 
          : 'Increase water exchange or add shade',
      });
      return 'CRITICAL';
    }

    const tempDiff = Math.abs(temp - fishParams.tempOptimal);

    if (tempDiff > 4) {
      alerts.push({
        parameter: 'Temperature',
        severity: 'WARNING',
        message: `Temperature suboptimal (${temp}°C)`,
        currentValue: temp,
        threshold: `${fishParams.tempOptimal}°C (optimal)`,
        action: 'Adjust feeding rate based on temperature',
      });
      return 'WARNING';
    }

    if (tempDiff > 2) {
      return 'ACCEPTABLE';
    }

    return 'OPTIMAL';
  }

  /**
   * Determine overall status from individual statuses
   */
  private determineOverallStatus(statuses: WaterQualityStatus[]): WaterQualityStatus {
    if (statuses.includes('CRITICAL')) return 'CRITICAL';
    if (statuses.includes('WARNING')) return 'WARNING';
    if (statuses.includes('ACCEPTABLE')) return 'ACCEPTABLE';
    return 'OPTIMAL';
  }

  /**
   * Calculate water exchange rate needed
   * Based on CO2 estimation formula from PDF
   */
  calculateWaterExchangeRate(
    waterQuality: WaterQuality,
    tankVolume: number, // cubic meters
    currentBiomass: number // kg
  ): number {
    // Simplified calculation based on ammonia levels
    const nh3 = waterQuality.calculateToxicAmmonia();
    
    if (nh3 > 0.1) {
      return tankVolume * 0.5; // 50% water change
    } else if (nh3 > 0.05) {
      return tankVolume * 0.3; // 30% water change
    } else if (nh3 > 0.02) {
      return tankVolume * 0.2; // 20% water change
    }
    
    // Routine maintenance exchange
    return tankVolume * 0.1; // 10% water change
  }
}