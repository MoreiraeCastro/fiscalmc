// Importação em lote dos A1 da pasta CERTIFICADOS DIGITAIS (mesma regra da tela "Subir certificado" do portal).
// As senhas chegam pela entrada padrão (scripts/importar-a1.sh pede sem mostrar); nunca vão para log, relatório ou argumento.
//   Simulação: bash scripts/importar-a1.sh /home/ubuntu/importar-a1/arquivos
//   Gravar:    bash scripts/importar-a1.sh /home/ubuntu/importar-a1/arquivos --gravar
// Arquivos nomeados "<código>__<n>.pfx": a senha é prefixo+código; se não abrir, a senha alternativa.
// Autoria no histórico: --ator=<uuid do usuário> (ou IMPORTAR_A1_ATOR_ID). Sem isso fica sem usuário (e a empresa nova não ganha serviço automático).
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { abrirA1, cadastrarA1, documentoDoA1, type A1Aberto, type ResultadoA1 } from "@/lib/certificates/office-import";

// O controle de certificados mora em outro projeto; fora do .env do emissor, lê as chaves do próprio sistema.
if (!process.env.CONTROLE_SUPABASE_URL) {
  const env = Object.fromEntries(readFileSync("/home/ubuntu/certificados/.env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
  process.env.CONTROLE_SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.CONTROLE_SUPABASE_SECRET_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
}

const [pasta, ...flags] = process.argv.slice(2);
const GRAVAR = flags.includes("--gravar");
if (!pasta) throw new Error("Informe a pasta dos arquivos.");
const [prefixo, alternativa] = readFileSync(0, "utf8").split(/\r?\n/);
if (!prefixo || !alternativa) throw new Error("Faltou o prefixo ou a senha alternativa.");

const arquivos = readdirSync(pasta).filter((n) => /\.(pfx|p12)$/i.test(n)).sort();
const lidos: (A1Aberto & { codigo: string })[] = [];
const semSenha: string[] = [];
const ilegiveis: string[] = [];
for (const arquivo of arquivos) {
  const codigo = arquivo.split("__")[0];
  const a = abrirA1(readFileSync(path.join(pasta, arquivo)), [...new Set([prefixo + codigo, prefixo + codigo.replace(/^0+/, ""), alternativa])]);
  if (!a) semSenha.push(codigo);
  else if (a === "ILEGIVEL") ilegiveis.push(codigo);
  else lidos.push({ ...a, codigo });
}

// Por titular vale o que vence por último (a pasta guarda renovações antigas junto).
const melhor = new Map<string, A1Aberto & { codigo: string }>();
for (const l of lidos) {
  const k = documentoDoA1(l.meta) ?? `?${l.meta.serial}`;
  const atual = melhor.get(k);
  if (!atual || l.meta.validUntil > atual.meta.validUntil) melhor.set(k, l);
}

// Quem roda o lote se identifica; nunca atribui ao último usuário do escritório que aparece no histórico.
const atorId = flags.find((f) => f.startsWith("--ator="))?.slice("--ator=".length) || process.env.IMPORTAR_A1_ATOR_ID || null;
if (atorId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(atorId)) throw new Error("--ator precisa ser o uuid do usuário.");

const linhas: (ResultadoA1 & { codigo: string })[] = [];
for (const l of [...melhor.values()].sort((a, b) => Number(a.codigo) - Number(b.codigo))) {
  const r = await cadastrarA1(l, { gravar: GRAVAR, atorId, codigo: l.codigo });
  linhas.push({ ...r, codigo: l.codigo });
  if (r.empresaNova) await new Promise((ok) => setTimeout(ok, 1_500)); // consulta de CNPJ sem atropelar
}
const vazio = { documento: "", titular: "", validade: "" };
for (const c of semSenha) linhas.push({ ...vazio, codigo: c, emissor: "senha não bateu", controle: "senha não bateu" });
for (const c of ilegiveis) linhas.push({ ...vazio, codigo: c, emissor: "arquivo ilegível", controle: "arquivo ilegível" });

const csv = ["codigo;documento;titular;validade;emissor;controle", ...linhas.map((l) => [l.codigo, l.documento, l.titular, l.validade, l.emissor, l.controle].map((v) => String(v).replace(/;/g, ",")).join(";"))].join("\n");
const saida = path.join(path.dirname(pasta), GRAVAR ? "relatorio-gravado.csv" : "relatorio-simulacao.csv");
writeFileSync(saida, "﻿" + csv);
const conta = (campo: "emissor" | "controle") => Object.entries(linhas.reduce<Record<string, number>>((a, l) => { const k = l[campo].replace(/ \d{4}-\d{2}-\d{2} -> \d{4}-\d{2}-\d{2}/, ""); a[k] = (a[k] ?? 0) + 1; return a; }, {})).sort((a, b) => b[1] - a[1]);
console.log(`${GRAVAR ? "GRAVADO" : "SIMULAÇÃO"} — ${arquivos.length} arquivos, ${lidos.length} abertos, ${semSenha.length} senha não bateu, ${melhor.size} titulares`);
console.log("Emissor:"); for (const [k, n] of conta("emissor")) console.log(`  ${n}  ${k}`);
console.log("Controle:"); for (const [k, n] of conta("controle")) console.log(`  ${n}  ${k}`);
console.log(`Relatório: ${saida}`);
