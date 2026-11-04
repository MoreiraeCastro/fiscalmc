"use client";

import { AlertTriangle, LoaderCircle, Trash2 } from "@/components/icons";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiUrl } from "@/lib/base-path";

export function DeleteOrganizationButton({ organizationId, organizationName }: { organizationId: string; organizationName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function confirmDelete() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(apiUrl(`/api/admin/organizations/${organizationId}`), { method: "DELETE" });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Não foi possível remover a empresa.");
      router.push("/admin/empresas");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível remover a empresa.");
      setLoading(false);
    }
  }

  return <div className="delete-organization">
    <button className="button danger" type="button" onClick={() => setOpen(true)}><Trash2 size={17} />Remover empresa</button>
    {open ? <div className="v2-inline-dialog v2-inline-dialog-danger" role="alertdialog" aria-modal="true" aria-label="Confirmar remoção da empresa">
      <div className="v2-dialog-warning"><AlertTriangle size={20} aria-hidden /><strong>TEM CERTEZA QUE QUER REMOVER ESSA EMPRESA?</strong></div>
      <p>Isso remove permanentemente o cadastro de <strong>{organizationName}</strong>, junto com serviços, certificado, acesso do cliente e tomadores. Essa ação não pode ser desfeita.</p>
      <p><small>Se a empresa já tiver alguma nota fiscal (emitida ou apenas tentada), a remoção será recusada automaticamente — não é possível apagar histórico fiscal.</small></p>
      {error ? <p role="alert" className="v2-dialog-error">{error}</p> : null}
      <div><button className="button ghost" type="button" onClick={() => { setOpen(false); setError(""); }} disabled={loading}>Cancelar</button><button className="button danger" type="button" disabled={loading} onClick={confirmDelete}>{loading ? <><LoaderCircle className="spin" size={17} />Removendo…</> : "Sim, remover empresa"}</button></div>
    </div> : null}
  </div>;
}
