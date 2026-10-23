"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { apiUrl } from "@/lib/base-path";

/**
 * Chave "só serviços revisados". Desligada (padrão): "subiu o A1, está pronto" — perfil fiscal automático e lista nacional no passo 2.
 * Ligada: a empresa só emite com perfil fiscal e serviços revisados pelo escritório.
 */
export function OfficeReviewToggle({ organizationId, required, canChange }: { organizationId: string; required: boolean; canChange: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function toggle() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(apiUrl(`/api/admin/organizations/${organizationId}`), { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: required ? "allow_automatic" : "require_review" }) });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Não foi possível alterar a chave.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível alterar a chave.");
    } finally {
      setLoading(false);
    }
  }

  return <div className="office-review-toggle">
    <label>
      <input type="checkbox" checked={required} onChange={toggle} disabled={!canChange || loading} />
      <span><strong>Só serviços revisados</strong> {loading ? <LoaderCircle className="spin" size={14} aria-hidden /> : null}
        <small>{required
          ? "Ligada: a empresa só emite com a configuração fiscal e os serviços revisados pelo escritório."
          : "Desligada: basta o certificado A1. O perfil fiscal vem da Receita e o cliente escolhe o serviço na lista nacional, como no Emissor Nacional."}</small>
      </span>
    </label>
    {error ? <p role="alert" className="v2-dialog-error">{error}</p> : null}
  </div>;
}
