-- NFS-e Recebidas: documentos distribuídos pelo ADN (GET /contribuintes/DFe/{ultimoNSU}?lote=true, com o A1 da empresa).
-- O ADN entrega tudo em que o CNPJ aparece (notas emitidas por ele, recebidas como tomador ou intermediário, e eventos);
-- guarda-se tudo com o papel da empresa, e a tela de Recebidas mostra só tomador/intermediário.
-- Só o servidor lê e grava (RLS ligado sem política): o portal consulta pelo cliente administrativo depois de checar a empresa.

create table if not exists public.received_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  environment text not null check (environment in ('PRODUCTION', 'PRODUCTION_RESTRICTED')),
  nsu bigint not null check (nsu > 0),
  access_key text not null,
  document_type text not null,
  event_type text,
  role text not null check (role in ('PRESTADOR', 'TOMADOR', 'INTERMEDIARIO', 'OUTRO')),
  generated_at timestamptz,
  xml text not null,
  -- Resumo da NFS-e para a lista (nulo nos eventos).
  nfse_number text,
  issued_at timestamptz,
  competence date,
  issuer_tax_id text,
  issuer_name text,
  issuer_municipality_code text,
  customer_tax_id text,
  customer_name text,
  national_tax_code text,
  amount_cents bigint,
  net_cents bigint,
  iss_cents bigint,
  iss_withheld boolean,
  -- Preenchido quando chega o evento de cancelamento da mesma chave.
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, environment, nsu)
);

create index if not exists received_documents_list_idx on public.received_documents (organization_id, environment, role, issued_at desc);
create index if not exists received_documents_key_idx on public.received_documents (organization_id, access_key);

create table if not exists public.received_document_cursors (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  environment text not null check (environment in ('PRODUCTION', 'PRODUCTION_RESTRICTED')),
  last_nsu bigint not null default 0,
  last_sync_at timestamptz,
  last_status text,
  last_error text,
  -- Depois de um 429 do ADN ou de uma falha, a próxima leitura espera até aqui.
  next_allowed_at timestamptz,
  -- Trava para duas leituras da mesma empresa não rodarem juntas (timer + botão).
  locked_until timestamptz,
  documents_total bigint not null default 0,
  primary key (organization_id, environment)
);

alter table public.received_documents enable row level security;
alter table public.received_document_cursors enable row level security;

comment on table public.received_documents is 'Documentos fiscais distribuídos pelo ADN para a empresa (NFS-e e eventos), com o papel dela em cada um.';
comment on table public.received_document_cursors is 'Último NSU lido da distribuição do ADN por empresa e ambiente.';
