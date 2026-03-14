import { useState, useEffect } from "react";

export function useNostr() {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    // window.nostr may be injected asynchronously by the extension
    const check = () => setAvailable(typeof window.nostr !== "undefined");
    check();
    // Re-check after a short delay in case extension loads late
    const timer = setTimeout(check, 500);
    return () => clearTimeout(timer);
  }, []);

  return { available };
}
