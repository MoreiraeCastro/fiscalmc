"use client";

import { Trash2 } from "lucide-react";

export function ExcluirRascunho({ id, action }: { id: string; action: (formData: FormData) => Promise<void> }) {
  return <form action={action} className="pc-inline" onSubmit={(e) => { if (!window.confirm("Excluir este rascunho? Isso não pode ser desfeito.")) e.preventDefault(); }}>
    <input type="hidden" name="id" value={id} />
    <button type="submit" className="pc-icone-acao perigo" title="Excluir rascunho" aria-label="Excluir rascunho"><Trash2 size={16} aria-hidden /></button>
  </form>;
}
