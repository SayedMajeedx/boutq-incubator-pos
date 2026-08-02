import { useEffect, useRef } from "react";

interface BarcodeScannerOptions {
  onScan: (barcode: string) => void;
  maxIntervalMs?: number; // Max time between keystrokes (default 80ms to support manual typing too)
  minLength?: number;    // Minimum barcode length (default 2)
}

/**
 * Global Web Keydown Listener for Physical Barcode Scanners & Keyboard Testing.
 * Intercepts rapid physical barcode scanner keystrokes or keyboard entry ending with Enter.
 */
export function useBarcodeScanner({
  onScan,
  maxIntervalMs = 80,
  minLength = 2,
}: BarcodeScannerOptions) {
  const bufferRef = useRef<string>("");
  const lastKeyTimeRef = useRef<number>(0);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      
      // If typing inside a standard search input, only capture if Enter is pressed with a valid buffer
      const isInput =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);

      const key = event.key;
      const now = performance.now();
      const timeSinceLastKey = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      // Enter key triggers scan evaluation
      if (key === "Enter") {
        if (bufferRef.current.length >= minLength) {
          const barcode = bufferRef.current.trim();
          bufferRef.current = "";
          console.log(
            `%c[HARDWARE] Barcode Triggered via Keyboard/Scanner: ${barcode}`,
            "color: #00e5ff; font-weight: bold; background: #002233; padding: 4px 8px; border-radius: 4px;"
          );
          playScanBeep();
          onScan(barcode);
          if (!isInput) {
            event.preventDefault();
          }
        } else {
          bufferRef.current = "";
        }
        return;
      }

      // Capture single printable characters
      if (key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
        if (timeSinceLastKey > maxIntervalMs && bufferRef.current.length > 0) {
          // Reset buffer if idle too long
          bufferRef.current = "";
        }
        bufferRef.current += key;
      }
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [onScan, maxIntervalMs, minLength]);
}

/**
 * Synthesizes an audio beep feedback when a barcode is successfully scanned or tested.
 */
export function playScanBeep() {
  try {
    const AudioContextClass =
      window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(1400, ctx.currentTime); // 1400 Hz beep
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.08);
  } catch (e) {
    console.warn("[Hardware] Audio Context beep warning:", e);
  }
}
