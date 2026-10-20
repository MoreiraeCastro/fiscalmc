import { redirect } from "next/navigation";
import { exigirEmpresa, rotasLegadas } from "@/lib/contribuinte/contexto";

// Até a emissão em 4 passos ficar pronta (próxima etapa), "Nova NFS-e" abre a emissão atual da empresa escolhida.
export default async function NovaNfsePage() {
  const { empresa, escritorio } = await exigirEmpresa();
  redirect(rotasLegadas(escritorio, empresa.id).novaNfse);
}
