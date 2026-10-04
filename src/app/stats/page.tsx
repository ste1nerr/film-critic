import type { Metadata } from "next";
import { Stats } from "@/components/Stats";

export const metadata: Metadata = { title: "Stats · Film Critic" };

export default function Page() {
  return <Stats />;
}
