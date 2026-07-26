import { Suspense } from "react";
import { SpaceWizard } from "@/components/SpaceWizard";

export default function NewSitePage() {
  return (
    <Suspense fallback={null}>
      <SpaceWizard />
    </Suspense>
  );
}
