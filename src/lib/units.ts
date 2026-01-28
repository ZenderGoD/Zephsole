/**
 * Footwear measurement conversion utilities.
 * Canonical unit is millimeters (mm).
 */

export const CONVERSION_RATES = {
  mm_to_inch: 0.0393701,
  inch_to_mm: 25.4,
  cm_to_mm: 10,
  mm_to_cm: 0.1,
};

export type UnitSystem = 'mm' | 'us' | 'eu' | 'cm' | 'inch';

/**
 * Converts mm to target unit for display.
 */
export function formatMeasurement(mm: number, targetUnit: UnitSystem): string {
  switch (targetUnit) {
    case 'inch':
      return `${(mm * CONVERSION_RATES.mm_to_inch).toFixed(2)}"`;
    case 'cm':
      return `${(mm * CONVERSION_RATES.mm_to_cm).toFixed(1)} cm`;
    case 'us':
      // Simplified US men's shoe size mapping (just for display logic example)
      // Size 9 is approx 262mm
      const usSize = (mm - 180) / 8.46 + 1; 
      return `US ${Math.round(usSize * 2) / 2}`;
    case 'eu':
      // Simplified EU shoe size mapping
      const euSize = mm / 6.67 + 2;
      return `EU ${Math.round(euSize)}`;
    case 'mm':
    default:
      return `${Math.round(mm)} mm`;
  }
}

/**
 * Normalizes input to mm.
 */
export function toCanonical(value: number, sourceUnit: UnitSystem): number {
  switch (sourceUnit) {
    case 'inch':
      return value * CONVERSION_RATES.inch_to_mm;
    case 'cm':
      return value * CONVERSION_RATES.cm_to_mm;
    case 'mm':
    default:
      return value;
  }
}

export const SIZE_RUNS = {
  US_MENS: [7, 7.5, 8, 8.5, 9, 9.5, 10, 10.5, 11, 11.5, 12, 13],
  US_WOMENS: [5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10],
  EU: [38, 39, 40, 41, 42, 43, 44, 45, 46, 47],
};

export const WIDTH_PROFILES = ['B (Narrow)', 'D (Standard)', '2E (Wide)', '4E (Extra Wide)'];
