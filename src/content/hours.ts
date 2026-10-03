/**
 * Roman hours for 11 May 113 (docs/CONTENT.md §0.3, GDD §14.7): schedules are authored in Roman
 * hours and compiled to clock hours. h1…h12 start the twelve daylight hours (sunrise 04:54, one
 * hora = 71 min); v1…v4 start the four night watches (v1 = sunset 19:06, v3 = midnight).
 */
export const ROMAN_HOURS = {
  h1: 4.9, h2: 6.08, h3: 7.27, h4: 8.45, h5: 9.63, h6: 10.82, h7: 12.0, h8: 13.18, h9: 14.37, h10: 15.55, h11: 16.73, h12: 17.92,
  v1: 19.1, v2: 21.55, v3: 0, v4: 2.45,
} as const;

export type RomanHour = keyof typeof ROMAN_HOURS;

/** Clock hour of a Roman-hour mark, optionally `half` an hour later ('h1+0.5'). */
export function at(mark: RomanHour, plus = 0): number {
  return +(((ROMAN_HOURS[mark] + plus) % 24 + 24) % 24).toFixed(2);
}

/** True from mark `from` until mark `to` (wrapping past midnight). */
export function between(hour: number, from: RomanHour, to: RomanHour): boolean {
  const a = ROMAN_HOURS[from];
  const b = ROMAN_HOURS[to];
  return a <= b ? hour >= a && hour < b : hour >= a || hour < b;
}
