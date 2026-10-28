// Painel "Não emitidas": traduz o motivo de cada nota que não saiu em "o que aconteceu" e "o que fazer".
// Sem dependência de servidor, para testar e usar em qualquer tela.

export type ProblemOrigin = "RECEITA" | "ANTES_DO_ENVIO" | "CONFIRMACAO";
export type ProblemWhere = "empresa" | "certificado" | "servico" | "configuracao" | "nota" | "tentar" | "programador";
export type ProblemGuide = { titulo: string; oQueFazer: string; onde: ProblemWhere };

/** Mensagem que as rejeições antigas gravavam no lugar do motivo da Receita (antes de 27/10/2026). */
export const GENERIC_REJECTION_MESSAGE = "A emissão foi rejeitada e precisa de revisão do escritório.";

/** Bloqueios do próprio emissor (antes de enviar à Receita). */
const INTERNAL: Record<string, ProblemGuide> = {
  FISCAL_CONFIGURATION_INCOMPLETE: { titulo: "Cadastro incompleto para emitir", oQueFazer: "Leia a mensagem: ela diz o que falta (tomador, serviço, comércio exterior ou configuração fiscal). Corrija e emita de novo.", onde: "empresa" },
  FISCAL_CONFIGURATION_REVIEW: { titulo: "Configuração fiscal precisa de revisão", oQueFazer: "Abra a empresa, confira a configuração fiscal e marque como revisada.", onde: "configuracao" },
  FISCAL_SERVICE_MAPPING_MISSING: { titulo: "Serviço sem código complementar do município", oQueFazer: "No serviço, escolha o código complementar municipal (ou deixe o emissor usar a alíquota do município).", onde: "servico" },
  MUNICIPAL_PARAMETERS_INVALID: { titulo: "Parâmetros do município não batem com o serviço", oQueFazer: "Confira o código de tributação nacional e o complementar do serviço contra os parâmetros do município no ADN.", onde: "servico" },
  MUNICIPAL_PARAMETERS_UNAVAILABLE: { titulo: "Parâmetros do município indisponíveis no ADN", oQueFazer: "O sistema nacional não respondeu. Tente de novo em alguns minutos.", onde: "tentar" },
  MUNICIPAL_RETENTION_REQUIRED: { titulo: "O município exige retenção do ISS", oQueFazer: "Marque a retenção do ISS pelo tomador e emita de novo.", onde: "nota" },
  IBS_CBS_REQUIRED: { titulo: "Faltou IBS/CBS", oQueFazer: "A competência exige IBS/CBS: preencha no passo Serviço.", onde: "nota" },
  SUBSTITUTION_INVALID: { titulo: "Substituição não permitida", oQueFazer: "A nota original já tem substituta ou não é desta empresa. Confira em NFS-e Emitidas.", onde: "nota" },
  CERTIFICATE_LOAD_FAILED: { titulo: "Certificado A1 não abriu", oQueFazer: "Confira se o certificado da empresa está válido e a senha correta; se preciso, envie de novo.", onde: "certificado" },
  SIGNATURE_FAILED: { titulo: "Não foi possível assinar a nota", oQueFazer: "Confira o certificado A1 da empresa (validade e CNPJ).", onde: "certificado" },
  SEFIN_UNAVAILABLE: { titulo: "Receita fora do ar", oQueFazer: "O emissor nacional não respondeu. Tente de novo em alguns minutos.", onde: "tentar" },
  HTTP_ERROR: { titulo: "Falha de comunicação com a Receita", oQueFazer: "Tente de novo em alguns minutos. Se repetir, avise o programador.", onde: "tentar" },
  INVALID_API_RESPONSE: { titulo: "Resposta inesperada da Receita", oQueFazer: "Confira em NFS-e Emitidas se a nota saiu antes de tentar de novo.", onde: "tentar" },
  PRODUCTION_TRANSMISSION_NOT_AUTHORIZED: { titulo: "Emissão em produção não liberada", oQueFazer: "A empresa ainda não está liberada para emitir com valor fiscal. Avise o programador.", onde: "programador" },
  NATIONAL_TRANSMISSION_NOT_AUTHORIZED: { titulo: "Emissão não liberada nesta empresa", oQueFazer: "Confira cadastro, certificado e serviço da empresa: algum item ainda está pendente.", onde: "empresa" },
  RESTRICTED_TRANSMISSION_NOT_AUTHORIZED: { titulo: "Emissão de teste não liberada", oQueFazer: "Avise o programador.", onde: "programador" },
  BUILD_FAILED: { titulo: "Erro ao montar a nota", oQueFazer: "Avise o programador com o código de atendimento.", onde: "programador" },
  SERVICE_PREPARE_FAILED: { titulo: "Não foi possível preparar o serviço", oQueFazer: "O emissor não conseguiu gravar o serviço automático. Avise o programador.", onde: "programador" },
  SERVER_ERROR: { titulo: "Erro interno do emissor", oQueFazer: "Avise o programador com o código de atendimento.", onde: "programador" },
};

