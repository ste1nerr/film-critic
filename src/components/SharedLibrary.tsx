"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Title } from "@/lib/types";
import { Library } from "./Library";
import { Spinner } from "./ui";

/** Someone's library opened by its share link; no sign-in needed. */
export function SharedLibrary({ token }: { token: string }) {
  const [titles, setTitles] = useState<Title[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    supabase.rpc("shared_library", { p_token: token }).then(({ data, error }) => {
      if (error) setError(error.message);
      else if (data == null) setError("This link is turned off or doesn't exist.");
      else setTitles((data as Omit<Title, "note">[]).map((t) => ({ ...t, note: null })));
    });
  }, [token]);

  if (error) return <p className="grid flex-1 place-items-center px-4 text-center text-muted">{error}</p>;
  if (!titles)
    return (
      <div className="grid flex-1 place-items-center">
        <Spinner className="size-8 text-accent" />
      </div>
    );
  return <Library shared={titles} />;
}
