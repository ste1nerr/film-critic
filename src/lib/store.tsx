"use client";

import type { RealtimePostgresChangesPayload, User } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { overallOf } from "./score";
import { supabase } from "./supabase";
import { CRITERIA, type Title, type TitleInput } from "./types";

interface Store {
  user: User | null;
  authReady: boolean;
  titles: Title[];
  loading: boolean;
  error: string | null;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string): Promise<{ needsConfirmation: boolean }>;
  signOut(): Promise<void>;
  addTitle(input: TitleInput): Promise<Title>;
  updateTitle(id: string, patch: Partial<TitleInput>): Promise<void>;
  removeTitle(id: string): Promise<void>;
  /** Bulk import: rows with `id` update that title, the rest are inserted. */
  importTitles(rows: (TitleInput & { id?: string })[]): Promise<void>;
}

const StoreContext = createContext<Store | null>(null);

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside <StoreProvider>");
  return ctx;
}

function db() {
  if (!supabase) throw new Error("Supabase is not configured");
  return supabase;
}

const fetchAll = () => db().from("titles").select("*").order("overall", { ascending: false });

function upsertLocal(list: Title[], row: Title) {
  const i = list.findIndex((t) => t.id === row.id);
  if (i === -1) return [row, ...list];
  const copy = list.slice();
  copy[i] = row;
  return copy;
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(!supabase);
  const [titles, setTitles] = useState<Title[]>([]);
  // Which user's titles are currently loaded; loading = signed in but not loaded yet.
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setAuthReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (!session) {
        setTitles([]);
        setLoadedFor(null);
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = user?.id;
  const loading = !!userId && loadedFor !== userId;

  const applyRows = useCallback(({ data, error }: { data: unknown; error: { message: string } | null }) => {
    if (error) setError(error.message);
    else {
      setTitles(data as Title[]);
      setError(null);
    }
  }, []);

  const reload = useCallback(async () => applyRows(await fetchAll()), [applyRows]);

  // Initial load + realtime subscription for the signed-in user.
  useEffect(() => {
    if (!supabase || !userId) return;
    fetchAll().then((res) => {
      applyRows(res);
      setLoadedFor(userId);
    });

    const onChange = (payload: RealtimePostgresChangesPayload<Title>) => {
      if (payload.eventType === "DELETE") {
        const id = (payload.old as Partial<Title>).id;
        setTitles((list) => list.filter((t) => t.id !== id));
      } else {
        setTitles((list) => upsertLocal(list, payload.new));
      }
    };

    const channel = supabase
      .channel(`titles:${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "titles", filter: `user_id=eq.${userId}` }, onChange)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "titles", filter: `user_id=eq.${userId}` }, onChange)
      // Delete events can't be filtered; unknown ids are simply ignored.
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "titles" }, onChange)
      .subscribe();

    return () => {
      supabase?.removeChannel(channel);
    };
  }, [userId, applyRows]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await db().auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const { data, error } = await db().auth.signUp({ email, password });
    if (error) throw error;
    return { needsConfirmation: !data.session };
  }, []);

  const signOut = useCallback(async () => {
    await db().auth.signOut();
  }, []);

  const addTitle = useCallback(async (input: TitleInput) => {
    const { data, error } = await db().from("titles").insert(input).select().single();
    if (error) throw error;
    const row = data as Title;
    setTitles((list) => upsertLocal(list, row));
    return row;
  }, []);

  const updateTitle = useCallback(
    async (id: string, patch: Partial<TitleInput>) => {
      // Optimistic: apply locally (recomputing overall) and roll back via reload on failure.
      setTitles((list) =>
        list.map((t) => {
          if (t.id !== id) return t;
          const next = { ...t, ...patch };
          return CRITERIA.some((c) => c.key in patch) ? { ...next, overall: overallOf(next) } : next;
        }),
      );
      const { error } = await db().from("titles").update(patch).eq("id", id);
      if (error) {
        await reload();
        throw error;
      }
    },
    [reload],
  );

  const removeTitle = useCallback(
    async (id: string) => {
      setTitles((list) => list.filter((t) => t.id !== id));
      const { error } = await db().from("titles").delete().eq("id", id);
      if (error) {
        await reload();
        throw error;
      }
    },
    [reload],
  );

  const importTitles = useCallback(
    async (rows: (TitleInput & { id?: string })[]) => {
      const inserts = rows.filter((r) => !r.id);
      const updates = rows.filter((r): r is TitleInput & { id: string } => !!r.id);
      if (inserts.length) {
        // Rows carry `id: undefined`; without defaultToNull: false a bulk insert sends it
        // as NULL instead of falling back to the column default.
        const { error } = await db().from("titles").insert(inserts, { defaultToNull: false });
        if (error) throw error;
      }
      for (const { id, ...patch } of updates) {
        const { error } = await db().from("titles").update(patch).eq("id", id);
        if (error) throw error;
      }
      await reload();
    },
    [reload],
  );

  const value = useMemo<Store>(
    () => ({
      user,
      authReady,
      titles,
      loading,
      error,
      signIn,
      signUp,
      signOut,
      addTitle,
      updateTitle,
      removeTitle,
      importTitles,
    }),
    [user, authReady, titles, loading, error, signIn, signUp, signOut, addTitle, updateTitle, removeTitle, importTitles],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
