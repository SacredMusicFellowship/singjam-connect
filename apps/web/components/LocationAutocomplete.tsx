"use client";

import { useState, useRef, useEffect } from "react";
import { deriveNeighborhood, resolvePlaceAddress } from "@singjam/core";

type Suggestion = {
  placePrediction: {
    placeId: string;
    structuredFormat: {
      mainText: { text: string };
      secondaryText?: { text: string };
    };
  };
};

export type LocationValue = {
  fullAddress: string;
  neighborhood: string;
  confirmed?: boolean;
};

export default function LocationAutocomplete({
  value,
  onChange,
  placeholder,
  citiesOnly = false,
}: {
  value: string;
  onChange: (location: LocationValue) => void;
  placeholder?: string;
  citiesOnly?: boolean;
}) {
  const [inputValue, setInputValue] = useState(value);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value;
    setInputValue(q);
    // Propagate raw text too so the input stays controlled
    onChange({ fullAddress: q, neighborhood: q, confirmed: false });

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.length < 3) { setSuggestions([]); setOpen(false); return; }

    debounceRef.current = setTimeout(async () => {
      const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
      if (!key) return;
      try {
        const res = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key },
          body: JSON.stringify({
            input: q,
            ...(citiesOnly && { includedPrimaryTypes: ["locality", "sublocality"] }),
          }),
        });
        const json = await res.json();
        setSuggestions(json.suggestions ?? []);
        setOpen(true);
      } catch {
        // silently ignore
      }
    }, 300);
  }

  async function select(s: Suggestion) {
    const { placeId, structuredFormat } = s.placePrediction;
    const { mainText, secondaryText } = structuredFormat;
    const suggested = secondaryText
      ? `${mainText.text}, ${secondaryText.text}`
      : mainText.text;
    const neighborhood = deriveNeighborhood(mainText.text, secondaryText?.text, citiesOnly);

    setInputValue(suggested);
    setSuggestions([]);
    setOpen(false);

    // A city pick (the profile form) needs no street address.
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
    const fullAddress =
      citiesOnly || !key
        ? suggested
        : await resolvePlaceAddress({ placeId, mainText: mainText.text, fallback: suggested, apiKey: key });

    setInputValue(fullAddress);
    onChange({ fullAddress, neighborhood, confirmed: true });
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm"
        value={inputValue}
        onChange={handleInput}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        placeholder={placeholder}
        autoComplete="off"
      />
      {open && suggestions.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full rounded-xl border border-zinc-200 bg-white shadow-lg overflow-hidden">
          {suggestions.map((s) => {
            const { placeId, structuredFormat } = s.placePrediction;
            const { mainText, secondaryText } = structuredFormat;
            return (
              <li key={placeId}>
                <button
                  type="button"
                  onMouseDown={() => select(s)}
                  className="w-full px-3 py-2.5 text-left text-sm text-zinc-700 hover:bg-zinc-50 transition-colors"
                >
                  <span className="font-medium">{mainText.text}</span>
                  {secondaryText && (
                    <span className="text-zinc-400">, {secondaryText.text}</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
