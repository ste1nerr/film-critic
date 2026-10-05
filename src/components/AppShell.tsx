"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { exportCsv, exportXlsx } from "@/lib/spreadsheet";
import { useStore } from "@/lib/store";
import { supabase } from "@/lib/supabase";
import { AddTitleDialog } from "./AddTitleDialog";
import { AuthScreen, SetupScreen } from "./AuthScreen";
import { ImportDialog } from "./ImportDialog";
import { Button, Spinner } from "./ui";

function Logo() {
  return (
    <Link href="/" className="flex shrink-0 items-center gap-2">
      <span className="grid size-8 place-items-center rounded-lg bg-accent text-black">🎬</span>
      <span className="whitespace-nowrap font-display text-2xl tracking-wider">Film Critic</span>
    </Link>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const active = usePathname() === href;
  return (
    <Link
      href={href}
      className={`rounded-lg px-3 py-1.5 text-sm transition ${active ? "bg-surface-2 text-foreground" : "text-muted hover:text-foreground"}`}
    >
      {children}
    </Link>
  );
}

function ExportMenu({ compact = false }: { compact?: boolean }) {
  const { titles } = useStore();
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      {compact ? (
        <button
          onClick={() => setOpen((o) => !o)}
          disabled={!titles.length}
          className="rounded-lg px-3 py-1.5 text-sm text-muted hover:text-foreground disabled:opacity-50"
        >
          Export
        </button>
      ) : (
        <Button onClick={() => setOpen((o) => !o)} disabled={!titles.length}>
          Export
        </Button>
      )}
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-2 w-44 overflow-hidden rounded-xl border border-border bg-surface shadow-xl">
            {[
              { label: "CSV (.csv)", run: exportCsv },
              { label: "Excel (.xlsx)", run: exportXlsx },
            ].map((item) => (
              <button
                key={item.label}
                className="block w-full px-4 py-2.5 text-left text-sm hover:bg-surface-2"
                onClick={() => {
                  item.run(titles);
                  setOpen(false);
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, authReady, signOut } = useStore();
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);

  let body: React.ReactNode;
  if (!supabase) body = <SetupScreen />;
  else if (!authReady)
    body = (
      <div className="grid flex-1 place-items-center">
        <Spinner className="size-8 text-accent" />
      </div>
    );
  else if (!user) body = <AuthScreen />;
  else body = children;

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-3 sm:gap-3">
          <Logo />
          {user && (
            <>
              <nav className="ml-2 hidden gap-1 sm:flex lg:ml-4">
                <NavLink href="/">Library</NavLink>
                <NavLink href="/stats">Stats</NavLink>
              </nav>
              <div className="ml-auto flex items-center gap-2">
                <Button onClick={() => setImporting(true)} className="hidden sm:inline-flex">
                  Import
                </Button>
                <div className="hidden sm:block">
                  <ExportMenu />
                </div>
                <Button variant="primary" onClick={() => setAdding(true)}>
                  + Add
                </Button>
                <button
                  onClick={signOut}
                  title={`Sign out ${user.email ?? ""}`}
                  className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 text-sm font-semibold uppercase text-muted hover:text-foreground"
                >
                  {user.email?.[0] ?? "?"}
                </button>
              </div>
            </>
          )}
        </div>
        {user && (
          <nav className="flex items-center gap-1 border-t border-border/60 px-4 py-1.5 sm:hidden">
            <NavLink href="/">Library</NavLink>
            <NavLink href="/stats">Stats</NavLink>
            <button
              onClick={() => setImporting(true)}
              className="ml-auto rounded-lg px-3 py-1.5 text-sm text-muted hover:text-foreground"
            >
              Import
            </button>
            <ExportMenu compact />
          </nav>
        )}
      </header>

      <main className="flex flex-1 flex-col">{body}</main>

      <footer className="border-t border-border/60 px-4 py-6 text-center text-xs text-muted">
        Movie and series data from{" "}
        <a href="https://www.themoviedb.org" target="_blank" rel="noreferrer" className="text-foreground hover:underline">
          TMDB
        </a>
        . This product uses the TMDB API but is not endorsed or certified by TMDB.
      </footer>

      {user && (
        <>
          <AddTitleDialog open={adding} onClose={() => setAdding(false)} />
          <ImportDialog open={importing} onClose={() => setImporting(false)} />
        </>
      )}
    </>
  );
}
