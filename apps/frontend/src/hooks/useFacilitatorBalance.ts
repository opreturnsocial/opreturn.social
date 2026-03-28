import { useState, useEffect } from "react";
import { getFacilitatorWalletBalance } from "@/api/facilitator";

interface FacilitatorBalance {
  mainnetSatoshis: number | null;
  freeNetworkSatoshis: number | null;
  loading: boolean;
}

export function useFacilitatorBalance(): FacilitatorBalance {
  const [state, setState] = useState<FacilitatorBalance>({
    mainnetSatoshis: null,
    freeNetworkSatoshis: null,
    loading: false,
  });

  useEffect(() => {
    setState((s) => ({ ...s, loading: true }));
    getFacilitatorWalletBalance()
      .then((data) => setState({ ...data, loading: false }))
      .catch(() =>
        setState({ mainnetSatoshis: null, freeNetworkSatoshis: null, loading: false }),
      );
  }, []);

  return state;
}
