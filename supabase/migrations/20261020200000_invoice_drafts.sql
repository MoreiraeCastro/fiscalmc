begin;

-- Rascunhos da emissão em 4 passos (Pessoas → Serviço → Valores → Emitir NFS-e), como no Emissor Nacional:
-- cada "Avançar" grava o que já foi preenchido. O rascunho não é nota: só vira invoice no clique de Emitir,
-- pelo motor de sempre (POST /api/invoices), usando idempotency_key como Idempotency-Key.
create table public.invoice_drafts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  step smallint not null default 1 check (step between 1 and 4),
  data jsonb not null default '{}'::jsonb,
  -- Trocada quando a Receita rejeita, para a correção poder ser emitida de novo.
  idempotency_key uuid not null default gen_random_uuid(),
  -- Preenchido quando a emissão gera (ou pode ter gerado) uma nota; aí sai da lista de rascunhos.
  invoice_id uuid references public.invoices(id) on delete set null,
  created_by uuid not null,
  updated_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index invoice_drafts_open_idx on public.invoice_drafts(organization_id, updated_at desc) where invoice_id is null;

alter table public.invoice_drafts enable row level security;
grant select on public.invoice_drafts to authenticated;
create policy invoice_drafts_member_select on public.invoice_drafts for select to authenticated using (private.is_member(organization_id));
-- Escrita só pelo servidor (service role), depois de conferir o vínculo do usuário com a empresa.

commit;
