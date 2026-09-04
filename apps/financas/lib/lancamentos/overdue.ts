import type { TxStatus } from "../financas/types.ts";

export function derivarStatus(
  row: { status: TxStatus; due_date: string },
  hojeIso: string,
): TxStatus {
  if (row.status === "paid") return "paid";
  if (row.due_date < hojeIso) return "overdue";
  return "pending";
}