/** Rejeições da Receita (SEFIN) que já vimos e sabemos resolver. As demais mostram o texto da Receita. */
const SEFIN: Record<string, ProblemGuide> = {
  E0330: { titulo: "Tomador no exterior sem comércio exterior", oQueFazer: "Preencha o grupo de comércio exterior no passo Serviço (ou confira se o tomador é mesmo do exterior).", onde: "nota" },
  E0242: { titulo: "Tomador no exterior sem endereço completo", oQueFazer: "Complete o endereço no exterior do tomador.", onde: "nota" },
  E0424: { titulo: "Valor recebido não pode ser informado", oQueFazer: "Quando o prestador emite, o valor recebido pelo intermediário fica em branco.", onde: "nota" },
  E0166: { titulo: "Falta o regime de apuração do Simples", oQueFazer: "Na configuração fiscal da empresa, informe o regime de apuração do Simples Nacional (ME/EPP) e emita de novo.", onde: "configuracao" },
  E0239: { titulo: "IBS/CBS exige tomador com endereço", oQueFazer: "Informe o tomador com CPF/CNPJ e endereço no Brasil (CEP e município) ou emita sem IBS/CBS. Tomador no exterior: troque o indicador de operação (o 100301 não vale).", onde: "nota" },
  E1235: { titulo: "Leiaute da nota mudou na Receita", oQueFazer: "A Receita mudou o formato da DPS. Avise o programador.", onde: "programador" },
};

export function problemGuide(code: string | null | undefined, origin: ProblemOrigin): ProblemGuide {
  if (origin === "CONFIRMACAO") return { titulo: "Situação em confirmação", oQueFazer: "A nota foi enviada e a Receita ainda não confirmou. Clique em Verificar situação; não emita de novo antes.", onde: "nota" };
  const key = (code ?? "").trim().toUpperCase();
  if (SEFIN[key]) return SEFIN[key];
  if (INTERNAL[key]) return INTERNAL[key];
  if (/^E\d{3,4}$/.test(key)) return { titulo: `Rejeitada pela Receita (${key})`, oQueFazer: "Leia o motivo da Receita ao lado, corrija o dado na nota ou no cadastro e emita de novo.", onde: "nota" };
  return { titulo: "Emissão não concluída", oQueFazer: "Leia a mensagem ao lado e corrija o que ela indica.", onde: "nota" };
}

/** Texto da Receita sem o código na frente ("E0330 - Descrição" → "Descrição"); vazio quando é a mensagem genérica antiga. */
export function sefinText(message: string | null | undefined, code: string | null | undefined) {
  const text = (message ?? "").trim();
  if (!text || text === GENERIC_REJECTION_MESSAGE) return "";
  return code ? text.replace(new RegExp(`^${code}\\s*-\\s*`, "i"), "") : text;
}

/**
 * Um problema conta como resolvido quando a mesma empresa emitiu depois dele para o mesmo tomador
 * (ou qualquer nota, se o problema não tinha tomador) — sinal de que corrigiram e emitiram de novo.
 */
export function resolvedByLaterIssue(problem: { organizationId: string; customerId: string | null; at: string }, issued: Array<{ organizationId: string; customerId: string | null; at: string }>) {
  return issued.some((nota) => nota.organizationId === problem.organizationId && nota.at > problem.at && (!problem.customerId || nota.customerId === problem.customerId));
}
