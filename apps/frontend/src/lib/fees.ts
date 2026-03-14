export function getFeeBumpSatPerVByte(): number {
  return Number(localStorage.getItem('ors_fee_bump_sat_per_vbyte') ?? '0') || 0;
}
