export function getFeeBumpSatPerVByte(): number {
  return Number(localStorage.getItem('ors_fee_bump_sat_per_vbyte') ?? '0') || 0;
}

export type FeePriority = "high" | "medium";

export function getFeePriority(): FeePriority {
  return localStorage.getItem('ors_fee_priority') === 'high' ? 'high' : 'medium';
}

export function setFeePriority(p: FeePriority): void {
  localStorage.setItem('ors_fee_priority', p);
}
