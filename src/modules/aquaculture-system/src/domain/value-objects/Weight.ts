export class Weight {
  private constructor(private readonly grams: number) {
    if (grams < 0) throw new Error('Weight cannot be negative');
  }

  static fromGrams(grams: number): Weight {
    return new Weight(grams);
  }

  static fromKilograms(kg: number): Weight {
    return new Weight(kg * 1000);
  }

  toGrams(): number {
    return this.grams;
  }

  toKilograms(): number {
    return this.grams / 1000;
  }

  equals(other: Weight): boolean {
    return this.grams === other.grams;
  }
}