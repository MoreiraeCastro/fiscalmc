"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, LoaderCircle, ShieldCheck } from "@/components/icons";
import { apiUrl } from "@/lib/base-path";

export function EmissionBlockToggle({ organizationId, blocked, readinessComplete }: { organizationId: string; blocked: boolean; readinessComplete: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function confirmRelease() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(apiUrl(`/api/admin/organizations/${organizationId}`), { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "release" }) });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Não foi possível liberar a emissão.");
      setOpen(false);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível liberar a emissão.");
      setLoading(false);
    }
  }

  if (!blocked) return null;
  return <div className="emission-block-toggle">
    <button className="button primary" type="button" onClick={() => setOpen(true)} disabled={!readinessComplete} title={readinessComplete ? undefined : "Resolva as pendências de prontidão antes de liberar a emissão."}><ShieldCheck size={18} />Liberar emissão</button>
    {open ? <div className="v2-inline-dialog v2-inline-dialog-danger" role="alertdialog" aria-modal="true" aria-label="Confirmar liberação de emissão">
      <div className="v2-dialog-warning"><AlertTriangle size={20} aria-hidden /><strong>TEM CERTEZA QUE QUER LIBERAR A EMISSÃO REAL PARA ESSA EMPRESA?</strong></div>
      <p>A partir de agora, notas emitidas para esta empresa têm validade fiscal real perante o governo.</p>
      {error ? <p role="alert" className="v2-dialog-error">{error}</p> : null}
      <div><button className="button ghost" type="button" onClick={() => { setOpen(false); setError(""); }} disabled={loading}>Cancelar</button><button className="button primary" type="button" disabled={loading} onClick={confirmRelease}>{loading ? <><LoaderCircle className="spin" size={17} />Liberando…</> : "Sim, liberar emissão"}</button></div>
    </div> : null}
  </div>;
}
