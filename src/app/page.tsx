import { PageTransition } from "@/components/motion";
import { Library } from "@/components/Library";

export default function Home() {
  return (
    <PageTransition>
      <Library />
    </PageTransition>
  );
}
