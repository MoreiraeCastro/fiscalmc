begin;

-- Substituição de NFS-e (grupo subst da DPS): a nota nova aponta para a substituída. Ao ser autorizada, a SEFIN
-- registra o cancelamento por substituição (e105102) na original, que aqui passa a CANCELLED.
alter table public.invoices
  add column substitutes_invoice_id uuid references public.invoices(id) on delete restrict,
  add column substitution_reason_code text check (substitution_reason_code is null or substitution_reason_code in ('01','02','03','04','05','99')),
  add column substitution_reason text check (substitution_reason is null or length(substitution_reason) between 15 and 255),
  add column cancelled_at timestamptz;
create index invoices_substitutes_idx on public.invoices(substitutes_invoice_id) where substitutes_invoice_id is not null;

-- NFS-e sem tomador (Tomador/Adquirente não informado): a DPS sai sem o grupo toma.
alter table public.invoices alter column customer_id drop not null;

-- XML do evento de cancelamento (101101) devolvido pela SEFIN, guardado como os outros documentos oficiais.
alter table public.fiscal_artifacts drop constraint fiscal_artifacts_artifact_type_check;
alter table public.fiscal_artifacts add constraint fiscal_artifacts_artifact_type_check
  check (artifact_type in ('DPS_XML','NFSE_XML','DANFSE_PDF','CANCELLATION_EVENT_XML'));

commit;
