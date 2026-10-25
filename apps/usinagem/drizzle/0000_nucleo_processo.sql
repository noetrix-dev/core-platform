CREATE TABLE "clientes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"razao_social" text NOT NULL,
	"cnpj" text,
	"ficticio" boolean DEFAULT false NOT NULL,
	"versao" integer DEFAULT 1 NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clientes_cnpj_unique" UNIQUE("cnpj")
);
--> statement-breakpoint
CREATE TABLE "configuracoes" (
	"chave" text PRIMARY KEY NOT NULL,
	"valor" jsonb NOT NULL,
	"versao" integer DEFAULT 1 NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eventos_auditoria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"autor_id" uuid,
	"operacao" text NOT NULL,
	"entidade" text NOT NULL,
	"entidade_id" text,
	"antes" jsonb,
	"depois" jsonb,
	"justificativa" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "itens_revisao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"revisao_id" uuid NOT NULL,
	"ordem" integer NOT NULL,
	"descricao" text NOT NULL,
	"quantidade" integer NOT NULL,
	"unidade" text DEFAULT 'pç' NOT NULL,
	"preco_unitario_centavos" bigint,
	"versao" integer DEFAULT 1 NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "itens_revisao_ordem_uq" UNIQUE("revisao_id","ordem"),
	CONSTRAINT "itens_quantidade_check" CHECK ("itens_revisao"."quantidade" > 0),
	CONSTRAINT "itens_preco_check" CHECK ("itens_revisao"."preco_unitario_centavos" is null or "itens_revisao"."preco_unitario_centavos" >= 0)
);
--> statement-breakpoint
CREATE TABLE "perfil_permissoes" (
	"perfil_id" text NOT NULL,
	"permissao" text NOT NULL,
	CONSTRAINT "perfil_permissoes_perfil_id_permissao_pk" PRIMARY KEY("perfil_id","permissao")
);
--> statement-breakpoint
CREATE TABLE "perfis" (
	"id" text PRIMARY KEY NOT NULL,
	"nome" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "permissoes" (
	"codigo" text PRIMARY KEY NOT NULL,
	"travada_admin" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "processos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"numero" integer NOT NULL,
	"cliente_id" uuid NOT NULL,
	"situacao_comercial" text DEFAULT 'cotacao_aberta' NOT NULL,
	"derivado_de_processo_id" uuid,
	"titulo" text NOT NULL,
	"ficticio" boolean DEFAULT false NOT NULL,
	"criado_por" uuid NOT NULL,
	"versao" integer DEFAULT 1 NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "processos_numero_unique" UNIQUE("numero"),
	CONSTRAINT "processos_situacao_check" CHECK ("processos"."situacao_comercial" in ('cotacao_aberta', 'cotacao_enviada', 'aprovado', 'parcialmente_contratado', 'contratado', 'fechado', 'reaberto', 'perdido', 'cancelado', 'suspenso')),
	CONSTRAINT "processos_numero_check" CHECK ("processos"."numero" > 0),
	CONSTRAINT "processos_derivado_check" CHECK ("processos"."derivado_de_processo_id" is null or "processos"."derivado_de_processo_id" <> "processos"."id")
);
--> statement-breakpoint
CREATE TABLE "revisoes_comerciais" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"processo_id" uuid NOT NULL,
	"letra" text NOT NULL,
	"sequencia" integer NOT NULL,
	"estado" text DEFAULT 'rascunho' NOT NULL,
	"validade_dias" integer,
	"prazo_entrega" text,
	"condicoes_pagamento" text,
	"observacoes" text,
	"precificada_por" uuid,
	"aprovada_por" uuid,
	"criado_por" uuid NOT NULL,
	"versao" integer DEFAULT 1 NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "revisoes_processo_letra_uq" UNIQUE("processo_id","letra"),
	CONSTRAINT "revisoes_processo_sequencia_uq" UNIQUE("processo_id","sequencia"),
	CONSTRAINT "revisoes_validade_check" CHECK ("revisoes_comerciais"."validade_dias" is null or "revisoes_comerciais"."validade_dias" > 0),
	CONSTRAINT "revisoes_sequencia_check" CHECK ("revisoes_comerciais"."sequencia" > 0),
	CONSTRAINT "revisoes_letra_check" CHECK ("revisoes_comerciais"."letra" ~ '^[A-Z]{1,2}$'),
	CONSTRAINT "revisoes_estado_check" CHECK ("revisoes_comerciais"."estado" in ('rascunho', 'preco_pendente', 'precificada', 'enviada', 'aprovada', 'recusada', 'substituida'))
);
--> statement-breakpoint
CREATE TABLE "sequencias_numeracao" (
	"nome" text PRIMARY KEY NOT NULL,
	"proximo" integer NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sequencias_proximo_check" CHECK ("sequencias_numeracao"."proximo" > 0)
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"email" text NOT NULL,
	"perfil_id" text NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"ficticio" boolean DEFAULT false NOT NULL,
	"versao" integer DEFAULT 1 NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usuarios_email_unique" UNIQUE("email"),
	CONSTRAINT "usuarios_email_minusculo_check" CHECK ("usuarios"."email" = lower("usuarios"."email"))
);
--> statement-breakpoint
ALTER TABLE "eventos_auditoria" ADD CONSTRAINT "eventos_auditoria_autor_id_usuarios_id_fk" FOREIGN KEY ("autor_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itens_revisao" ADD CONSTRAINT "itens_revisao_revisao_id_revisoes_comerciais_id_fk" FOREIGN KEY ("revisao_id") REFERENCES "public"."revisoes_comerciais"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "perfil_permissoes" ADD CONSTRAINT "perfil_permissoes_perfil_id_perfis_id_fk" FOREIGN KEY ("perfil_id") REFERENCES "public"."perfis"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "perfil_permissoes" ADD CONSTRAINT "perfil_permissoes_permissao_permissoes_codigo_fk" FOREIGN KEY ("permissao") REFERENCES "public"."permissoes"("codigo") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processos" ADD CONSTRAINT "processos_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processos" ADD CONSTRAINT "processos_derivado_de_processo_id_processos_id_fk" FOREIGN KEY ("derivado_de_processo_id") REFERENCES "public"."processos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processos" ADD CONSTRAINT "processos_criado_por_usuarios_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revisoes_comerciais" ADD CONSTRAINT "revisoes_comerciais_processo_id_processos_id_fk" FOREIGN KEY ("processo_id") REFERENCES "public"."processos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revisoes_comerciais" ADD CONSTRAINT "revisoes_comerciais_precificada_por_usuarios_id_fk" FOREIGN KEY ("precificada_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revisoes_comerciais" ADD CONSTRAINT "revisoes_comerciais_aprovada_por_usuarios_id_fk" FOREIGN KEY ("aprovada_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revisoes_comerciais" ADD CONSTRAINT "revisoes_comerciais_criado_por_usuarios_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_perfil_id_perfis_id_fk" FOREIGN KEY ("perfil_id") REFERENCES "public"."perfis"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "eventos_auditoria_autor_id_idx" ON "eventos_auditoria" USING btree ("autor_id");--> statement-breakpoint
CREATE INDEX "eventos_auditoria_entidade_idx" ON "eventos_auditoria" USING btree ("entidade","entidade_id","criado_em");--> statement-breakpoint
CREATE INDEX "perfil_permissoes_permissao_idx" ON "perfil_permissoes" USING btree ("permissao");--> statement-breakpoint
CREATE INDEX "processos_cliente_id_idx" ON "processos" USING btree ("cliente_id");--> statement-breakpoint
CREATE INDEX "processos_derivado_de_processo_id_idx" ON "processos" USING btree ("derivado_de_processo_id");--> statement-breakpoint
CREATE INDEX "processos_criado_por_idx" ON "processos" USING btree ("criado_por");--> statement-breakpoint
CREATE INDEX "revisoes_comerciais_precificada_por_idx" ON "revisoes_comerciais" USING btree ("precificada_por");--> statement-breakpoint
CREATE INDEX "revisoes_comerciais_aprovada_por_idx" ON "revisoes_comerciais" USING btree ("aprovada_por");--> statement-breakpoint
CREATE INDEX "revisoes_comerciais_criado_por_idx" ON "revisoes_comerciais" USING btree ("criado_por");--> statement-breakpoint
CREATE INDEX "usuarios_perfil_id_idx" ON "usuarios" USING btree ("perfil_id");