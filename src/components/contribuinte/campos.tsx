import Link from "next/link";
import { Building, FileCheck2, Receipt, Users } from "lucide-react";
import { PASSOS, type NumeroPasso } from "@/lib/contribuinte/dps";

const ICONES = { 1: Users, 2: Building, 3: Receipt, 4: FileCheck2 } as const;

/** Barra de passos do topo: Pessoas → Serviço → Valores → Emitir NFS-e (passos já liberados viram link). */
export function BarraPassos({ atual, liberado, rascunhoId, substituicao = false }: { atual: NumeroPasso; liberado: NumeroPasso; rascunhoId: string | null; substituicao?: boolean }) {
  return <ol className="pc-passos" aria-label="Passos da emissão">
    {PASSOS.map((passo) => {
      const Icone = ICONES[passo.numero];
      const estado = passo.numero === atual ? "atual" : passo.numero < atual ? "feito" : "";
      const conteudo = <><span className="pc-passo-icone"><Icone size={18} aria-hidden /></span><span>{substituicao && passo.numero === 4 ? "Substituição" : passo.rotulo}</span></>;
      const podeIr = rascunhoId && passo.numero !== atual && passo.numero <= liberado;
      return <li key={passo.slug} className={estado} aria-current={passo.numero === atual ? "step" : undefined}>
        {podeIr ? <Link href={`/contribuinte/dps/${rascunhoId}/${passo.slug}`}>{conteudo}</Link> : <span>{conteudo}</span>}
      </li>;
    })}
  </ol>;
}

/** Campo no padrão do portal: rótulo em cima, * nos obrigatórios, dica e "Campo obrigatório" em vermelho embaixo. */
export function Campo({ rotulo, obrigatorio, erro, dica, children, largura = "", id }: { rotulo: string; obrigatorio?: boolean; erro?: string; dica?: string; children: React.ReactNode; largura?: "" | "meia" | "terco" | "inteira"; id?: string }) {
  return <div className={`pc-campo ${largura}${erro ? " com-erro" : ""}`}>
    <label htmlFor={id}>{rotulo}{obrigatorio ? <span className="pc-obrigatorio" aria-hidden> *</span> : null}</label>
    {children}
    {dica && !erro ? <small className="pc-dica">{dica}</small> : null}
    {erro ? <small className="pc-erro" role="alert">{erro}</small> : null}
  </div>;
}

/** Leitura (somente leitura), como os campos que o portal preenche sozinho. */
export function Leitura({ rotulo, valor, largura = "" }: { rotulo: string; valor: React.ReactNode; largura?: "" | "meia" | "terco" | "inteira" }) {
  return <div className={`pc-campo leitura ${largura}`}><span className="pc-rotulo">{rotulo}</span><div className="pc-leitura">{valor || "—"}</div></div>;
}

/** Faixa amarela do topo quando falta algo ao clicar em Avançar. */
export function FaixaValidacao({ erros, mensagem }: { erros: Record<string, string>; mensagem?: string }) {
  if (!mensagem && !Object.keys(erros).length) return null;
  return <div className="pc-aviso alerta" role="alert">{mensagem ?? "Preencha o formulário conforme orientações abaixo."}</div>;
}

export function Rodape({ voltar, children }: { voltar?: string; children: React.ReactNode }) {
  return <footer className="pc-rodape-passo">
    {voltar ? <Link className="pc-botao secundario" href={voltar}>Voltar</Link> : <span />}
    {children}
  </footer>;
}
