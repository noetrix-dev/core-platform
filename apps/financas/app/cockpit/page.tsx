import { requireUser } from "@/lib/supabase/auth";

export const dynamic = "force-dynamic";

export default async function CockpitPage() {
  await requireUser();
  return <main className="p-6">cockpit — em construção</main>;
}
