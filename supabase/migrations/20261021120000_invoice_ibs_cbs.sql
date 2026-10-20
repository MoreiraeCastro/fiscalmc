begin;

-- Classificação IBS/CBS informada na emissão (CST, cClassTrib, cIndOp, indFinal, indDest), guardada na nota para que
-- uma nova tentativa da mesma emissão (mesma Idempotency-Key) monte exatamente a mesma DPS.
alter table public.invoices add column ibs_cbs jsonb;

commit;
