import "server-only";
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { logEvent } from "@/lib/observability/logger";

/**
 * Cópia de cada Relação de NFS-e baixada para o SharePoint: SETOR FISCAL\Relação de NFS-e\Código - Empresa\<Excel|XML|PDF>\AAAA-MM
 * (no XML e no PDF, um arquivo por nota, tirados do .zip).
 * O emissor só deixa o arquivo numa fila no servidor; quem sobe é o serviço da base de empresas (relacao_sharepoint.py),
 * que já tem o acesso ao SharePoint e sabe o "Código - Nome" de cada CNPJ. Sem a fila configurada, não faz nada.
 * Nunca atrapalha o download: qualquer erro aqui só vai para o log.
 */
export async function enfileirarRelacao(input: { cnpj: string; razaoSocial: string; competencia: string; nome: string; formato: "excel" | "xml" | "pdf"; arquivo: Buffer | Uint8Array }) {
  const fila = process.env.RELACAO_SHAREPOINT_FILA;
  if (!fila) return;
  try {
    await mkdir(fila, { recursive: true });
    const base = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    const temp = path.join(fila, `.${base}.tmp`);
    await writeFile(temp, input.arquivo);
    await writeFile(path.join(fila, `${base}.json`), JSON.stringify({ cnpj: input.cnpj, razaoSocial: input.razaoSocial, competencia: input.competencia, nome: input.nome, formato: input.formato }));
    // O arquivo só aparece com o nome final (.arquivo) depois de escrito por inteiro: o serviço lê a fila por ele.
    await rename(temp, path.join(fila, `${base}.arquivo`));
  } catch (error) {
    logEvent("error", "NFSE_REPORT_SHAREPOINT_QUEUE_FAILED", { error: error instanceof Error ? error.message : String(error) });
  }
}
