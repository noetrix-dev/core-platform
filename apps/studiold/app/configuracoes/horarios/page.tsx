import { tenantDb } from "@/lib/supabase/server";
import { HorariosForm } from "../HorariosForm";

export const dynamic = "force-dynamic";

export default async function HorariosPage() {
  const db = tenantDb();
  const [hRes, bRes] = await Promise.all([
    db
      .from("horarios_funcionamento")
      .select("dia_semana, aberto, hora_abertura, hora_fechamento")
      .order("dia_semana"),
    db
      .from("bloqueios_fixos")
      .select("id, hora_inicio, hora_fim")
      .eq("tipo", "suave")
      .eq("ativo", true)
      .is("dia_semana", null)
      .limit(1),
  ]);
  if (hRes.error) throw new Error(`configuracoes/horarios: ${hRes.error.message}`);
  if (bRes.error) throw new Error(`configuracoes/bloqueios: ${bRes.error.message}`);

  const dias = ((hRes.data ?? []) as Array<Record<string, unknown>>).map((h) => ({
    dia_semana: h.dia_semana as number,
    aberto: (h.aberto as boolean) ?? false,
    hora_abertura: ((h.hora_abertura as string) ?? "").slice(0, 5),
    hora_fechamento: ((h.hora_fechamento as string) ?? "").slice(0, 5),
  }));
  const b0 = ((bRes.data ?? []) as Array<Record<string, unknown>>)[0];
  const almoco = b0
    ? {
        id: b0.id as string,
        hora_inicio: (b0.hora_inicio as string).slice(0, 5),
        hora_fim: (b0.hora_fim as string).slice(0, 5),
      }
    : null;

  return <HorariosForm key={JSON.stringify(dias)} dias={dias} almoco={almoco} />;
}
