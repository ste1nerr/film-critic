"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { Button } from "./ui";

function Hero({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex flex-1 items-center justify-center overflow-hidden px-4 py-16">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(245,179,1,0.15),transparent_60%)]" />
      <div className="relative w-full max-w-md">{children}</div>
    </div>
  );
}

export function AuthScreen() {
  const { signIn, signUp } = useStore();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "info"; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      if (mode === "in") await signIn(email, password);
      else {
        const { needsConfirmation } = await signUp(email, password);
        if (needsConfirmation) setMessage({ tone: "info", text: "Check your inbox to confirm the email, then sign in." });
      }
    } catch (err) {
      setMessage({ tone: "error", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Hero>
      <h1 className="font-display text-6xl leading-none tracking-wide">
        Your taste,
        <br />
        <span className="text-accent">scored.</span>
      </h1>
      <p className="mt-3 text-muted">Rate every movie and series on plot, ending, acting, atmosphere and vibe.</p>

      <form onSubmit={submit} className="mt-8 space-y-3 rounded-2xl border border-border bg-surface p-5">
        <input
          type="email"
          required
          autoComplete="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-xl border border-border bg-surface-2 px-4 py-3 outline-none focus:border-accent"
        />
        <input
          type="password"
          required
          minLength={6}
          autoComplete={mode === "in" ? "current-password" : "new-password"}
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-xl border border-border bg-surface-2 px-4 py-3 outline-none focus:border-accent"
        />
        {message && (
          <p className={`text-sm ${message.tone === "error" ? "text-rose-300" : "text-emerald-300"}`}>{message.text}</p>
        )}
        <Button variant="primary" type="submit" disabled={busy} className="w-full py-3">
          {busy ? "…" : mode === "in" ? "Sign in" : "Create account"}
        </Button>
        <button
          type="button"
          onClick={() => setMode(mode === "in" ? "up" : "in")}
          className="w-full text-center text-sm text-muted hover:text-foreground"
        >
          {mode === "in" ? "No account yet? Create one" : "Have an account? Sign in"}
        </button>
      </form>
    </Hero>
  );
}

export function SetupScreen() {
  return (
    <Hero>
      <h1 className="font-display text-5xl tracking-wide">Almost there</h1>
      <p className="mt-2 text-muted">Connect a free Supabase project to store your ratings.</p>
      <ol className="mt-6 list-decimal space-y-2 pl-5 text-sm text-muted">
        <li>
          Create a project at <span className="text-foreground">supabase.com</span>.
        </li>
        <li>
          Run <code className="text-accent">supabase/schema.sql</code> in the SQL Editor.
        </li>
        <li>
          Copy <code className="text-accent">.env.example</code> to <code className="text-accent">.env.local</code> and fill in
          the Supabase URL, anon key and your TMDB key.
        </li>
        <li>Restart the dev server.</li>
      </ol>
    </Hero>
  );
}
