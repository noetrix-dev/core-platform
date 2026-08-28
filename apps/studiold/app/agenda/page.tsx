import { AgendaShell } from "@/components/agenda/AgendaShell";

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ wa?: string }>;
}) {
  const { wa } = await searchParams;
  return <AgendaShell waOverride={wa} />;
}
