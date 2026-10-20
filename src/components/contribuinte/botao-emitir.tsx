"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LoaderCircle } from "lucide-react";
import { registrarResultadoAction } from "@/app/contribuinte/dps/actions";
import { apiUrl } from "@/lib/base-path";

export type PedidoEmissao = {
  organizationId?: string;
  serviceTemplateId: string;
  customerId: string;
  amount: string;
  serviceDate: string;
  description: string;
  manualIssRateBasisPoints?: number;
  manualIssRateSourceNote?: string;
};

/**
 * "Emitir NFS-e": manda o rascunho para o motor de sempre (POST /api/invoices).
 * A chave de idempotência é do rascunho: clicar duas vezes ou recarregar nunca gera duas notas.
 */
export function BotaoEmitir({ rascunhoId, chave, pedido, producao, voltar }: { rascunhoId: string; chave: string; pedido: PedidoEmissao; producao: boolean; voltar: string }) {
  const router = useRouter();
  const [confirmado, setConfirmado] = useState(false);
  const [emitindo, setEmitindo] = useState(false);
  const [erro, setErro] = useState("");

  async function emitir() {
    if (emitindo || (producao && !confirmado)) return;
    setEmitindo(true);
    setErro("");
    try {
      const resposta = await fetch(apiUrl("/api/invoices"), {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": chave },
        body: JSON.stringify({ ...pedido, ...(producao ? { productionConfirmation: true } : {}) }),
      });
      const corpo = await resposta.json().catch(() => ({})) as { invoiceId?: string; status?: string; safeMessage?: string; error?: string; requestId?: string };
      if (corpo.invoiceId && corpo.status) {
        await registrarResultadoAction(rascunhoId, corpo.invoiceId, corpo.status);
        if (corpo.status === "REJECTED") {
          setErro(`A Receita não autorizou a nota: ${corpo.safeMessage ?? "motivo não informado"}. Corrija nos passos anteriores e emita de novo.`);
          router.refresh();
          return;
        }
        router.push(`/contribuinte/nfse/${corpo.invoiceId}`);
        return;
      }
      setErro(`${corpo.error ?? "Não foi possível concluir a emissão."}${corpo.requestId ? ` (código de atendimento: ${corpo.requestId})` : ""}`);
    } catch {
      setErro("Sem resposta do servidor. Antes de tentar de novo, confira em NFS-e Emitidas se a nota não foi gerada.");
    } finally {
      setEmitindo(false);
    }
  }

  return <div className="pc-emitir">
    {erro ? <div className="pc-aviso erro" role="alert">{erro}</div> : null}
    {producao ? <label className="pc-confirmacao">
      <input type="checkbox" checked={confirmado} onChange={(e) => setConfirmado(e.target.checked)} />
      Conferi os dados: emitir esta NFS-e em <strong>Produção</strong> (nota com valor fiscal).
    </label> : <div className="pc-aviso">Ambiente de <strong>Produção Restrita</strong>: a nota não tem valor fiscal.</div>}
    <footer className="pc-rodape-passo">
      <Link className="pc-botao secundario" href={voltar} aria-disabled={emitindo}>Voltar</Link>
      <button className="pc-botao destaque" type="button" onClick={emitir} disabled={emitindo || (producao && !confirmado)}>
        {emitindo ? <><LoaderCircle className="spin" size={17} aria-hidden />Emitindo…</> : "Emitir NFS-e"}
      </button>
    </footer>
  </div>;
}
