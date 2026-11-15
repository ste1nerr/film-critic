"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Button, Modal, Spinner } from "./ui";

/** Turns the read-only link to your library on, copies it, or turns it off (a new one gets a new address). */
export function ShareDialog({ open, onClose }: { open: boolean; onClose(): void }) {
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !supabase) return;
    supabase
      .from("share_links")
      .select("token")
      .maybeSingle()
      .then(({ data, error }) => {
        setCopied(false);
        setError(error?.message ?? null);
        setToken(data?.token ?? null);
      });
  }, [open]);

  const url = token ? `${window.location.origin}/s/${token}` : "";

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const create = () =>
    run(async () => {
      const { data, error } = await supabase!.from("share_links").insert({}).select("token").single();
      if (error) throw error;
      setToken(data.token);
    });

  const revoke = () =>
    run(async () => {
      const { error } = await supabase!.from("share_links").delete().eq("token", token!);
      if (error) throw error;
      setToken(null);
    });

  const copy = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
  };

  return (
    <Modal open={open} onClose={onClose} title="Share your list">
      <p className="mb-4 text-sm text-muted">
        Anyone with the link sees your ratings and watchlist without signing in. Notes stay private.
      </p>
      {token === undefined ? (
        <Spinner className="text-accent" />
      ) : token ? (
        <div className="space-y-3">
          <div className="flex gap-2">
            <input readOnly value={url} onFocus={(e) => e.target.select()} className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm" />
            <Button variant="primary" onClick={copy}>
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <button onClick={revoke} disabled={busy} className="text-sm text-rose-300 hover:underline disabled:opacity-50">
            Turn the link off
          </button>
        </div>
      ) : (
        <Button variant="primary" onClick={create} disabled={busy}>
          Create link
        </Button>
      )}
      {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}
    </Modal>
  );
}
