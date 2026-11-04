import { Aviso, Cartao, Trilha } from "@/components/contribuinte/portal-shell";
import { XmlParaDanfse } from "@/components/contribuinte/xml-para-danfse";
import { contextoContribuinte } from "@/lib/contribuinte/contexto";

export const metadata = { title: "XML para DANFS-e" };

/** Gera o DANFS-e (PDF) de qualquer XML de NFS-e do padrão nacional — serve também quando o Emissor Nacional está fora. */
export default async function XmlParaPdfPage() {
  await contextoContribuinte();
  return <>
    <Trilha itens={["XML para DANFS-e"]} />
    <div className="pc-titulo-linha"><h1 className="pc-titulo">XML para DANFS-e</h1></div>
    <Cartao>
      <Aviso>Envie o XML de uma NFS-e do padrão nacional (de qualquer empresa) e baixe o DANFS-e em PDF, no leiaute nacional. Funciona mesmo com o Emissor Nacional fora do ar. Nada fica guardado. O PDF não mostra se a nota foi cancelada ou substituída depois: isso não está no XML.</Aviso>
      <XmlParaDanfse />
    </Cartao>
  </>;
}
