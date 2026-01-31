
class Volume {
  private constructor(private readonly cubicMeters: number) {
    if (cubicMeters <= 0) throw new Error('Volume must be positive');
  }

  static fromCubicMeters(m3: number): Volume {
    return new Volume(m3);
  }

  static fromLiters(liters: number): Volume {
    return new Volume(liters / 1000);
  }

  toCubicMeters(): number {
    return this.cubicMeters;
  }

  toLiters(): number {
    return this.cubicMeters * 1000;
  }

  equals(other: Volume): boolean {
    return this.cubicMeters === other.cubicMeters;
  }
}