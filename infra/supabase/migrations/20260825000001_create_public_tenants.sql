CREATE TABLE IF NOT EXISTS public.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  vertical TEXT NOT NULL CHECK (vertical IN ('barbearia', 'usinagem', 'oficina', 'outro')),
  dominio TEXT,
  whatsapp_numero TEXT,
  whatsapp_instancia TEXT,
  whatsapp_status TEXT DEFAULT 'desconectado',
  plano TEXT,
  ativo BOOLEAN DEFAULT true,
  criado_em TIMESTAMPTZ DEFAULT now(),
  atualizado_em TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tenant_usuarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  role TEXT NOT NULL CHECK (role IN ('admin', 'operador', 'visualizador')) DEFAULT 'admin',
  ativo BOOLEAN DEFAULT true,
  criado_em TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, user_id)
);

INSERT INTO public.tenants (slug, nome, vertical, dominio, whatsapp_instancia) VALUES
  ('barbearia_001', 'StudiOLD', 'barbearia', 'studiold.noetrix.com.br', 'barbearia_001'),
  ('usinagem_001', 'Empresa de Usinagem', 'usinagem', 'usinagem.noetrix.com.br', 'usinagem_001');

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_usuarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_usuarios_ver_proprio"
  ON public.tenant_usuarios FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "tenants_ver_proprio"
  ON public.tenants FOR SELECT
  USING (id IN (
    SELECT tenant_id FROM public.tenant_usuarios WHERE user_id = auth.uid()
  ));
