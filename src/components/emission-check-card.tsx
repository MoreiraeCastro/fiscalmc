"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, CircleDashed, LoaderCircle, PlayCircle, X } from "lucide-react";
import { apiUrl } from "@/lib/base-path";
import type { CheckStatus, CheckStepKey, EmissionCheck } from "@/lib/operations/emission-check";

const LABEL: Record<CheckStepKey, string> = {
  cadastro: "Cadastro da empresa",
  certificado: "Certificado A1",
  conexao: "Conexão com o sistema nacional",
  fiscal: "Configuração fiscal",
  servico: "Serviço e alíquota do município",
  ensaio: "Nota de ensaio (montada e assinada)",
  restrita: "Nota de teste na Produção Restrita",
};
const ICON: Record<CheckStatus, React.ReactNode> = {
  ok: <Check size={16} aria-hidden />, warn: <AlertTriangle size={15} aria-hidden />, fail: <X size={16} aria-hidden />, skip: <CircleDashed size={15} aria-hidden />,
};

/**
 * Teste de emissão na ficha da empresa: mostra o último resultado e roda de novo. Prova, sem emitir nada com valor
 * fiscal, que a primeira nota vai sair (cadastro, certificado, conexão, configuração, serviço, DPS e Receita).
 */
export function EmissionCheckCard({ organizationId, initial }: { organizationId: string; initial: EmissionCheck | null }) {
  const router = useRouter();
  const [check, setCheck] = useState(initial);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  async function run() {
    setRunning(true);
    setError("");
    try {
      const response = await fetch(apiUrl(`/api/admin/organizations/${organizationId}/emission-check`), { method: "POST" });
      const body = await response.json() as EmissionCheck & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Não foi possível rodar o teste agora.");
      setCheck(body);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível rodar o teste agora.");
    } finally {
      setRunning(false);
    }
  }

  const fails = check?.steps.filter((s) => s.status === "fail").length ?? 0;
  return <section className="v2-panel emission-check">
    <div className="v2-panel-heading">
      <div><h2>Teste de emissão</h2><p>{check ? `Último teste: ${new Date(check.at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}` : "Prova que a primeira nota vai sair, sem emitir nada com valor fiscal."}</p></div>
      {check ? <span className={`emission-check-verdict ${check.ok ? "ok" : "fail"}`}>{check.ok ? "Pronta para emitir" : `${fails} problema(s)`}</span> : null}
    </div>
    {check ? <ol className="emission-check-steps">{check.steps.map((step) => <li key={step.key} className={`is-${step.status}`}>
      <span className="emission-check-icon">{ICON[step.status]}</span>
      <span><strong>{LABEL[step.key]}</strong><small>{step.detail}</small>{step.fix && step.status !== "ok" ? <em>{step.fix}</em> : null}</span>
    </li>)}</ol> : <p className="emission-check-empty">Esta empresa ainda não foi testada.</p>}
    {error ? <p className="emission-check-error" role="alert">{error}</p> : null}
    <div className="emission-check-actions">
      <button type="button" className="button secondary" onClick={run} disabled={running}>
        {running ? <><LoaderCircle className="spin" size={16} aria-hidden />Testando… (leva até 1 minuto)</> : <><PlayCircle size={16} aria-hidden />{check ? "Rodar o teste de novo" : "Rodar teste de emissão"}</>}
      </button>
      <small>Inclui uma nota de teste na Produção Restrita, sem valor fiscal.</small>
    </div>
  </section>;
}
