begin;

-- Serviços Favoritos (como no Emissor Nacional): até 10 por empresa, com as informações que vêm pré-preenchidas
-- na emissão (serviço, descrição, tomador, valor, IBS/CBS). O limite de 10 é aplicado pelo servidor.
create table public.service_favorites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(name) between 2 and 80),
  data jsonb not null default '{}'::jsonb,
  created_by uuid not null,
  updated_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index service_favorites_organization_idx on public.service_favorites(organization_id, name);

alter table public.service_favorites enable row level security;
grant select on public.service_favorites to authenticated;
create policy service_favorites_member_select on public.service_favorites for select to authenticated using (private.is_member(organization_id));
-- Escrita só pelo servidor (service role), depois de conferir o vínculo do usuário com a empresa.

commit;
