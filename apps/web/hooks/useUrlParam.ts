import { useCallback, useSyncExternalStore } from "react";

const CHANGE = "urlparamchange";

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE, onChange);
  window.addEventListener("popstate", onChange);
  return () => {
    window.removeEventListener(CHANGE, onChange);
    window.removeEventListener("popstate", onChange);
  };
}

// A bit of page state kept in the address, so Back from a song brings it back.
// The server and hydration render null; a client-side Back reads the address at once.
export function useUrlParam(key: string): [string | null, (value: string | null) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => new URLSearchParams(window.location.search).get(key),
    () => null
  );
  const setValue = useCallback((next: string | null) => {
    const params = new URLSearchParams(window.location.search);
    if (next === null) params.delete(key);
    else params.set(key, next);
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
    window.dispatchEvent(new Event(CHANGE));
  }, [key]);
  return [value, setValue];
}
