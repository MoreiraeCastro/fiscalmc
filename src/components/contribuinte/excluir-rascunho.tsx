"use client";

import { useRef } from "react";
import { Trash2 } from "@/components/icons";
import { confirmar } from "@/components/confirmar";

/** Botão de excluir com confirmação (rascunhos e favoritos). */
export function ExcluirRascunho({ id, action, pergunta = "Excluir este rascunho? Isso não pode ser desfeito.", titulo = "Excluir rascunho" }: { id: string; action: (formData: FormData) => Promise<void>; pergunta?: string; titulo?: string }) {
  // O aviso é assíncrono: segura o envio, pergunta e, com o OK, reenvia o formulário (o ref deixa esse segundo envio passar).
  const confirmado = useRef(false);
  return <form action={action} className="pc-inline" onSubmit={async (e) => {
    if (confirmado.current) { confirmado.current = false; return; }
    e.preventDefault();
    const form = e.currentTarget;
    if (await confirmar(pergunta, { acao: "Excluir", perigo: true })) { confirmado.current = true; form.requestSubmit(); }
  }}>
    <input type="hidden" name="id" value={id} />
    <button type="submit" className="pc-icone-acao perigo" title={titulo} aria-label={titulo}><Trash2 size={16} aria-hidden /></button>
  </form>;
}
