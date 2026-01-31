
export class WaterQuality {
  private constructor(
    public readonly temperature: number, // °C
    public readonly dissolvedOxygen: number, // mg/L
    public readonly pH: number,
    public readonly totalAmmonia: number, // mg/L (TAN)
    public readonly nitrite: number, // mg/L
    public readonly measuredAt: Date
  ) {
    this.validate();
  }

  static create(params: {
    temperature: number;
    dissolvedOxygen: number;
    pH: number;
    totalAmmonia: number;
    nitrite: number;
    measuredAt?: Date;
  }): WaterQuality {
    return new WaterQuality(
      params.temperature,
      params.dissolvedOxygen,
      params.pH,
      params.totalAmmonia,
      params.nitrite,
      params.measuredAt || new Date()
    );
  }

  private validate(): void {
    if (this.temperature < 0 || this.temperature > 50) {
      throw new Error('Invalid temperature');
    }
    if (this.dissolvedOxygen < 0) {
      throw new Error('DO cannot be negative');
    }
    if (this.pH < 0 || this.pH > 14) {
      throw new Error('Invalid pH');
    }
  }

  // Calculate toxic ammonia (NH3)
  calculateToxicAmmonia(): number {
    const pKa = 0.09018 + (2729.92 / (this.temperature + 273));
    const nh3 = this.totalAmmonia / (1 + Math.pow(10, pKa - this.pH));
    return nh3;
  }

  equals(other: WaterQuality): boolean {
    return (
      this.temperature === other.temperature &&
      this.dissolvedOxygen === other.dissolvedOxygen &&
      this.pH === other.pH &&
      this.totalAmmonia === other.totalAmmonia &&
      this.nitrite === other.nitrite
    );
  }
}