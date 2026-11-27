import { Download, FileCode, FileSpreadsheet, FileText, Receipt, ScrollText } from "@/components/icons";
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

const PLANILHAS = [
  { modelo: "simples", titulo: "Relação simples", texto: "Número, partes, valor, ISS e situação", Icone: FileSpreadsheet },
  { modelo: "completa", titulo: "Relação completa", texto: "Todos os campos da nota, com IBS/CBS", Icone: ScrollText },
  { modelo: "retencoes", titulo: "Relação com retenções", texto: "ISS, IRRF, INSS e PIS/COFINS/CSLL retidos e o líquido", Icone: Receipt },
] as const;
const ARQUIVOS = [
  { modelo: "xml", titulo: "XML das notas", texto: "Um XML por nota, em .zip", Icone: FileCode },
  { modelo: "pdf", titulo: "PDF das notas", texto: "O DANFS-e de cada nota, em .zip", Icone: FileText },
] as const;

function Opcao({ modelo, titulo, texto, Icone }: { modelo: string; titulo: string; texto: string; Icone: typeof FileText }) {
  return <button className="pc-rel-opcao" type="submit" name="modelo" value={modelo}>
    <span className="pc-rel-icone"><Icone size={18} aria-hidden /></span>
    <span className="pc-rel-texto"><strong>{titulo}</strong><small>{texto}</small></span>
    <Download className="pc-rel-baixar" size={16} aria-hidden />
  </button>;
}

/** Relação em planilha das NFS-e de uma competência (1 ao último dia do mês), emitidas ou recebidas, e os XML / DANFS-e das notas num .zip. */
export default async function RelacaoPage() {
  const { empresa } = await exigirEmpresa();
  const { atual, anterior } = competencias();
  return <>
    <Trilha itens={["Relação de NFS-e"]} />
    <Cabecalho titulo="Relação de NFS-e" subtitulo={empresa.razaoSocial} />
    <Cartao>
      <form className="pc-rel" method="get" action={apiUrl("/api/contribuinte/relacao")}>
        <div className="pc-rel-topo">
          <div className="pc-rel-campo">
            <span>Notas</span>
            <div className="pc-seg" role="radiogroup" aria-label="Notas">
              <label><input type="radio" name="tipo" value="emitidas" defaultChecked /><span>Emitidas</span></label>
              <label><input type="radio" name="tipo" value="recebidas" /><span>Recebidas</span></label>
            </div>
          </div>
          <div className="pc-rel-campo"><span>Competência</span><SeletorCompetencia name="competencia" inicial={anterior} limite={atual} /></div>
        </div>

        <section className="pc-rel-grupo" aria-label="Planilha">
          <h3>Planilha (Excel)</h3>
          <div className="pc-rel-grade">{PLANILHAS.map((o) => <Opcao key={o.modelo} {...o} />)}</div>
        </section>
        <section className="pc-rel-grupo" aria-label="Arquivos das notas">
          <h3>Arquivos das notas</h3>
          <div className="pc-rel-grade">{ARQUIVOS.map((o) => <Opcao key={o.modelo} {...o} />)}</div>
        </section>
      </form>
    </Cartao>
  </>;
}
