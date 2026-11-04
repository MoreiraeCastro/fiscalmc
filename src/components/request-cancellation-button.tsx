"use client";

import { LoaderCircle, XCircle } from "@/components/icons";
import { useState } from "react";
import { apiUrl } from "@/lib/base-path";

export function RequestCancellationButton({ invoiceId }: { invoiceId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  function closeDialog() {
    setOpen(false);
    setReason("");
    setIdempotencyKey(crypto.randomUUID());
  }

  async function submit() {
    setLoading(true); setMessage("");
    try {
      const response = await fetch(apiUrl(`/api/invoices/${invoiceId}/cancellation-requests`), { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey }, body: JSON.stringify({ reason }) });
      const body = await response.json() as { error?: string; message?: string };
      setMessage(response.ok ? body.message ?? "Solicitação registrada." : body.error ?? "Não foi possível solicitar o cancelamento." );
      if (response.ok) closeDialog();
    } catch { setMessage("Não foi possível solicitar o cancelamento."); } finally { setLoading(false); }
  }
  return <div className="cancellation-request"><button className="button secondary" type="button" onClick={() => setOpen(true)}><XCircle size={17} />Solicitar cancelamento</button>{open ? <div className="v2-inline-dialog" role="dialog" aria-modal="true" aria-label="Solicitar cancelamento"><label>Motivo do cancelamento<textarea className="input" value={reason} onChange={(event) => setReason(event.target.value)} minLength={10} maxLength={500} /></label><p>A solicitação será analisada pela Moreira & Castro.</p><div><button className="button ghost" type="button" onClick={closeDialog} disabled={loading}>Voltar</button><button className="button primary" type="button" disabled={loading || reason.trim().length < 10} onClick={submit}>{loading ? <><LoaderCircle className="spin" size={17} />Enviando…</> : "Enviar solicitação"}</button></div></div> : null}{message ? <p aria-live="polite">{message}</p> : null}</div>;
}
