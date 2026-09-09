import { useEffect, useState } from "react";

/** Re-renders at the next local midnight so "imorgon" becomes "idag". */
export function useToday(): Date {
  const [today, setToday] = useState(() => new Date());
  useEffect(() => {
    const next = new Date(today);
    next.setHours(24, 0, 5, 0);
    const timer = setTimeout(() => setToday(new Date()), next.getTime() - today.getTime());
    return () => clearTimeout(timer);
  }, [today]);
  return today;
}
