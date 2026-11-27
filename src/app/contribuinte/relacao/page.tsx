import { Download } from "@/components/icons";
import { Cabecalho, Cartao, Trilha } from "@/components/contribuinte/portal-shell";
import { SeletorCompetencia } from "@/components/contribuinte/seletor-competencia";
import { apiUrl } from "@/lib/base-path";
import { exigirEmpresa } from "@/lib/contribuinte/contexto";

export const metadata = { title: "Relação de NFS-e" };

/** Mês de hoje e o anterior (Brasília), "AAAA-MM": o anterior é a competência que normalmente se fecha. */
function competencias() {
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const [ano, mes] = hoje.split("-").map(Number);
  return { atual: hoje.slice(0, 7), anterior: mes === 1 ? `${ano - 1}-12` : `${ano}-${String(mes - 1).padStart(2, "0")}` };
}

const ARQUIVOS = [
  { modelo: "simples", nome: "Relação simples", formato: "Excel" },
  { modelo: "completa", nome: "Relação completa", formato: "Excel" },
  { modelo: "retencoes", nome: "Relação com retenções", formato: "Excel" },
  { modelo: "xml", nome: "XML das notas", formato: ".zip" },
  { modelo: "pdf", nome: "PDF das notas (DANFS-e)", formato: ".zip" },
] as const;

/** Relação em planilha das NFS-e de uma competência (1 ao último dia do mês), emitidas ou recebidas, e os XML / DANFS-e das notas num .zip. */
export default async function RelacaoPage() {
  const { empresa } = await exigirEmpresa();
  const { atual, anterior } = competencias();
  return <>
    <Trilha itens={["Relação de NFS-e"]} />
    <Cabecalho titulo="Relação de NFS-e" subtitulo={empresa.razaoSocial} />
    <form className="pc-rel" method="get" action={apiUrl("/api/contribuinte/relacao")}>
      <Cartao>
        <div className="pc-rel-filtros">
          <label>Notas
            <select name="tipo" className="pc-input" defaultValue="emitidas">
              <option value="emitidas">Emitidas</option>
              <option value="recebidas">Recebidas</option>
            </select>
          </label>
          <div className="pc-filtro-competencia"><span>Competência</span><SeletorCompetencia name="competencia" inicial={anterior} limite={atual} /></div>
        </div>
      </Cartao>
      <Cartao>
        <div className="pc-tabela-rolagem">
          <table className="pc-tabela">
            <thead><tr><th>Arquivo</th><th>Formato</th><th aria-label="Baixar" /></tr></thead>
            <tbody>{ARQUIVOS.map((a) => <tr key={a.modelo}>
              <td>{a.nome}</td>
              <td className="pc-mudo">{a.formato}</td>
              <td className="pc-rel-acao">
                <button className="pc-botao secundario pequeno" type="submit" name="modelo" value={a.modelo}><Download size={14} aria-hidden />Baixar</button>
              </td>
            </tr>)}</tbody>
          </table>
        </div>
      </Cartao>
    </form>
  </>;
}
