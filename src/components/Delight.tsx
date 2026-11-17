"use client";

import { useEffect, useRef, useState } from "react";

/** Fired by the N shortcut; AppShell opens the add dialog. */
export const ADD_EVENT = "fc-add";

/** True while typing somewhere, so single-letter shortcuts never eat a keystroke. */
const typing = (el: EventTarget | null) => el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

const SHORTCUTS: [string, string][] = [
  ["/", "Filter the library"],
  ["N", "Add a title"],
  ["Esc", "Close this help"],
  ["?", "Keyboard shortcuts"],
];

/**
 * Small app-wide touches: keyboard shortcuts, a light tick on touch screens when a button is
 * pressed, and a quiet note when the connection drops.
 */
export function Delight() {
  const [help, setHelp] = useState(false);
  const [offline, setOffline] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return;
      // An open dialog owns the keyboard.
      if (document.querySelector('dialog[open]')) return;
      if (e.key === "/") {
        const field = document.querySelector<HTMLInputElement>('input[placeholder^="Filter by name"]');
        if (!field) return;
        e.preventDefault();
        field.focus();
      } else if (e.key === "n" || e.key === "N" || e.key === "т" || e.key === "Т") {
        e.preventDefault();
        dispatchEvent(new Event(ADD_EVENT));
      } else if (e.key === "?") {
        setHelp((h) => !h);
      } else if (e.key === "Escape") {
        setHelp(false);
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);

  // A short tick under the finger on phones that support it.
  useEffect(() => {
    if (!matchMedia("(pointer: coarse)").matches || !("vibrate" in navigator)) return;
    const onDown = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest("button:not(:disabled)")) navigator.vibrate(6);
    };
    addEventListener("pointerdown", onDown, { passive: true });
    return () => removeEventListener("pointerdown", onDown);
  }, []);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    addEventListener("online", update);
    addEventListener("offline", update);
    return () => {
      removeEventListener("online", update);
      removeEventListener("offline", update);
    };
  }, []);

  useEffect(() => {
    if (help) dialog.current?.focus();
  }, [help]);

  return (
    <>
      {offline && (
        <div role="status" className="toast-in fixed inset-x-0 top-[max(12px,env(safe-area-inset-top))] z-50 mx-auto w-fit rounded-full bg-foreground px-4 py-2 text-sm text-background shadow-lg">
          You’re offline — showing what’s already loaded
        </div>
      )}
      {help && (
        <>
          <div className="fixed inset-0 z-40 bg-black/60" onClick={() => setHelp(false)} />
          <div className="pointer-events-none fixed inset-0 z-[41] grid place-items-center">
            <div ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" className="toast-in pointer-events-auto w-[min(360px,calc(100vw-32px))] rounded-2xl border border-border bg-surface p-6 shadow-2xl outline-none">
              <h2 className="text-lg font-semibold">Keyboard shortcuts</h2>
              <dl className="mt-4 flex flex-col gap-2.5 text-sm">
                {SHORTCUTS.map(([key, what]) => (
                  <div key={key} className="flex items-center justify-between gap-4">
                    <dt className="text-muted">{what}</dt>
                    <dd>
                      <kbd className="inline-grid min-w-7 place-items-center rounded-md border border-b-2 border-border bg-surface-2 px-1.5 py-0.5 font-sans text-xs font-semibold">{key}</kbd>
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </>
      )}
    </>
  );
}
