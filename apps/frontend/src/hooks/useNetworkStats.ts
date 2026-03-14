import { useState, useEffect } from "react";
import { FACILITATOR_BASE_URL } from "../api/facilitator";

interface NetworkStats {
  feeRate: number | null;
  blockHeight: number | null;
  btcPriceUsd: number | null;
}

export function useNetworkStats(): NetworkStats {
  const [stats, setStats] = useState<NetworkStats>({
    feeRate: null,
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
        feeRate: fees.satPerVByte ?? null,
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
