"use client";

import { ViewTransition } from "react";

/** Navigation direction for `<Link transitionTypes>`: a title page is forward, back to the library is back. */
export const FORWARD = ["nav-forward"];
export const BACK = ["nav-back"];

const directional = { "nav-forward": "nav-forward", "nav-back": "nav-back", default: "none" };

/**
 * Wraps a page so tagged navigations slide it in the right direction.
 * Lives in each page, not a layout: layouts persist, so enter and exit would never fire there.
 * Untagged transitions (browser back, refresh) swap instantly.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition enter={directional} exit={directional} default="none">
      {children}
    </ViewTransition>
  );
}
