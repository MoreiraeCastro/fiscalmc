"use client";

import { useActionState, useState } from "react";
import { salvarContatoAction, type EstadoConfiguracoes } from "@/app/contribuinte/configuracoes/actions";
import { Campo } from "./campos";

export function FormContato({ inicial, podeEditar }: { inicial: { email: string; telefone: string }; podeEditar: boolean }) {
  const [estado, enviar, salvando] = useActionState<EstadoConfiguracoes, FormData>(salvarContatoAction, { erros: {} });
  const [email, setEmail] = useState(inicial.email);
  const [telefone, setTelefone] = useState(inicial.telefone);
  return <form action={enviar} className="pc-form" noValidate>
    {estado.mensagem ? <div className={`pc-aviso ${estado.ok ? "sucesso" : "alerta"}`} role="status">{estado.mensagem}</div> : null}
    <div className="pc-grade">
      <Campo rotulo="E-mail" erro={estado.erros.email} id="email" largura="meia">
        <input id="email" name="email" type="email" maxLength={80} value={email} readOnly={!podeEditar} onChange={(e) => setEmail(e.target.value)} />
      </Campo>
      <Campo rotulo="Telefone" erro={estado.erros.telefone} dica="DDD + número" id="telefone" largura="terco">
        <input id="telefone" name="telefone" inputMode="tel" maxLength={20} value={telefone} readOnly={!podeEditar} onChange={(e) => setTelefone(e.target.value)} />
      </Campo>
    </div>
    {podeEditar ? <footer className="pc-rodape-passo"><span /><button className="pc-botao" type="submit" disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</button></footer> : null}
  </form>;
}
