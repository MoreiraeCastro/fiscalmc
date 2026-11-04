"use client";

import { useState, type FormEvent } from "react";
import { CheckCircle2, ChevronDown, LoaderCircle, ShieldCheck, XCircle } from "@/components/icons";
import { apiUrl } from "@/lib/base-path";
import type { IssueService } from "@/components/issue-form";

type PreflightResult = {
  readiness: { registration: boolean; fiscal: boolean; service: boolean; certificate: boolean; clientAccess: boolean; organization: boolean };
  validation: { dpsBuilt: boolean; dynamicRules: boolean; unsignedXsd: boolean; xmldsig: boolean; signatureVerification: boolean; signedXsd: boolean; gzipBase64: boolean; payload: boolean; businessRules: boolean; pAliqEmitted: boolean };
  municipalParameters?: { lookupCode: string; conventionAvailable: boolean; aliquota: Array<{ incidence: string; rate: number; validFrom: string; validUntil: string | null }>; aliquotaHistoryAvailable: boolean; retentions: { articleSixthEnabled: boolean; matchingRules: unknown[] } };
  target: { environment: string; endpoint?: string; productionSequence?: { exists: boolean; series: string; nextNumber: number; provisionedOnFirstAuthorizedReservation?: boolean } };
  transmissionAttempted: boolean;
  sequenceConsumed: boolean;
  invoiceCreated: boolean;
};
type XsdDiagnostic = { errorCount: number; errors: string[] };

const readinessLabels: Array<[keyof PreflightResult["readiness"], string]> = [
  ["registration", "Cadastro"],
  ["fiscal", "Fiscal"],
  ["service", "Serviço"],
  ["certificate", "Certificado"],
];
const validationLabels: Array<[keyof PreflightResult["validation"], string]> = [
  ["dpsBuilt", "DPS construída"],
  ["dynamicRules", "Parâmetros oficiais"],
  ["unsignedXsd", "XSD da DPS"],
  ["xmldsig", "XMLDSIG"],
  ["signatureVerification", "Assinatura verificada"],
  ["signedXsd", "XSD da DPS assinada"],
  ["gzipBase64", "GZip/Base64"],
  ["payload", "Payload"],
  ["businessRules", "Regras de negócio"],
];

