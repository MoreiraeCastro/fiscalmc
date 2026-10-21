"use client";

import { Trash2 } from "lucide-react";

/** Botão de excluir com confirmação (rascunhos e favoritos). */
export function ExcluirRascunho({ id, action, pergunta = "Excluir este rascunho? Isso não pode ser desfeito.", titulo = "Excluir rascunho" }: { id: string; action: (formData: FormData) => Promise<void>; pergunta?: string; titulo?: string }) {
  return <form action={action} className="pc-inline" onSubmit={(e) => { if (!window.confirm(pergunta)) e.preventDefault(); }}>
    <input type="hidden" name="id" value={id} />
    <button type="submit" className="pc-icone-acao perigo" title={titulo} aria-label={titulo}><Trash2 size={16} aria-hidden /></button>
  </form>;
}
