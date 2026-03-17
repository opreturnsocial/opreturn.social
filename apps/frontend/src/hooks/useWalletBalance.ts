import { useState, useEffect, useRef, useCallback } from "react";
import { NWCClient } from "@getalby/sdk/nwc";

export function useWalletBalance(): [number | null | undefined, () => void] {
  const [balanceSats, setBalanceSats] = useState<number | null | undefined>(
    () => (localStorage.getItem("ors_nwc_url") ? null : undefined)
  );
  const clientRef = useRef<NWCClient | null>(null);

  useEffect(() => {
    const nwcUrl = localStorage.getItem("ors_nwc_url");
    if (!nwcUrl) return;

    const client = new NWCClient({ nostrWalletConnectUrl: nwcUrl });
    clientRef.current = client;

    async function fetchBalance() {
      try {
        const { balance } = await client.getBalance();
        // balance is in millisats
        setBalanceSats(Math.floor(balance / 1000));
      } catch {
        // ignore
      }
    }

    fetchBalance();
    const interval = setInterval(fetchBalance, 30_000);
    return () => {
      clearInterval(interval);
      client.close();
    };
  }, []);

  const refresh = useCallback(() => {
    const client = clientRef.current;
    if (!client) return;
    client.getBalance().then(({ balance }) => {
      setBalanceSats(Math.floor(balance / 1000));
    }).catch(() => {});
  }, []);

  return [balanceSats, refresh];
}
