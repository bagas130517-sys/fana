"use client";

import { useEffect, useState } from "react";

/**
 * Sidebar that follows the reading position.
 *
 * Measured on scroll rather than with an IntersectionObserver: the sections
 * here vary wildly in height, and a short one — Base URL is three lines — can
 * pass straight through an observer band without ever being the "current" one.
 * Asking which heading is the last one above the fold has no such gap, and a
 * handful of `getBoundingClientRect` calls behind a rAF is nothing.
 */
export function TableOfContents({
  sections,
}: {
  sections: { id: string; title: string }[];
}) {
  const [active, setActive] = useState(sections[0]?.id ?? "");

  useEffect(() => {
    let frame = 0;

    const measure = () => {
      frame = 0;
      // A little below the sticky header, so a section counts as current once
      // its heading has actually reached the top of the readable area.
      const line = 96;
      let current = sections[0]?.id ?? "";

      for (const { id } of sections) {
        const top = document.getElementById(id)?.getBoundingClientRect().top;
        if (top === undefined) continue;
        if (top <= line) current = id;
      }

      // At the bottom of the page the last section may never cross the line —
      // nothing below it can be reached, so it is what is being read.
      const atBottom =
        window.innerHeight + window.scrollY >= document.body.scrollHeight - 2;
      if (atBottom && sections.length > 0) current = sections[sections.length - 1]!.id;

      setActive(current);
    };

    const onScroll = () => {
      frame ||= requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [sections]);

  return (
    <nav aria-label="On this page" className="hidden lg:sticky lg:top-20 lg:block lg:h-fit">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-2">
        On this page
      </p>
      <ul className="space-y-1 border-l border-rule">
        {sections.map((s) => {
          const current = s.id === active;
          return (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                aria-current={current ? "location" : undefined}
                className={`-ml-px block border-l py-1 pl-3 text-sm transition-colors ${
                  current
                    ? "border-accent font-medium text-accent"
                    : "border-transparent text-ink-2 hover:border-rule hover:text-ink"
                }`}
              >
                {s.title}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
