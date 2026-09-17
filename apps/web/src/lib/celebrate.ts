/**
 * Confetti for the one genuinely happy moment in the app: a domain passing MX
 * verification. Loaded on demand so the library isn't in the initial bundle,
 * and skipped for anyone who asked for reduced motion.
 */
export async function celebrate(): Promise<void> {
  if (
    typeof window === "undefined" ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    return;
  }

  const { default: confetti } = await import("canvas-confetti");
  const common = { spread: 70, startVelocity: 32, ticks: 140, zIndex: 60 };

  confetti({ ...common, particleCount: 60, origin: { x: 0.5, y: 0.45 } });
  setTimeout(
    () => confetti({ ...common, particleCount: 35, origin: { x: 0.3, y: 0.5 } }),
    140,
  );
  setTimeout(
    () => confetti({ ...common, particleCount: 35, origin: { x: 0.7, y: 0.5 } }),
    240,
  );
}
