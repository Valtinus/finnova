import { useEffect, useRef } from "react";

/**
 * Full-page gradient backdrop for the login/register pages.
 * The soft color blobs drift slightly against the mouse at different depths.
 */
export function AuthBackdrop() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        // -1 … 1 relative to the centre of the viewport
        el.style.setProperty("--mx", String((e.clientX / window.innerWidth) * 2 - 1));
        el.style.setProperty("--my", String((e.clientY / window.innerHeight) * 2 - 1));
      });
    };
    const onLeave = () => {
      el.style.setProperty("--mx", "0");
      el.style.setProperty("--my", "0");
    };

    window.addEventListener("pointermove", onMove);
    document.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <div className="auth-backdrop" ref={ref} aria-hidden="true">
      {["b1", "b2", "b3", "b4"].map((b) => (
        <div key={b} className={`blob ${b}`}>
          <i />
        </div>
      ))}
    </div>
  );
}
