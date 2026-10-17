'use client';
import { useEffect } from 'react';

export function SwRegister() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* ignore */
    });
  }, []);
  return null;
}
