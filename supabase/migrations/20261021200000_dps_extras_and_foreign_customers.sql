begin;

-- Tomador no exterior: NIF (ou motivo de não ter) e endereço no exterior (cidade e código postal; país em country_code,
-- estado/província em state). Estrangeiro não tem tax_id: a unicidade passa a valer só para CPF/CNPJ e NIF informados.
alter table public.customers
  add column foreign_tax_id text check (foreign_tax_id is null or char_length(foreign_tax_id) between 1 and 40),
  add column no_foreign_tax_id_reason text check (no_foreign_tax_id_reason is null or no_foreign_tax_id_reason in ('1','2')),
  add column city text,
  add column foreign_postal_code text check (foreign_postal_code is null or char_length(foreign_postal_code) between 1 and 11);

alter table public.customers drop constraint customers_organization_id_tax_id_key;
create unique index customers_organization_tax_id_key on public.customers(organization_id, tax_id) where tax_id is not null;
create unique index customers_organization_foreign_tax_id_key on public.customers(organization_id, foreign_tax_id) where foreign_tax_id is not null;

-- Grupos opcionais da DPS que vêm do Portal Contribuinte (intermediário, informações complementares, comércio exterior,
-- descontos e tributação federal). Guardados com a nota para a reemissão idempotente montar a mesma DPS.
alter table public.invoices add column dps_extras jsonb;

commit;

-- Empresa nova já nasce liberada para emitir (a emissão continua exigindo perfil fiscal, serviço e certificado prontos).
begin;
alter table public.organizations alter column emission_blocked set default false;
alter table public.organizations alter column status set default 'ACTIVE';
commit;
