import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type AddressSuggestion, suggestAddresses } from "@/lib/api";

const DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 3;

/**
 * Address input backed by SVOA's own autocomplete (through our proxy). Only a
 * picked suggestion is a valid address — SVOA rejects anything but its exact
 * "Street 1, District, 123 45" string — so free text never gets submitted;
 * the caller only learns about the address via `onPick`.
 */
export function AddressField({
  id,
  label,
  placeholder,
  defaultValue,
  onPick,
}: {
  id: string;
  label: string;
  placeholder: string;
  defaultValue?: string;
  onPick: (address: string | null) => void;
}) {
  const [value, setValue] = useState(defaultValue ?? "");
  const [picked, setPicked] = useState<string | null>(defaultValue ?? null);
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [edited, setEdited] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!edited || picked || value.trim().length < MIN_QUERY_LENGTH) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const hits = await suggestAddresses(value.trim(), controller.signal);
        if (!controller.signal.aborted) {
          setSuggestions(hits);
          setOpen(hits.length > 0);
        }
      } catch {
        // Network hiccups just mean no suggestions; typing on retries.
      }
    }, DEBOUNCE_MS);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [value, picked, edited]);

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  return (
    <div ref={containerRef} className="relative flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="text"
        autoComplete="off"
        inputMode="text"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setPicked(null);
          onPick(null);
          setEdited(true);
        }}
        onFocus={() => setOpen(edited && suggestions.length > 0)}
        placeholder={placeholder}
      />
      {open && !picked && suggestions.length > 0 ? (
        <ul className="absolute top-full right-0 left-0 z-10 mt-1 overflow-hidden rounded-lg bg-popover shadow-md ring-1 ring-foreground/10">
          {suggestions.map((hit) => (
            <li key={hit.value}>
              <button
                type="button"
                onClick={() => {
                  setValue(hit.value);
                  setPicked(hit.value);
                  onPick(hit.value);
                  setOpen(false);
                }}
                className="w-full px-3 py-3 text-left text-[0.95rem] hover:bg-secondary active:bg-secondary"
              >
                {hit.value}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
