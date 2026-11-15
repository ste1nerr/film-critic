import type { Metadata } from "next";
import { SharedLibrary } from "@/components/SharedLibrary";

export const metadata: Metadata = { title: "Shared list · Film Critic", robots: { index: false } };

export default async function Page({ params }: PageProps<"/s/[token]">) {
  const { token } = await params;
  return <SharedLibrary token={token} />;
}
