import { AgendaShell } from "@/components/agenda/AgendaShell";
import { loadAgendaData } from "@/lib/agenda/load";
import { requireUser } from "@/lib/supabase/auth";

export const dynamic = "force-dynamic";

/** hoje no fuso do tenant (São Paulo), independente do fuso do servidor */
function hojeKey(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date());
}

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ d?: string; wa?: string }>;
}) {
  await requireUser();
  const { d, wa } = await searchParams;
  const dayKey = /^\d{4}-\d{2}-\d{2}$/.test(d ?? "") ? d! : hojeKey();
  const data = await loadAgendaData(dayKey);
  return <AgendaShell dayKey={dayKey} data={data} waOverride={wa} />;
}
