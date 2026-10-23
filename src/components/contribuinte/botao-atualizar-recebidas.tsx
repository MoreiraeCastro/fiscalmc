"use client";

import { useActionState } from "react";
import { RotateCw } from "lucide-react";
import { atualizarRecebidas, type EstadoAtualizacao } from "@/app/contribuinte/notas/recebidas/actions";

export function BotaoAtualizarRecebidas() {
  const [estado, enviar, lendo] = useActionState<EstadoAtualizacao, FormData>(atualizarRecebidas, {});
  return <form action={enviar} className="pc-atualizar-recebidas">
    <button className="pc-botao secundario" type="submit" disabled={lendo}><RotateCw size={16} aria-hidden className={lendo ? "spin" : undefined} />{lendo ? "Lendo no ADN…" : "Atualizar agora"}</button>
    {estado.mensagem ? <p className={`pc-nota ${estado.tipo === "sucesso" ? "sucesso" : ""}`} role="status">{estado.mensagem}</p> : null}
  </form>;
}
