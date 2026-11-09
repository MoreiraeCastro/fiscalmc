"use client";

import { useEffect } from "react";
import { createRoot } from "react-dom/client";

type Opcoes = { acao?: string; perigo?: boolean };

/**
 * Aviso de confirmação no estilo do portal, no lugar do window.confirm.
 * A primeira linha do texto vira a pergunta; o resto, o detalhe.
 * Usa as classes de janela de contribuinte/portal.css (carregado no portal e no admin).
 */
export function confirmar(texto: string, { acao = "Confirmar", perigo = false }: Opcoes = {}): Promise<boolean> {
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  return new Promise((resolve) => {
    const fim = (ok: boolean) => { root.unmount(); host.remove(); resolve(ok); };
    root.render(<Aviso texto={texto} acao={acao} perigo={perigo} fim={fim} />);
  });
}

function Aviso({ texto, acao, perigo, fim }: Required<Opcoes> & { texto: string; fim: (ok: boolean) => void }) {
  const [pergunta, ...detalhe] = texto.split("\n");
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") fim(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fim]);
  return <div className="pc-janela-fundo" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) fim(false); }}>
    <div className="pc-janela pc-confirmar" role="alertdialog" aria-modal="true" aria-labelledby="confirmar-titulo">
      <header><h2 id="confirmar-titulo">{pergunta}</h2></header>
      {detalhe.length ? <p className="pc-texto">{detalhe.join("\n")}</p> : <span />}
      <footer className="pc-rodape-passo">
        {/* Ação perigosa: o foco começa no Cancelar, para um Enter distraído não apagar nada. */}
        <button type="button" className="pc-botao secundario" onClick={() => fim(false)} autoFocus={perigo}>Cancelar</button>
        <button type="button" className={`pc-botao ${perigo ? "perigo cheio" : "destaque"}`} onClick={() => fim(true)} autoFocus={!perigo}>{acao}</button>
      </footer>
    </div>
  </div>;
}
