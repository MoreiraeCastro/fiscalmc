-- "Subiu o A1, está pronto": empresa nova emite sem revisão do escritório.
-- O perfil fiscal nasce automático (situação no Simples/MEI pela Receita) e os
-- serviços vêm da lista nacional + parâmetros municipais do ADN. A chave
-- require_office_review devolve a empresa ao fluxo antigo (só o que o escritório revisou).

alter table public.organizations
  add column if not exists require_office_review boolean not null default false;

comment on column public.organizations.require_office_review is
  'true = só emite com perfil fiscal e serviços revisados pelo escritório; false = aceita o perfil automático e os serviços automáticos do ADN.';

alter table public.tax_profiles
  add column if not exists origin text not null default 'OFFICE',
  add column if not exists automatic_source jsonb;

alter table public.tax_profiles
  drop constraint if exists tax_profiles_origin_check;
alter table public.tax_profiles
  add constraint tax_profiles_origin_check check (origin in ('OFFICE', 'AUTOMATIC'));

comment on column public.tax_profiles.origin is
  'OFFICE = configurado pelo escritório; AUTOMATIC = criado pela consulta de CNPJ (opção pelo Simples/MEI) e vale sem revisão.';
comment on column public.tax_profiles.automatic_source is
  'O que a consulta de CNPJ respondeu quando o perfil foi criado automaticamente (fonte, data, opção pelo Simples e MEI).';
