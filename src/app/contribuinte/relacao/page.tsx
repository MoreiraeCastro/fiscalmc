import { FileSpreadsheet } from "@/components/icons";
import { Cartao, Trilha } from "@/components/contribuinte/portal-shell";
import { apiUrl } from "@/lib/base-path";
import { exigirEmpresa } from "@/lib/contribuinte/contexto";

export const metadata = { title: "Relação de NFS-e" };

/** Mês anterior ao de hoje (Brasília), "AAAA-MM": a competência que normalmente se fecha. */
function competenciaAnterior() {
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const [ano, mes] = hoje.split("-").map(Number);
  return mes === 1 ? `${ano - 1}-12` : `${ano}-${String(mes - 1).padStart(2, "0")}`;
}

/** Relação em planilha das NFS-e de uma competência (1 ao último dia do mês), emitidas ou recebidas. */
export default async function RelacaoPage() {
  const { empresa } = await exigirEmpresa();
  return <>
    <Trilha itens={["Relação de NFS-e"]} />
    <div className="pc-titulo-linha"><h1 className="pc-titulo">Relação de NFS-e</h1></div>
    <Cartao>
      <form className="pc-relacao" method="get" action={apiUrl("/api/contribuinte/relacao")}>
        <fieldset>
          <legend>NFS-e</legend>
          <label><input type="radio" name="tipo" value="emitidas" defaultChecked />Emitidas</label>
          <label><input type="radio" name="tipo" value="recebidas" />Recebidas</label>
        </fieldset>
        <label className="pc-relacao-mes"><span>Competência</span><input type="month" name="competencia" defaultValue={competenciaAnterior()} required /></label>
        <div className="pc-relacao-botoes">
          <button className="pc-botao secundario" type="submit" name="modelo" value="simples"><FileSpreadsheet size={16} aria-hidden />Relação simples</button>
          <button className="pc-botao" type="submit" name="modelo" value="completa"><FileSpreadsheet size={16} aria-hidden />Relação completa</button>
        </div>
      </form>
      <p className="pc-meta">{empresa.razaoSocial}</p>
    </Cartao>
  </>;
}
