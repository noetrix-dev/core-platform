export type Movement = "income" | "expense" | "investment";
export type TxStatus = "pending" | "paid" | "overdue";
export type TxType = "fixed" | "variable" | "installment";
export type Bucket = "necessidade" | "desejo" | "investimento";
export type Grupo =
  | "fgts"
  | "consignado"
  | "serasa"
  | "pessoal"
  | "familia"
  | "cartao";

export type AccountRow = {
  id: string;
  name: string;
  bank: "inter" | "nubank" | "bradesco" | "btg";
  type: "corrente" | "poupanca" | "investimento";
  balance: number;
  balance_updated_at: string | null;
  fatura_atual: number | null;
  limite_disponivel: number | null;
  ativo: boolean;
};

export type NoetrixMetricRow = {
  id: string;
  mes: string;
  mrr: number;
  clientes_pagantes: number;
  churn_pct: number | null;
  custo_operacional: number | null;
  reserva_meses: number | null;
};

export type CategoryRow = {
  id: string;
  name: string;
  type: Movement;
  bucket: Bucket | null;
  color: string | null;
  icon: string | null;
  ativo: boolean;
};

export type SubcategoryRow = {
  id: string;
  category_id: string;
  name: string;
  ativo: boolean;
};

export type DebtRow = {
  id: string;
  creditor: string;
  grupo: Grupo;
  total_amount: number;
  remaining_amount: number;
  monthly_payment: number | null;
  due_day: number | null;
  status: "ativa" | "quitada";
  notes: string | null;
};

export type TemplateRow = {
  id: string;
  description: string;
  amount: number;
  movement: Movement;
  category_id: string | null;
  subcategory_id: string | null;
  account_id: string | null;
  day_of_month: number;
  type: TxType;
  ativo: boolean;
};

export type TransactionRow = {
  id: string;
  description: string;
  amount: number;
  movement: Movement;
  type: TxType;
  due_date: string;
  payment_date: string | null;
  status: TxStatus;
  account_id: string | null;
  category_id: string | null;
  subcategory_id: string | null;
  card_id: string | null;
  debt_id: string | null;
  installment_current: number | null;
  installment_total: number | null;
  installment_group_id: string | null;
  is_recurring: boolean;
  recurring_template_id: string | null;
  source: "manual" | "ofx";
  external_id: string | null;
};

export type NovaTransacao = {
  description: string;
  amount: number;
  movement: Movement;
  due_date: string;
  type?: TxType;
  status?: TxStatus;
  payment_date?: string | null;
  account_id?: string | null;
  category_id?: string | null;
  subcategory_id?: string | null;
  debt_id?: string | null;
  installment_current?: number | null;
  installment_total?: number | null;
  installment_group_id?: string | null;
  is_recurring?: boolean;
  recurring_template_id?: string | null;
  source?: "manual" | "ofx";
  external_id?: string | null;
};
