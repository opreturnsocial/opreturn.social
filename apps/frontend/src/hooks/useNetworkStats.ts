import { useState, useEffect } from "react";
import { FACILITATOR_BASE_URL } from "../api/facilitator";

interface NetworkStats {
  feeRateHigh: number | null;
  feeRateMedium: number | null;
  feeMarkupPercent: number;
  blockHeight: number | null;
  btcPriceUsd: number | null;
}

export function useNetworkStats(): NetworkStats {
  const [stats, setStats] = useState<NetworkStats>({
    feeRateHigh: null,
    feeRateMedium: null,
    feeMarkupPercent: 10,
    blockHeight: null,
    btcPriceUsd: null,
  });

  async function fetchStats() {
    try {
      const [feesRes, heightRes, priceRes] = await Promise.all([
        fetch(`${FACILITATOR_BASE_URL}/fee-rate`),
        fetch("https://mempool.space/api/blocks/tip/height"),
        fetch("https://mempool.space/api/v1/prices"),
      ]);
      const fees = await feesRes.json();
      const height = await heightRes.json();
      const price = await priceRes.json();
      setStats({
        feeRateHigh: fees.high?.satPerVByte ?? null,
        feeRateMedium: fees.medium?.satPerVByte ?? null,
        feeMarkupPercent: fees.feeMarkupPercent ?? 10,
        blockHeight: typeof height === "number" ? height : null,
        btcPriceUsd: price.USD ?? null,
      });
    } catch {
      // silently ignore
    }
  }

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 60_000);
    return () => clearInterval(interval);
  }, []);

  return stats;
}
