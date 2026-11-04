"use client";

import Link from "next/link";
import { Check, ChevronLeft, ChevronRight, FileCheck2, FileText, LoaderCircle, Search, Send, UserPlus, WifiOff } from "@/components/icons";
import { useEffect, useState } from "react";
import { getInvoicePresentation } from "@/lib/invoices/presentation";
import { canAdvanceClientIssuance, clientIssuanceSteps, getCatalogSelectionOutcome, mergeCatalogPage, type ClientIssuanceStep } from "@/lib/issuance/client-flow";
import { apiUrl } from "@/lib/base-path";

export type IssueCustomer = { id: string; legalName: string; taxId?: string | null };
export type IssueService = { id: string; name: string; defaultDescription?: string | null; requiresManualIssRate?: boolean };
type Props = { customers: IssueCustomer[]; services: IssueService[]; mock?: boolean; issuanceOrganizationId?: string; requiresProductionConfirmation?: boolean; catalogEnabled?: boolean };
type Result = { status: "ISSUED" | "REJECTED" | "UNKNOWN"; invoiceId?: string; nfseNumber?: string | null; safeMessage: string };
type CatalogItem = { id: string; description: string; added: boolean };
type CatalogServiceResult = { service?: { id: string; name: string; default_description?: string | null; workflow_status?: string }; autoReady?: boolean; duplicate?: boolean; error?: string };

