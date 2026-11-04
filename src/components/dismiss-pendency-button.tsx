"use client";

import { Check, LoaderCircle } from "@/components/icons";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiUrl } from "@/lib/base-path";

export function DismissPendencyButton({ itemId, itemType, organizationId }: { itemId: string; itemType: string; organizationId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function dismiss() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(apiUrl("/api/admin/pendencias"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemId, itemType, organizationId }) });
      if (!response.ok) { const body = await response.json() as { error?: string }; throw new Error(body.error ?? "Não foi possível marcar como resolvido."); }
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível marcar como resolvido.");
      setLoading(false);
    }
  }

  return <div className="dismiss-pendency">
    <button className="button ghost compact" type="button" onClick={dismiss} disabled={loading} title="Marcar como resolvido">
      {loading ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />}
      Resolvido
    </button>
    {error ? <small role="alert">{error}</small> : null}
  </div>;
}
