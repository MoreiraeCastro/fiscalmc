"use client";

import { useActionState, useState } from "react";
import { Star } from "lucide-react";
import { salvarRascunhoComoFavoritoAction, type EstadoFavorito } from "@/app/contribuinte/favoritos/actions";

/** "Salvar como favorito" no passo 4: guarda serviço, tomador, valor e IBS/CBS deste rascunho com um nome. */
export function SalvarComoFavorito({ rascunhoId, nomeSugerido }: { rascunhoId: string; nomeSugerido: string }) {
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState(nomeSugerido);
  const [estado, enviar, salvando] = useActionState<EstadoFavorito, FormData>(salvarRascunhoComoFavoritoAction.bind(null, rascunhoId), { erros: {} });
  if (estado.ok) return <p className="pc-nota sucesso">{estado.mensagem}</p>;
  if (!aberto) return <button type="button" className="pc-link botao" onClick={() => setAberto(true)}><Star size={14} aria-hidden /> Salvar como serviço favorito</button>;
  return <form action={enviar} className="pc-favorito-inline">
    <label htmlFor="nome-favorito">Nome do favorito</label>
    <input id="nome-favorito" name="nome" className="pc-input" maxLength={80} value={nome} onChange={(e) => setNome(e.target.value)} autoFocus />
    <button type="submit" className="pc-botao secundario" disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</button>
    <button type="button" className="pc-link botao" onClick={() => setAberto(false)}>Cancelar</button>
    {estado.erros.nome || estado.mensagem ? <span className="pc-erro">{estado.erros.nome ?? estado.mensagem}</span> : null}
  </form>;
}