function formatDate(value: string) { return value ? new Intl.DateTimeFormat("pt-BR").format(new Date(`${value}T12:00:00`)) : "Não informado"; }
function formatAmount(value: string) { return value ? `R$ ${value}` : "R$ 0,00"; }
function maskCurrencyInput(raw: string) {
  const digits = raw.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  if (!digits) return "";
  const cents = digits.padStart(3, "0");
  const integerPart = cents.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${integerPart},${cents.slice(-2)}`;
}

export function IssueForm({ customers, services, mock = false, issuanceOrganizationId, requiresProductionConfirmation = false, catalogEnabled = false }: Props) {
  const [availableServices, setAvailableServices] = useState(services);
  const [availableCustomers, setAvailableCustomers] = useState(customers);
  const [selectedCustomerId, setCustomerId] = useState(customers[0]?.id ?? "");
  const [selectedServiceTemplateId, setServiceId] = useState(services[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState(services[0]?.defaultDescription ?? "");
  const [step, setStep] = useState<ClientIssuanceStep>(0);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [productionConfirmed, setProductionConfirmed] = useState(false);
  const [manualIssRatePercent, setManualIssRatePercent] = useState("");
  const [manualIssRateSourceNote, setManualIssRateSourceNote] = useState("");
  const isOffice = Boolean(issuanceOrganizationId);
  const customer = availableCustomers.find((item) => item.id === selectedCustomerId);
  const service = availableServices.find((item) => item.id === selectedServiceTemplateId);
  const needsManualIssRate = isOffice && Boolean(service?.requiresManualIssRate);
  const manualIssRateGiven = !needsManualIssRate || (manualIssRatePercent.trim() !== "" && manualIssRateSourceNote.trim() !== "");
  const canContinue = canAdvanceClientIssuance({ step, hasCustomer: Boolean(customer), hasService: Boolean(service), amount, date, description });
  const canIssue = canContinue && manualIssRateGiven;

  function changed(action: () => void) { action(); setError(""); }
  function goTo(next: ClientIssuanceStep) { setError(""); setStep(next); }
  function selectService(value: string) {
    changed(() => {
      const next = availableServices.find((item) => item.id === value);
      setServiceId(value);
      if (next?.defaultDescription && description === service?.defaultDescription) setDescription(next.defaultDescription);
    });
  }

  function selectNewCustomer(next: IssueCustomer) {
    setAvailableCustomers((current) => [next, ...current]);
    changed(() => setCustomerId(next.id));
  }

  function selectCatalogService(next: IssueService) {
    setAvailableServices((current) => current.some((item) => item.id === next.id) ? current.map((item) => item.id === next.id ? next : item) : [next, ...current]);
    changed(() => {
      setServiceId(next.id);
      if (next.defaultDescription && (!description || description === service?.defaultDescription)) setDescription(next.defaultDescription);
    });
  }

  async function issue() {
    if (step !== 3 || !canIssue) return;
    setSubmitting(true);
    setStep(4);
    try {
      const manualIssRateBasisPoints = needsManualIssRate ? Math.round(parseFloat(manualIssRatePercent.replace(",", ".")) * 100) : undefined;
      const response = await fetch(apiUrl("/api/invoices"), {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({
          ...(issuanceOrganizationId ? { organizationId: issuanceOrganizationId } : {}),
          customerId: selectedCustomerId,
          serviceTemplateId: selectedServiceTemplateId,
          amount: amount.replace(/\./g, "").replace(",", "."),
          serviceDate: date,
          description,
          ...(requiresProductionConfirmation ? { productionConfirmation: productionConfirmed } : {}),
          ...(mock ? { scenario: "success" } : {}),
          ...(manualIssRateBasisPoints !== undefined && !Number.isNaN(manualIssRateBasisPoints) ? { manualIssRateBasisPoints, manualIssRateSourceNote: manualIssRateSourceNote.trim() } : {}),
        }),
      });
      const payload = await response.json() as Result & { error?: string };
      if (payload.status === "REJECTED" || payload.status === "UNKNOWN" || payload.status === "ISSUED") {
        setResult(payload);
        setIdempotencyKey(crypto.randomUUID());
        return;
      }
      if (!response.ok) throw new Error("ISSUANCE_NOT_COMPLETED");
      setResult(payload);
      setIdempotencyKey(crypto.randomUUID());
    } catch {
      setStep(3);
      setError("Não foi possível emitir a nota. Alguns dados precisam ser revisados antes de tentar novamente.");
    } finally { setSubmitting(false); }
  }

  if (result) return <IssuanceResult result={result} customer={customer} amount={amount} mock={mock} onAgain={() => { setResult(null); setStep(0); setError(""); setIdempotencyKey(crypto.randomUUID()); }} />;
  if (!availableServices.length && !catalogEnabled) return <section className="issuance-empty"><FileText size={24} aria-hidden /><div><h2>Nenhum serviço está disponível para emissão.</h2><p>Gerencie os serviços da empresa para deixar um serviço pronto para emitir.</p><Link className="button primary" href="/app/servicos">Gerenciar meus serviços</Link></div></section>;

  const currentTitle = clientIssuanceSteps[step] ?? "Emitir";
  return <section className="issuance-experience">
    <ol className="issuance-stepper" aria-label="Etapas da emissão">{clientIssuanceSteps.map((label, index) => <li className={index < step ? "done" : index === step ? "active" : ""} key={label}><span>{index < step ? <Check size={14} aria-hidden /> : index + 1}</span><strong>{label}</strong><i aria-hidden /></li>)}</ol>
    <div className="issuance-mobile-progress" aria-label={`Etapa ${Math.min(step + 1, 5)} de 5: ${currentTitle}`}><div><span>Etapa {Math.min(step + 1, 5)} de 5</span><strong>{currentTitle}</strong></div><i><b style={{ width: `${Math.min(((step + 1) / 5) * 100, 100)}%` }} /></i></div>
    {error ? <div className="alert error issuance-error" role="alert"><WifiOff size={17} aria-hidden />{error}</div> : null}
    <div className="issuance-layout">
      <form className="issuance-form" onSubmit={(event) => event.preventDefault()}>
        {step === 0 ? <RecipientStep customers={availableCustomers} selectedCustomerId={selectedCustomerId} onChange={(value) => changed(() => setCustomerId(value))} isOffice={isOffice} issuanceOrganizationId={issuanceOrganizationId} onCreated={selectNewCustomer} /> : null}
        {step === 1 ? <ServiceStep services={availableServices} selectedServiceId={selectedServiceTemplateId} onChange={selectService} catalogEnabled={catalogEnabled} onCatalogReady={selectCatalogService} issuanceOrganizationId={issuanceOrganizationId} /> : null}
        {step === 2 ? <ValuesStep amount={amount} date={date} description={description} onAmount={(value) => changed(() => setAmount(value))} onDate={(value) => changed(() => setDate(value))} onDescription={(value) => changed(() => setDescription(value))} /> : null}
        {step === 3 ? <ReviewStep customer={customer} service={service} amount={amount} date={date} description={description} onEdit={goTo} requiresProductionConfirmation={requiresProductionConfirmation} productionConfirmed={productionConfirmed} onConfirm={setProductionConfirmed} needsManualIssRate={needsManualIssRate} manualIssRatePercent={manualIssRatePercent} onManualIssRatePercent={setManualIssRatePercent} manualIssRateSourceNote={manualIssRateSourceNote} onManualIssRateSourceNote={setManualIssRateSourceNote} /> : null}
        {step === 4 ? <ProcessingState /> : null}
        {step < 4 ? <IssuanceActions step={step} canContinue={canContinue} canIssue={canIssue} submitting={submitting} requiresProductionConfirmation={requiresProductionConfirmation} productionConfirmed={productionConfirmed} onBack={() => goTo((step - 1) as ClientIssuanceStep)} onContinue={() => goTo((step + 1) as ClientIssuanceStep)} onIssue={issue} /> : null}
      </form>
      <IssuanceSummary customer={customer} service={service} amount={amount} date={date} description={description} showOnMobile={step === 3} />
    </div>
  </section>;
}

function RecipientStep({ customers, selectedCustomerId, onChange, isOffice, issuanceOrganizationId, onCreated }: { customers: IssueCustomer[]; selectedCustomerId: string; onChange: (value: string) => void; isOffice?: boolean; issuanceOrganizationId?: string; onCreated?: (customer: IssueCustomer) => void }) {
  return <section className="issuance-step"><span className="issuance-kicker">Etapa 1</span><h2>Tomador</h2><p>Quem receberá esta nota?</p>{customers.length ? <label className="field"><span>Tomador do serviço</span><select className="input" id="customer" value={selectedCustomerId} onChange={(event) => onChange(event.target.value)}>{customers.map((item) => <option value={item.id} key={item.id}>{item.legalName}{item.taxId ? ` — ${item.taxId}` : ""}</option>)}</select></label> : null}
    {isOffice && issuanceOrganizationId ? <OfficeAddCustomer organizationId={issuanceOrganizationId} hasCustomers={customers.length > 0} onCreated={(customer) => onCreated?.(customer)} /> : !customers.length ? <div className="v2-inline-empty"><div><strong>Nenhum tomador cadastrado.</strong><p>Cadastre um tomador sem perder os dados desta emissão.</p></div><Link className="button secondary" href="/app/tomadores"><UserPlus size={17} aria-hidden />Novo tomador</Link></div> : null}
  </section>;
}

function OfficeAddCustomer({ organizationId, hasCustomers, onCreated }: { organizationId: string; hasCustomers: boolean; onCreated: (customer: IssueCustomer) => void }) {
  const [open, setOpen] = useState(!hasCustomers);
  const [legalName, setLegalName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function create() {
    setSaving(true);
    setError("");
    try {
      const digits = taxId.replace(/\D/g, "");
      const personType = digits.length === 14 ? "COMPANY" : digits.length === 11 ? "INDIVIDUAL" : null;
      if (!personType) { setError("Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) válido."); return; }
      const response = await fetch(apiUrl(`/api/admin/organizations/${organizationId}/customers`), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ personType, taxId, legalName }) });
      const result = await response.json() as { customer?: { id: string; legal_name: string; tax_id: string | null }; error?: string };
      if (!response.ok || !result.customer) { setError(result.error ?? "Não foi possível cadastrar o tomador."); return; }
      onCreated({ id: result.customer.id, legalName: result.customer.legal_name, taxId: result.customer.tax_id });
      setOpen(false);
      setLegalName("");
      setTaxId("");
    } catch {
      setError("Não foi possível cadastrar o tomador.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return <button className="text-button" type="button" onClick={() => setOpen(true)}><UserPlus size={15} aria-hidden />+ Cadastrar novo tomador</button>;
  return <div className="mapping-create"><label>Razão social / Nome<input className="input" value={legalName} onChange={(event) => setLegalName(event.target.value)} placeholder="Nome do tomador" /></label><label>CPF ou CNPJ<input className="input" value={taxId} onChange={(event) => setTaxId(event.target.value)} placeholder="Somente números ou formatado" /></label>{error ? <p className="alert error">{error}</p> : null}<div className="v2-inline-actions">{hasCustomers ? <button className="button ghost compact" type="button" onClick={() => setOpen(false)} disabled={saving}>Cancelar</button> : null}<button className="button secondary compact" type="button" onClick={create} disabled={saving || legalName.trim().length < 2 || !taxId.trim()}>{saving ? "Cadastrando…" : "Cadastrar tomador"}</button></div></div>;
}

function ServiceStep({ services, selectedServiceId, onChange, catalogEnabled, onCatalogReady, issuanceOrganizationId }: { services: IssueService[]; selectedServiceId: string; onChange: (value: string) => void; catalogEnabled: boolean; onCatalogReady: (service: IssueService) => void; issuanceOrganizationId?: string }) {
  return <section className="issuance-step issuance-service-step"><span className="issuance-kicker">Etapa 2</span><h2>Serviço</h2><p>Qual serviço foi prestado?</p>
    <section className="issuance-service-company" aria-labelledby="company-services-heading"><div><span>Serviços da empresa</span><strong id="company-services-heading">Usados pela sua empresa</strong></div>{services.length ? <label className="field"><span className="sr-only">Serviço já configurado</span><select className="input" id="service" value={selectedServiceId} onChange={(event) => onChange(event.target.value)}><option value="">Selecione um serviço</option>{services.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label> : <p>{catalogEnabled ? "Nenhum serviço configurado ainda. Você pode procurar no catálogo oficial abaixo." : "Nenhum serviço configurado ainda. Peça ao escritório para liberar um serviço para emissão."}</p>}</section>
    {catalogEnabled && issuanceOrganizationId ? <IssuanceCatalog onReady={onCatalogReady} organizationId={issuanceOrganizationId} /> : null}
    {!catalogEnabled ? <SecondaryActivities /> : null}
  </section>;
}

type SecondaryActivity = { cnae: string; cnaeDescription: string; nationalServiceCodeId: string; description: string; added: boolean };

function SecondaryActivities() {
  const [items, setItems] = useState<SecondaryActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(apiUrl("/api/services/secondary-activities"));
        const result = await response.json() as { activities?: SecondaryActivity[]; error?: string };
        if (!response.ok) throw new Error(result.error ?? "Não foi possível carregar as atividades.");
        if (!cancelled) setItems(result.activities ?? []);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Não foi possível carregar as atividades.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function add(item: SecondaryActivity) {
    setAdding(item.nationalServiceCodeId);
    setError("");
    setMessage("");
    try {
      const response = await fetch(apiUrl("/api/services"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "add-secondary", nationalServiceCodeId: item.nationalServiceCodeId }) });
      const result = await response.json() as CatalogServiceResult;
      if (!response.ok) throw new Error(result.error ?? "Não foi possível selecionar a atividade.");
      setItems((current) => current.map((currentItem) => currentItem.nationalServiceCodeId === item.nationalServiceCodeId ? { ...currentItem, added: true } : currentItem));
      setMessage(result.duplicate ? "Essa atividade já está cadastrada." : "Solicitação enviada para revisão do escritório.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível selecionar a atividade.");
    } finally {
      setAdding(null);
    }
  }

  if (loading) return null;
  if (!items.length) return null;
  return <section className="issuance-catalog" aria-labelledby="secondary-activities-heading"><div className="issuance-catalog-heading"><div><span>Atividades secundárias</span><strong id="secondary-activities-heading">Do seu CNPJ, ainda não usadas</strong></div></div>{error ? <p className="alert error" role="alert">{error}</p> : null}{message ? <p className="issuance-catalog-message" role="status">{message}</p> : null}<div className="issuance-catalog-list">{items.map((item) => <div key={item.nationalServiceCodeId} className="issuance-catalog-row"><p>{item.description}</p><button className="button secondary compact" type="button" disabled={item.added || adding === item.nationalServiceCodeId} onClick={() => add(item)}>{item.added ? "Solicitado" : adding === item.nationalServiceCodeId ? "Enviando…" : "Selecionar"}</button></div>)}</div></section>;
}

function IssuanceCatalog({ onReady, organizationId }: { onReady: (service: IssueService) => void; organizationId: string }) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(apiUrl(`/api/services/catalog?q=${encodeURIComponent(query)}&page=${page}&organizationId=${organizationId}`), { signal: controller.signal });
        const result = await response.json() as { services?: CatalogItem[]; total?: number; hasMore?: boolean; error?: string };
        if (!response.ok) throw new Error(result.error ?? "Não foi possível carregar o catálogo.");
        const next = result.services ?? [];
        setItems((current) => mergeCatalogPage(current, next, page));
        setTotal(result.total ?? 0);
        setHasMore(Boolean(result.hasMore));
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Não foi possível carregar o catálogo.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 200);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [page, query, organizationId]);

  async function add(item: CatalogItem) {
    setAdding(item.id);
    setError("");
    setMessage("");
    try {
      const response = await fetch(apiUrl("/api/services"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "add-catalog", nationalServiceCodeId: item.id, organizationId }) });
      const result = await response.json() as CatalogServiceResult;
      if (!response.ok) throw new Error(result.error ?? "Não foi possível selecionar o serviço.");
      setItems((current) => current.map((currentItem) => currentItem.id === item.id ? { ...currentItem, added: true } : currentItem));
      const outcome = getCatalogSelectionOutcome(result);
      if (outcome.ready && result.service?.id && result.service?.name) {
        onReady({ id: result.service.id, name: result.service.name, defaultDescription: result.service.default_description });
        setMessage(outcome.message);
        return;
      }
      setMessage(outcome.message);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível selecionar o serviço.");
    } finally {
      setAdding(null);
    }
  }

  return <section className="issuance-catalog" aria-labelledby="catalog-heading"><div className="issuance-catalog-heading"><div><span>Catálogo completo</span><strong id="catalog-heading">Encontre o serviço prestado</strong></div><small>{total} opções disponíveis</small></div><label className="issuance-catalog-search"><span className="sr-only">Buscar serviço pelo nome ou descrição</span><Search size={17} aria-hidden /><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} placeholder="Buscar serviço pelo nome ou descrição" /></label>{error ? <p className="alert error" role="alert">{error}</p> : null}{message ? <p className="issuance-catalog-message" role="status">{message}{message.includes("configuração") ? <> <Link href="/app/servicos">Ver serviço</Link></> : null}</p> : null}<div className="issuance-catalog-list">{items.map((item) => <div key={item.id} className="issuance-catalog-row"><p>{item.description}</p><button className="button secondary compact" type="button" disabled={item.added || adding === item.id} onClick={() => add(item)}>{item.added ? "Adicionado" : adding === item.id ? "Adicionando…" : "Selecionar"}</button></div>)}{loading ? <p>Carregando opções…</p> : !items.length ? <p>Nenhum serviço encontrado. Tente uma busca diferente.</p> : null}</div><footer>{items.length ? `Mostrando ${items.length} de ${total} opções` : null}{hasMore ? <button className="text-button" type="button" disabled={loading} onClick={() => setPage((value) => value + 1)}>Mostrar mais serviços <ChevronRight size={15} aria-hidden /></button> : null}</footer></section>;
}

function ValuesStep({ amount, date, description, onAmount, onDate, onDescription }: { amount: string; date: string; description: string; onAmount: (value: string) => void; onDate: (value: string) => void; onDescription: (value: string) => void }) {
  return <section className="issuance-step"><span className="issuance-kicker">Etapa 3</span><h2>Valores</h2><p>Informe a data e o valor do serviço.</p><div className="issuance-value-grid"><label className="field"><span>Data da prestação</span><input className="input" id="date" type="date" value={date} onChange={(event) => onDate(event.target.value)} /></label><label className="field issuance-amount"><span>Valor</span><div className="money-input"><span>R$</span><input className="input" id="amount" inputMode="decimal" value={amount} placeholder="0,00" onChange={(event) => onAmount(maskCurrencyInput(event.target.value))} /></div></label></div><label className="field"><span>Descrição</span><textarea className="input" id="description" value={description} maxLength={1000} onChange={(event) => onDescription(event.target.value)} /></label></section>;
}

function ReviewStep({ customer, service, amount, date, description, onEdit, requiresProductionConfirmation, productionConfirmed, onConfirm, needsManualIssRate, manualIssRatePercent, onManualIssRatePercent, manualIssRateSourceNote, onManualIssRateSourceNote }: { customer?: IssueCustomer; service?: IssueService; amount: string; date: string; description: string; onEdit: (step: ClientIssuanceStep) => void; requiresProductionConfirmation: boolean; productionConfirmed: boolean; onConfirm: (value: boolean) => void; needsManualIssRate: boolean; manualIssRatePercent: string; onManualIssRatePercent: (value: string) => void; manualIssRateSourceNote: string; onManualIssRateSourceNote: (value: string) => void }) {
  return <section className="issuance-step issuance-review"><span className="issuance-kicker">Etapa 4</span><h2>Revisão</h2><p>Confira os dados antes de emitir.</p><dl><div><dt>Tomador</dt><dd><strong>{customer?.legalName ?? "Não informado"}</strong>{customer?.taxId ? <small>{customer.taxId}</small> : null}</dd><button type="button" onClick={() => onEdit(0)}>Editar</button></div><div><dt>Serviço</dt><dd><strong>{service?.name ?? "Não informado"}</strong><small>{service?.defaultDescription ?? ""}</small></dd><button type="button" onClick={() => onEdit(1)}>Editar</button></div><div><dt>Data da prestação</dt><dd><strong>{formatDate(date)}</strong></dd></div><div><dt>Valor</dt><dd className="issuance-review-total"><strong>{formatAmount(amount)}</strong></dd></div><div><dt>Descrição</dt><dd><strong>{description || "Não informado"}</strong></dd><button type="button" onClick={() => onEdit(2)}>Editar</button></div></dl>{needsManualIssRate ? <section className="alert warning issuance-manual-iss-rate"><strong>Esta empresa não tem de/para municipal cadastrado para este serviço</strong><p>Informe a alíquota de ISS confirmada e de onde ela veio (lei municipal, Econet, etc.). Isso fica registrado nesta nota.</p><label className="field"><span>Alíquota do ISS (%)</span><input className="input" inputMode="decimal" value={manualIssRatePercent} onChange={(event) => onManualIssRatePercent(event.target.value)} placeholder="Ex.: 2" /></label><label className="field"><span>Fonte da alíquota</span><input className="input" value={manualIssRateSourceNote} onChange={(event) => onManualIssRateSourceNote(event.target.value)} placeholder="Ex.: LC 966/2022, Tabela XII, item 4.01 — Porto Alegre/RS" /></label></section> : null}{requiresProductionConfirmation ? <section className="alert warning issuance-production-confirmation" aria-label="Confirmação de Produção"><strong>AMBIENTE: PRODUÇÃO</strong><p>Esta NFS-e terá validade fiscal.</p><label><input type="checkbox" checked={productionConfirmed} onChange={(event) => onConfirm(event.target.checked)} /> Confirmo a revisão desta operação e autorizo a emissão em Produção.</label></section> : null}</section>;
}

function IssuanceActions({ step, canContinue, canIssue, submitting, requiresProductionConfirmation, productionConfirmed, onBack, onContinue, onIssue }: { step: ClientIssuanceStep; canContinue: boolean; canIssue: boolean; submitting: boolean; requiresProductionConfirmation: boolean; productionConfirmed: boolean; onBack: () => void; onContinue: () => void; onIssue: () => void }) {
  const finalReview = step === 3;
  return <footer className="issuance-actions">{step > 0 ? <button className="button secondary" type="button" disabled={submitting} onClick={onBack}><ChevronLeft size={18} aria-hidden />Voltar</button> : <span />}{finalReview ? <button className="button primary" type="button" disabled={!canIssue || submitting || (requiresProductionConfirmation && !productionConfirmed)} onClick={onIssue}><Send size={18} aria-hidden />Emitir NFS-e</button> : <button className="button primary" type="button" disabled={!canContinue || submitting} onClick={onContinue}>Continuar<ChevronRight size={18} aria-hidden /></button>}</footer>;
}

function IssuanceSummary({ customer, service, amount, date, description, showOnMobile }: { customer?: IssueCustomer; service?: IssueService; amount: string; date: string; description: string; showOnMobile: boolean }) {
  return <aside className={`issuance-summary${showOnMobile ? " show-mobile" : ""}`}><div><span>Prévia</span><h2>Resumo da nota</h2></div><dl><div><dt>Tomador</dt><dd>{customer?.legalName ?? "Não informado"}</dd></div><div><dt>Serviço</dt><dd>{service?.name ?? "Não informado"}</dd></div><div><dt>Data</dt><dd>{formatDate(date)}</dd></div><div className="total"><dt>Valor</dt><dd>{formatAmount(amount)}</dd></div></dl>{description ? <p>{description}</p> : null}</aside>;
}

function ProcessingState() { return <section className="issuance-processing" role="status" aria-live="polite"><span><LoaderCircle className="spin" size={24} aria-hidden /></span><div><h2>Emitindo sua NFS-e…</h2><p>Isso pode levar alguns segundos.</p></div></section>; }

function IssuanceResult({ result, customer, amount, mock, onAgain }: { result: Result; customer?: IssueCustomer; amount: string; mock: boolean; onAgain: () => void }) {
  const presentation = getInvoicePresentation(result.status, result.safeMessage);
  const detailHref = result.invoiceId && !mock ? `/app/notas/${result.invoiceId}` : null;
  return <section className={`issuance-result is-${presentation.tone}`} role="status" aria-live="polite"><span><FileCheck2 size={26} aria-hidden /></span><div><p className="issuance-kicker">Resultado da emissão</p><h2>{presentation.title}</h2><p>{presentation.description}</p>{result.status === "ISSUED" ? <dl><div><dt>Número da nota</dt><dd>{result.nfseNumber ?? "Disponível na nota emitida"}</dd></div><div><dt>Tomador</dt><dd>{customer?.legalName ?? "Não informado"}</dd></div><div><dt>Valor</dt><dd>{formatAmount(amount)}</dd></div></dl> : null}{result.status === "UNKNOWN" ? <p className="issuance-result-note">Você pode sair desta tela. A nota continuará sendo acompanhada pelo sistema.</p> : null}<div className="issuance-result-actions">{detailHref ? <Link className="button primary" href={detailHref}>Ver nota</Link> : null}{detailHref && result.status === "ISSUED" ? <><a className="button secondary" href={`/api/invoices/${result.invoiceId}/artifacts/PDF`}>Baixar PDF</a><a className="button secondary" href={`/api/invoices/${result.invoiceId}/artifacts/NFSE_XML`}>Baixar XML</a></> : null}{result.status === "UNKNOWN" && detailHref ? <Link className="button secondary" href={detailHref}>Acompanhar situação</Link> : null}{result.status !== "UNKNOWN" ? <button className="button secondary" type="button" onClick={onAgain}>Emitir outra NFS-e</button> : null}</div></div></section>;
}
