"use client";

import { useRef, useState } from "react";
import { Download, FileUp } from "@/components/icons";
import { apiUrl } from "@/lib/base-path";

type Item = { nome: string; estado: "gerando" | "pronto" | "erro"; url?: string; erro?: string };

const pdfDe = (nome: string) => `${nome.replace(/\.xml$/i, "") || "danfse"}.pdf`;

/** Solta um ou vários XMLs de NFS-e e baixa o DANFS-e de cada um (cada PDF baixa sozinho ao ficar pronto). */
export function XmlParaDanfse() {
  const [itens, setItens] = useState<Item[]>([]);
  const [arrastando, setArrastando] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);

  const atualizar = (indice: number, patch: Partial<Item>) =>
    setItens((lista) => lista.map((item, i) => (i === indice ? { ...item, ...patch } : item)));

  const gerar = async (arquivos: File[]) => {
    const xmls = arquivos.filter((arquivo) => /\.xml$/i.test(arquivo.name) || arquivo.type.includes("xml"));
    if (!xmls.length) return;
    let inicio = 0;
    setItens((lista) => { inicio = lista.length; return [...lista, ...xmls.map((arquivo) => ({ nome: arquivo.name, estado: "gerando" as const }))]; });
    await Promise.resolve();
    for (const [posicao, arquivo] of xmls.entries()) {
      const indice = inicio + posicao;
      try {
        const corpo = new FormData();
        corpo.append("xml", arquivo);
        const resposta = await fetch(apiUrl("/api/contribuinte/danfse-de-xml"), { method: "POST", body: corpo });
        if (!resposta.ok) {
          const dados = await resposta.json().catch(() => null) as { error?: string } | null;
          atualizar(indice, { estado: "erro", erro: dados?.error ?? `Falha ao gerar (HTTP ${resposta.status}).` });
          continue;
        }
        const url = URL.createObjectURL(await resposta.blob());
        atualizar(indice, { estado: "pronto", url });
        const link = document.createElement("a");
        link.href = url;
        link.download = pdfDe(arquivo.name);
        link.click();
      } catch {
        atualizar(indice, { estado: "erro", erro: "Sem conexão com o emissor. Tente de novo." });
      }
    }
  };

  return <>
    <div
      className={`pc-soltar${arrastando ? " ativo" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
      onDragLeave={() => setArrastando(false)}
      onDrop={(e) => { e.preventDefault(); setArrastando(false); void gerar(Array.from(e.dataTransfer.files)); }}
    >
      <FileUp size={28} aria-hidden />
      <p><strong>Arraste os XMLs aqui</strong> ou</p>
      <button className="pc-botao" type="button" onClick={() => entrada.current?.click()}>Escolher arquivos</button>
      <input ref={entrada} type="file" accept=".xml,application/xml,text/xml" multiple hidden
        onChange={(e) => { void gerar(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
    </div>

    {itens.length ? <div className="pc-tabela-rolagem">
      <table className="pc-tabela">
        <thead><tr><th>Arquivo</th><th>Situação</th><th><span className="sr-only">Baixar</span></th></tr></thead>
        <tbody>{itens.map((item, i) => <tr key={`${item.nome}-${i}`}>
          <td>{item.nome}</td>
          <td>{item.estado === "gerando" ? "Gerando…" : item.estado === "pronto" ? <em className="pc-selo ok">PDF pronto</em> : <span className="pc-erro-texto">{item.erro}</span>}</td>
          <td>{item.url ? <a className="pc-botao secundario" href={item.url} download={pdfDe(item.nome)}><Download size={15} aria-hidden />Baixar PDF</a> : null}</td>
        </tr>)}</tbody>
      </table>
    </div> : null}
  </>;
}
