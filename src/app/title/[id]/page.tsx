import { TitlePage } from "@/components/TitlePage";

export default async function Page({ params }: PageProps<"/title/[id]">) {
  const { id } = await params;
  return <TitlePage id={id} />;
}
