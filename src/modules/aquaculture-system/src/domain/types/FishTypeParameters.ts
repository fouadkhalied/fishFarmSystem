export interface FeedingRateMatrix {
  weight_ranges: Array<{ min: number; max: number }>;
  temperatures: number[];
  rates: number[][]; // [weightRangeIndex][temperatureIndex]
}

export interface MealFrequencyRule {
  maxWeight: number | null; // null means "any weight above"
  mealsPerDay: number;
}

export interface FishTypeParameters {
  doMin: number;
  doSafe: number;
  phMin: number;
  phMax: number;
  nh3Safe: number;
  nh3Critical: number;
  no2Max: number;
  tempMin: number;
  tempMax: number;
  tempOptimal: number;
  fcrMin: number;
  fcrMax: number;
  survivalRate: number;
  feedingRateMatrix: FeedingRateMatrix;
  mealFrequencyRules: MealFrequencyRule[];
}
