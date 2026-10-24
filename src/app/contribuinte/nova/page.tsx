import { redirect } from "next/navigation";

// "Nova NFS-e" → Emissão rápida (tomador, serviço e valor numa tela). A emissão completa em 4 passos continua em /contribuinte/dps/novo/pessoas.
export default function NovaNfsePage() {
  redirect("/contribuinte/rapida");
}