export function EmissionPreflight({ organizationId, canRun, services }: { organizationId: string; canRun: boolean; services: IssueService[] }) {
  const [result, setResult] = useState<PreflightResult | null>(null);
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [xsdDiagnostic, setXsdDiagnostic] = useState<XsdDiagnostic | null>(null);
  const [running, setRunning] = useState(false);
  const [serviceTemplateId, setServiceTemplateId] = useState(services[0]?.id ?? "");
  const [operation, setOperation] = useState({
    taxId: "",
    legalName: "",
    street: "",
    addressNumber: "",
    neighborhood: "",
    postalCode: "",
    municipalityCode: "",
    state: "",
    amount: "",
    competence: "",
    description: "",
    targetEnvironment: "PRODUCTION_RESTRICTED",
  });

  function updateField(field: keyof typeof operation, value: string) {
    setOperation((current) => ({ ...current, [field]: value }));
  }

  async function run(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = operation.amount.replace(/\s/g, "").replace(",", ".");
    if (!/^\d+(?:\.\d{1,2})?$/.test(amount)) {
      setError("Informe o valor da operação de teste.");
      return;
    }
    if (!serviceTemplateId) {
      setError("Selecione o serviço a validar.");
      return;
    }
    setRunning(true);
    setError("");
    setErrorCode("");
    setXsdDiagnostic(null);
    setResult(null);
    try {
      const response = await fetch(apiUrl(`/api/admin/organizations/${organizationId}/emission-preflight`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceTemplateId,
          customer: {
            taxId: operation.taxId,
            legalName: operation.legalName,
            street: operation.street,
            addressNumber: operation.addressNumber,
            neighborhood: operation.neighborhood,
            postalCode: operation.postalCode,
            municipalityCode: operation.municipalityCode,
            state: operation.state,
          },
          amountCents: Math.round(Number(amount) * 100),
          competence: operation.competence,
          description: operation.description,
          targetEnvironment: operation.targetEnvironment,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setError(data?.error ?? "Não foi possível concluir a pré-validação.");
        setErrorCode(typeof data?.code === "string" ? data.code : "");
        setXsdDiagnostic(isXsdDiagnostic(data?.xsdDiagnostic) ? data.xsdDiagnostic : null);
        return;
      }
      setResult(data as PreflightResult);
    } catch {
      setError("Não foi possível concluir a pré-validação agora. Tente novamente.");
      setErrorCode("");
      setXsdDiagnostic(null);
    } finally {
      setRunning(false);
    }
  }

  if (!canRun) return null;
  return <details className="v2-panel emission-preflight">
    <summary className="v2-panel-heading">
      <div>
        <p className="eyebrow">Diagnóstico técnico</p>
        <h2>Validar antes de transmitir</h2>
        <p>Monta e assina uma DPS de teste no servidor, sem criar nota, reservar sequência ou transmitir.</p>
      </div>
      <span className="emission-preflight-summary-icons"><ShieldCheck size={22} aria-hidden="true" /><ChevronDown className="emission-preflight-chevron" size={18} aria-hidden="true" /></span>
    </summary>
    <form className="emission-preflight-form" onSubmit={run}>
      <p className="form-help full">Os dados são usados somente nesta validação autenticada e não criam uma nota.</p>
      {services.length ? <label className="full">Serviço a validar<select value={serviceTemplateId} onChange={(event) => setServiceTemplateId(event.target.value)}>{services.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label> : <p className="alert full">Nenhum serviço apto para emissão nesta empresa ainda.</p>}
      <label>CNPJ do tomador<input value={operation.taxId} onChange={(event) => updateField("taxId", event.target.value)} inputMode="numeric" required /></label>
      <label>Razão social do tomador<input value={operation.legalName} onChange={(event) => updateField("legalName", event.target.value)} required /></label>
      <label>Logradouro<input value={operation.street} onChange={(event) => updateField("street", event.target.value)} required /></label>
      <label>Número<input value={operation.addressNumber} onChange={(event) => updateField("addressNumber", event.target.value)} required /></label>
      <label>Bairro<input value={operation.neighborhood} onChange={(event) => updateField("neighborhood", event.target.value)} required /></label>
      <label>CEP<input value={operation.postalCode} onChange={(event) => updateField("postalCode", event.target.value)} inputMode="numeric" required /></label>
      <label>Código IBGE do município<input value={operation.municipalityCode} onChange={(event) => updateField("municipalityCode", event.target.value)} inputMode="numeric" required /></label>
      <label>UF<input value={operation.state} onChange={(event) => updateField("state", event.target.value.toUpperCase())} maxLength={2} required /></label>
      <label>Valor (R$)<input value={operation.amount} onChange={(event) => updateField("amount", event.target.value)} inputMode="decimal" placeholder="0,00" required /></label>
      <label>Competência<input value={operation.competence} onChange={(event) => updateField("competence", event.target.value)} type="date" required /></label>
      <label>Ambiente de pré-validação<select value={operation.targetEnvironment} onChange={(event) => updateField("targetEnvironment", event.target.value)}><option value="PRODUCTION_RESTRICTED">Produção Restrita</option><option value="PRODUCTION">Produção (somente leitura)</option></select></label>
      <label className="full">Descrição<textarea value={operation.description} onChange={(event) => updateField("description", event.target.value)} rows={3} required /></label>
      <div className="full emission-preflight-actions"><button className="button secondary" type="submit" disabled={running || !services.length}>
        {running ? <><LoaderCircle className="spin" size={17} />Pré-validando…</> : "Pré-validar emissão"}
      </button></div>
    </form>
    {error ? <div className="alert error" role="alert"><p>{error}{errorCode ? <><br />Código: <strong>{errorCode}</strong></> : null}</p>{xsdDiagnostic ? <div className="emission-preflight-xsd-errors"><strong>Erros XSD ({xsdDiagnostic.errorCount})</strong><ol>{xsdDiagnostic.errors.map((entry, index) => <li key={`${index}-${entry}`}>{entry}</li>)}</ol></div> : null}</div> : null}
    {result ? <div className="emission-preflight-result" aria-live="polite">
      <strong>Pré-validação concluída</strong>
      <div className="emission-preflight-grid">
        <div>{readinessLabels.map(([key, label]) => <StatusLine key={key} label={label} passed={result.readiness[key]} />)}</div>
        <div>{validationLabels.map(([key, label]) => <StatusLine key={key} label={label} passed={result.validation[key]} />)}</div>
      </div>
      <p>Ambiente alvo: <strong>{result.target.environment === "PRODUCTION" ? "Produção — pré-validação somente leitura" : "Produção Restrita"}</strong></p>
      {result.target.productionSequence ? <p>Sequência de Produção: <strong>{result.target.productionSequence.exists ? `${result.target.productionSequence.series}/${result.target.productionSequence.nextNumber}` : "será criada apenas na primeira reserva autorizada"}</strong></p> : null}
      {result.municipalParameters ? <p>Parâmetros oficiais: <strong>convênio {result.municipalParameters.conventionAvailable ? "consultado" : "indisponível"}; alíquota {result.municipalParameters.aliquota.map((rate) => `${rate.rate}% (${rate.incidence})`).join(", ")}; histórico {result.municipalParameters.aliquotaHistoryAvailable ? "consultado" : "indisponível"}; retenções compatíveis {result.municipalParameters.retentions.matchingRules.length}</strong></p> : null}
      <p>Alíquota na DPS: <strong>{result.validation.pAliqEmitted ? "informada" : "não informada"}</strong></p>
      <p>Transmissão: <strong>NÃO EXECUTADA</strong></p>
    </div> : null}
  </details>;
}

function StatusLine({ label, passed }: { label: string; passed: boolean }) {
  return <span className={passed ? "is-pass" : "is-fail"}>{passed ? <CheckCircle2 size={16} aria-hidden="true" /> : <XCircle size={16} aria-hidden="true" />}{label}: {passed ? "PASS" : "FAIL"}</span>;
}

function isXsdDiagnostic(value: unknown): value is XsdDiagnostic {
  return Boolean(value && typeof value === "object" && "errorCount" in value && typeof value.errorCount === "number" && "errors" in value && Array.isArray(value.errors) && value.errors.every((entry) => typeof entry === "string"));
}
