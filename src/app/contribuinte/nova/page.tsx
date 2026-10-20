import { redirect } from "next/navigation";

// "Nova NFS-e" → Emissão completa, passo 1 (o rascunho só nasce no primeiro "Avançar", como no portal nacional).
export default function NovaNfsePage() {
  redirect("/contribuinte/dps/novo/pessoas");
}
