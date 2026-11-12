import "server-only";
import { mkdir, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { logEvent } from "@/lib/observability/logger";

const UMA_HORA = 60 * 60 * 1000;

/** Restos de gravação interrompida (.tmp com mais de 1h) não ficam acumulando na fila. */
async function limparTemporarios(fila: string) {
  for (const nome of await readdir(fila)) {
    if (!nome.startsWith(".") || !nome.endsWith(".tmp")) continue;
    const caminho = path.join(fila, nome);
    const info = await stat(caminho).catch(() => null);
    if (info?.isFile() && Date.now() - info.mtimeMs > UMA_HORA) await unlink(caminho).catch(() => undefined);
  }
}

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
  const pasta = path.resolve(fila);
  // Nome só de data e uuid (nada vindo da empresa ou do arquivo): não tem como sair da pasta da fila.
  const base = `${Date.now()}-${crypto.randomUUID()}`;
  const temp = path.join(pasta, `.${base}.tmp`);
  try {
    await mkdir(pasta, { recursive: true });
    await limparTemporarios(pasta).catch(() => undefined);
    await writeFile(temp, input.arquivo);
    await writeFile(path.join(pasta, `${base}.json`), JSON.stringify({ cnpj: input.cnpj, razaoSocial: input.razaoSocial, competencia: input.competencia, nome: input.nome, formato: input.formato }));
    // O arquivo só aparece com o nome final (.arquivo) depois de escrito por inteiro: o serviço lê a fila por ele.
    await rename(temp, path.join(pasta, `${base}.arquivo`));
  } catch (error) {
    await unlink(temp).catch(() => undefined);
    logEvent("error", "NFSE_REPORT_SHAREPOINT_QUEUE_FAILED", { error: error instanceof Error ? error.message : String(error) });
  }
}
