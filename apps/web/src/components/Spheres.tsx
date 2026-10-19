import { useEffect, useRef } from "react";

/**
 * Ambient background of colored glossy spheres (the glass surfaces blur them).
 * With `interactive`, the spheres drift against the mouse at different depths (parallax).
 */
export function Spheres({ interactive = false }: { interactive?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!interactive || !el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        // -1 … 1 from the centre of the viewport
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
  }, [interactive]);

  return (
    <div className="spheres" ref={ref} aria-hidden="true">
      {["s1", "s2", "s3", "s4", "s5"].map((s) => (
        <div key={s} className={`sphere-pos ${s}`}>
          <div className="sphere" />
        </div>
      ))}
    </div>
  );
}
