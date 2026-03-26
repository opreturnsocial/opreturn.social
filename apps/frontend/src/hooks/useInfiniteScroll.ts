import { useRef, useEffect } from "react";

/**
 * Attaches an IntersectionObserver to a sentinel element at the bottom of a list.
 * Calls onLoadMore when the sentinel scrolls into view.
 * The sentinel element must always be in the DOM (not inside conditional rendering).
 *
 * Pass `loading` so that after a page loads and the sentinel is still visible
 * (not enough content to push it off-screen), the next page is triggered automatically.
 */
export function useInfiniteScroll(
  onLoadMore: (() => void) | undefined,
  loading?: boolean,
) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  // Always points to the latest callback without recreating the observer
  const callbackRef = useRef(onLoadMore);
  useEffect(() => {
    callbackRef.current = onLoadMore;
  });

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !onLoadMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) callbackRef.current?.();
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // created once - latest callback is always accessed via ref

  // After a load completes, re-check if sentinel is still in view and trigger again
  const prevLoadingRef = useRef(loading);
  useEffect(() => {
    const was = prevLoadingRef.current;
    prevLoadingRef.current = loading;
    if (was && !loading) {
      const el = sentinelRef.current;
      if (!el) return;
      if (el.getBoundingClientRect().top < window.innerHeight + 200) {
        callbackRef.current?.();
      }
    }
  }, [loading]);

  return sentinelRef;
}
