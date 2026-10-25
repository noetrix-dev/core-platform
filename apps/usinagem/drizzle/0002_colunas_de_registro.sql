ALTER TABLE "clientes" ADD COLUMN "criado_por" uuid;--> statement-breakpoint
ALTER TABLE "configuracoes" ADD COLUMN "criado_em" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "configuracoes" ADD COLUMN "criado_por" uuid;--> statement-breakpoint
ALTER TABLE "itens_revisao" ADD COLUMN "criado_por" uuid;--> statement-breakpoint
ALTER TABLE "perfil_permissoes" ADD COLUMN "criado_em" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "perfis" ADD COLUMN "criado_em" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "perfis" ADD COLUMN "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "permissoes" ADD COLUMN "criado_em" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "permissoes" ADD COLUMN "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "sequencias_numeracao" ADD COLUMN "criado_em" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "sequencias_numeracao" ADD COLUMN "criado_por" uuid;--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "criado_por" uuid;--> statement-breakpoint
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_criado_por_usuarios_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "configuracoes" ADD CONSTRAINT "configuracoes_criado_por_usuarios_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itens_revisao" ADD CONSTRAINT "itens_revisao_criado_por_usuarios_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequencias_numeracao" ADD CONSTRAINT "sequencias_numeracao_criado_por_usuarios_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_criado_por_usuarios_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "clientes_criado_por_idx" ON "clientes" USING btree ("criado_por");--> statement-breakpoint
CREATE INDEX "configuracoes_criado_por_idx" ON "configuracoes" USING btree ("criado_por");--> statement-breakpoint
CREATE INDEX "itens_revisao_criado_por_idx" ON "itens_revisao" USING btree ("criado_por");--> statement-breakpoint
CREATE INDEX "sequencias_numeracao_criado_por_idx" ON "sequencias_numeracao" USING btree ("criado_por");--> statement-breakpoint
CREATE INDEX "usuarios_criado_por_idx" ON "usuarios" USING btree ("criado_por");