import { useEffect, useRef } from "react";

interface BarcodeScannerOptions {
  onScan: (barcode: string) => void;
  maxIntervalMs?: number; // Max time between keystrokes (default 35ms)
  minLength?: number;    // Minimum barcode length (default 3)
}

/**
 * Global Web Keydown Listener for Bluetooth / USB HID Barcode Scanners.
 * Intercepts rapid physical keystrokes without requiring focus on a input field.
 */
export function useBarcodeScanner({
  onScan,
  maxIntervalMs = 35,
  minLength = 3,
}: BarcodeScannerOptions) {
  const bufferRef = useRef<string>("");
  const lastKeyTimeRef = useRef<number>(0);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      // Ignore if active element is a text input / textarea where typing is intentional
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        // If target is normal input, do not capture unless scanner sends rapid sequence
        const timeDiff = performance.now() - lastKeyTimeRef.current;
        if (timeDiff > maxIntervalMs && bufferRef.current.length === 0) {
          return;
        }
      }

      const key = event.key;
      const now = performance.now();
      const timeSinceLastKey = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      // Enter key indicates end of scanned barcode
      if (key === "Enter") {
        if (bufferRef.current.length >= minLength) {
          const barcode = bufferRef.current.trim();
          bufferRef.current = "";
          playScanBeep();
          onScan(barcode);
          event.preventDefault();
        } else {
          bufferRef.current = "";
        }
        return;
      }

      // Capture single printable characters
      if (key.length === 1) {
        if (timeSinceLastKey > maxIntervalMs && bufferRef.current.length > 0) {
          // Time gap too long -> reset buffer for human typing
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
 * Synthesizes an audio beep feedback when a barcode is successfully scanned.
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
    console.warn("Audio Context beep error:", e);
  }
}
