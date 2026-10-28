"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, CircleDashed, LoaderCircle, RefreshCw, X } from "lucide-react";
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
 * Teste de emissão na ficha da empresa. Roda sozinho (certificado enviado, configuração fiscal salva, serviço aprovado)
 * e não aparece quando está tudo certo: só mostra o que impediria a primeira nota e como resolver.
 */
export function EmissionCheckCard({ organizationId, initial }: { organizationId: string; initial: EmissionCheck | null }) {
  const router = useRouter();
  const [check, setCheck] = useState(initial);
  const [running, setRunning] = useState(false);
  const [fixed, setFixed] = useState(false);
  const [error, setError] = useState("");

  async function run() {
    setRunning(true);
    setError("");
    try {
      const response = await fetch(apiUrl(`/api/admin/organizations/${organizationId}/emission-check`), { method: "POST" });
      const body = await response.json() as EmissionCheck & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Não foi possível testar agora.");
      setCheck(body);
      setFixed(body.ok);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível testar agora.");
    } finally {
      setRunning(false);
    }
  }

  if (fixed) return <section className="v2-panel emission-check is-fixed"><p><Check size={16} aria-hidden />Resolvido: a empresa está pronta para emitir.</p></section>;
  if (!check || check.ok) return null;
  const fails = check.steps.filter((s) => s.status === "fail");
  return <section className="v2-panel emission-check" role="alert">
    <div className="v2-panel-heading">
      <div><h2>Esta empresa ainda não consegue emitir</h2><p>Resolva {fails.length === 1 ? "o item abaixo" : "os itens abaixo"} antes da primeira nota.</p></div>
    </div>
    <ol className="emission-check-steps">{fails.map((step) => <li key={step.key} className="is-fail">
      <span className="emission-check-icon">{ICON.fail}</span>
      <span><strong>{LABEL[step.key]}</strong><small>{step.detail}</small>{step.fix ? <em>{step.fix}</em> : null}</span>
    </li>)}</ol>
    {error ? <p className="emission-check-error">{error}</p> : null}
    <div className="emission-check-actions">
      <button type="button" className="button secondary" onClick={run} disabled={running}>
        {running ? <><LoaderCircle className="spin" size={16} aria-hidden />Conferindo…</> : <><RefreshCw size={16} aria-hidden />Já resolvi, conferir</>}
      </button>
    </div>
  </section>;
}
