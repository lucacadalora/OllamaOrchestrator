import { useState, useEffect } from "react";

export function useRealtime() {
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setIsRefreshing(true);
      setLastUpdate(new Date());
      
      // Reset refresh indicator after animation
      setTimeout(() => {
        setIsRefreshing(false);
      }, 1000);
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  return { lastUpdate, isRefreshing };
}
