import { redirect } from "next/navigation";

// Emitir agora é no Portal Contribuinte: escolhe a empresa e abre a Nova NFS-e.
export default function OfficeEmissionsPage() {
  redirect("/contribuinte/empresa?voltar=/contribuinte/nova");
}
