import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import QRCode from "qrcode";
import type { Bloco, Campo, DanfseModelo, Linha } from "./modelo";

// Medidas da NT 008/2026 (item 2.4.5), em cm a partir do canto superior esquerdo. Página A4 em retrato, uma página só.
const CM = 72 / 2.54;
const LARGURA_PAGINA = 21 * CM;
const ALTURA_PAGINA = 29.7 * CM;
const ESQ = 0.3;
const LARGURA_UTIL = 20.4;
const BASE = 29.4;
const COLUNAS = [0.3, 5.41, 10.51, 15.62];
const LARG_COLUNA = 5.09;
const LARG_DUPLA = 10.19;
const ALT_LINHA = 0.645;
const ALT_LINHA_TOTAL = 0.69;
const ALT_AVISO = 0.36;
const ALT_LINHA_TEXTO = 0.29;
const PRETO = rgb(0, 0, 0);
const CINZA_5 = rgb(0.95, 0.95, 0.95);
const VERMELHO = rgb(1, 0, 0);
const MARCA = rgb(0.65, 0.65, 0.65);

let logo: Uint8Array | null = null;
function logoNfse() {
  logo ??= readFileSync(path.join(process.cwd(), "src/lib/nfse/danfse/logo-nfse.png"));
  return logo;
}

type Fontes = { normal: PDFFont; negrito: PDFFont };

/** Helvetica (equivalente métrico da Arial) só codifica WinAnsi: o que não couber vira "?" em vez de quebrar o PDF. */
function seguro(fonte: PDFFont, valor: string) {
  let saida = "";
  for (const caractere of valor.normalize("NFC").replace(/[\r\n\t]+/g, " ")) {
    try { fonte.encodeText(caractere); saida += caractere; } catch { saida += "?"; }
  }
  return saida;
}

function caber(fonte: PDFFont, valor: string, tamanho: number, largura: number) {
  let texto = seguro(fonte, valor);
  if (fonte.widthOfTextAtSize(texto, tamanho) <= largura) return texto;
  while (texto.length > 1 && fonte.widthOfTextAtSize(`${texto}...`, tamanho) > largura) texto = texto.slice(0, -1);
  return `${texto.trimEnd()}...`;
}

function quebrar(fonte: PDFFont, valor: string, tamanho: number, largura: number) {
  const linhas: string[] = [];
  let atual = "";
  for (const palavra of seguro(fonte, valor).split(/\s+/).filter(Boolean)) {
    const tentativa = atual ? `${atual} ${palavra}` : palavra;
    if (fonte.widthOfTextAtSize(tentativa, tamanho) <= largura) { atual = tentativa; continue; }
    if (atual) linhas.push(atual);
    atual = fonte.widthOfTextAtSize(palavra, tamanho) <= largura ? palavra : caber(fonte, palavra, tamanho, largura);
  }
  if (atual) linhas.push(atual);
  return linhas;
}

class Desenho {
  constructor(private readonly pagina: PDFPage, readonly fontes: Fontes) {}
  y(topo: number) { return ALTURA_PAGINA - topo * CM; }
  texto(valor: string, x: number, topo: number, tamanho: number, opcoes: { negrito?: boolean; largura?: number; cor?: ReturnType<typeof rgb>; centro?: boolean } = {}) {
    const fonte = opcoes.negrito ? this.fontes.negrito : this.fontes.normal;
    const texto = opcoes.largura ? caber(fonte, valor, tamanho, opcoes.largura * CM) : seguro(fonte, valor);
    const deslocamento = opcoes.centro && opcoes.largura ? (opcoes.largura * CM - fonte.widthOfTextAtSize(texto, tamanho)) / 2 : 0;
    this.pagina.drawText(texto, { x: x * CM + deslocamento, y: this.y(topo) - tamanho, size: tamanho, font: fonte, color: opcoes.cor ?? PRETO });
  }
  caixa(x: number, topo: number, largura: number, altura: number, opcoes: { fundo?: boolean; borda?: number } = {}) {
    this.pagina.drawRectangle({ x: x * CM, y: this.y(topo + altura), width: largura * CM, height: altura * CM, ...(opcoes.fundo ? { color: CINZA_5 } : {}), ...(opcoes.borda ? { borderColor: PRETO, borderWidth: opcoes.borda } : {}) });
  }
  linha(topo: number) {
    this.pagina.drawLine({ start: { x: ESQ * CM, y: this.y(topo) }, end: { x: (ESQ + LARGURA_UTIL) * CM, y: this.y(topo) }, thickness: 0.5, color: PRETO });
  }
}

/** Campo comum: título 6 pt negrito (primeira letra maiúscula), conteúdo 7 pt (itens 2.4.2 e 2.4.4). Título de bloco: 7 pt caixa alta. */
function desenharLinha(d: Desenho, linha: Linha, topo: number, altura: number, opcoes: { identificacao?: boolean } = {}) {
  let coluna = 0;
  for (const campo of linha) {
    const largura = campo.colunas === 2 ? LARG_DUPLA : coluna === 0 && opcoes.identificacao && linha.length === 1 ? 15.3 : LARG_COLUNA;
    const x = COLUNAS[coluna] ?? COLUNAS[3];
    if (campo.destaque) d.caixa(x, topo, largura + 0.02, altura, { fundo: true });
    desenharCampo(d, campo, x, topo, largura, opcoes.identificacao || (campo.destaque && !campo.valor));
    coluna += campo.colunas ?? 1;
  }
}

function desenharCampo(d: Desenho, campo: Campo, x: number, topo: number, largura: number, rotuloGrande: boolean | undefined) {
  if (campo.rotulo) d.texto(campo.rotulo, x + 0.05, topo + 0.07, rotuloGrande ? 7 : 6, { negrito: true, largura: largura - 0.1 });
  if (campo.valor) d.texto(campo.valor, x + 0.05, topo + (rotuloGrande ? 0.36 : 0.32), 7, { largura: largura - 0.1 });
}

function alturaBloco(bloco: Bloco, alturaDescricao: number, alturaComplementar: number) {
  if (bloco.tipo === "aviso") return ALT_AVISO;
  if (bloco.tipo === "descricao") return 0.38 + alturaDescricao;
  if (bloco.tipo === "texto") return 0.39 + alturaComplementar;
  return bloco.linhas.length * (bloco.titulo === "VALOR TOTAL DA NFS-E" ? ALT_LINHA_TOTAL : ALT_LINHA);
}

export async function gerarDanfsePdf(modelo: DanfseModelo): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`DANFSe ${modelo.chave}`);
  pdf.setProducer("Emissor NFS-e Moreira & Castro");
  const pagina = pdf.addPage([LARGURA_PAGINA, ALTURA_PAGINA]);
  const fontes = { normal: await pdf.embedFont(StandardFonts.Helvetica), negrito: await pdf.embedFont(StandardFonts.HelveticaBold) };
  const d = new Desenho(pagina, fontes);

  // Cabeçalho (2.4.3): logomarca à esquerda, "DANFSe v2.0" ao centro, município e ambiente à direita.
  d.caixa(ESQ, 0.3, LARGURA_UTIL, 1.16, { fundo: true });
  const imagem = await pdf.embedPng(logoNfse());
  const alturaLogo = 4 * (imagem.height / imagem.width);
  pagina.drawImage(imagem, { x: 0.49 * CM, y: d.y(0.44 + alturaLogo), width: 4 * CM, height: alturaLogo * CM });
  d.texto("DANFSe v2.0", 5.41, 0.42, 9, { negrito: true, largura: 10.19, centro: true });
  d.texto("Documento Auxiliar da NFS-e", 5.41, 0.78, 9, { negrito: true, largura: 10.19, centro: true });
  if (modelo.cabecalho.semValidade) d.texto("NFS-e SEM VALIDADE JURÍDICA", 5.41, 1.12, 9, { negrito: true, largura: 10.19, centro: true, cor: VERMELHO });
  if (modelo.cabecalho.municipio) d.texto(modelo.cabecalho.municipio, 15.62, 0.38, 8, { largura: 5.0 });
  d.texto(modelo.cabecalho.ambienteGerador, 15.62, 0.9, 6, { largura: 5.0 });
  d.texto(modelo.cabecalho.tipoAmbiente, 15.62, 1.13, 6, { largura: 5.0 });
  d.linha(1.46);

  // Identificação da NFS-e e QR Code (X 17,48 / Y 1,67, mínimo 1,52 cm).
  const topos = [1.48, 2.27, 2.96, 3.65];
  modelo.identificacao.forEach((linha, indice) => desenharLinha(d, linha, topos[indice], indice === 0 ? 0.77 : 0.67, { identificacao: true }));
  const qr = QRCode.create(modelo.qrCode, { errorCorrectionLevel: "M" });
  const tamanhoQr = 1.6;
  const modulo = tamanhoQr / qr.modules.size;
  for (let linha = 0; linha < qr.modules.size; linha++) {
    for (let coluna = 0; coluna < qr.modules.size; coluna++) {
      if (qr.modules.get(linha, coluna)) d.caixa(17.48 + coluna * modulo, 1.62 + linha * modulo, modulo + 0.002, modulo + 0.002, {});
    }
  }
  ["A autenticidade desta NFS-e pode ser verificada", "pela leitura deste código QR ou pela consulta da", "chave de acesso no portal nacional da NFS-e"]
    .forEach((texto, indice) => d.texto(texto, 15.8, 3.3 + indice * 0.23, 6, { largura: 4.85 }));
  d.linha(4.34);

  // Espaço que sobra para a descrição do serviço e as informações complementares (os dois quadros de altura livre).
  const descricao = modelo.blocos.find((bloco) => bloco.tipo === "descricao");
  const fixo = modelo.blocos.reduce((total, bloco) => total + alturaBloco(bloco, 0, 0.35), 0);
  const livre = Math.max(1.5, BASE - 4.34 - fixo);
  const larguraTexto = (LARGURA_UTIL - 0.1) * CM;
  const linhasDescricao = descricao?.tipo === "descricao" ? quebrar(fontes.normal, descricao.descricaoServico, 7, larguraTexto) : [];
  const minimoComplementar = 1.2;
  const maxLinhasDescricao = Math.max(1, Math.floor((livre - minimoComplementar - 0.3) / ALT_LINHA_TEXTO));
  const alturaDescricao = 0.3 + Math.min(linhasDescricao.length, maxLinhasDescricao) * ALT_LINHA_TEXTO;
  const alturaComplementar = Math.max(minimoComplementar, livre - alturaDescricao) + 0.35;

  let topo = 4.34;
  for (const bloco of modelo.blocos) {
    const altura = alturaBloco(bloco, alturaDescricao, alturaComplementar);
    if (bloco.tipo === "aviso") {
      d.caixa(ESQ, topo, LARGURA_UTIL, altura, { fundo: true });
      d.texto(bloco.texto, ESQ + 0.05, topo + 0.06, 7, { negrito: true, largura: LARGURA_UTIL - 0.1 });
    } else if (bloco.tipo === "descricao") {
      d.texto(bloco.descricaoCodigo, ESQ + 0.05, topo + 0.08, 7, { largura: LARGURA_UTIL - 0.1 });
      d.texto("Descrição do Serviço", ESQ + 0.05, topo + 0.4, 6, { negrito: true });
      const visiveis = linhasDescricao.slice(0, maxLinhasDescricao);
      if (linhasDescricao.length > maxLinhasDescricao) visiveis[visiveis.length - 1] = caber(fontes.normal, `${visiveis[visiveis.length - 1]}...`, 7, larguraTexto);
      visiveis.forEach((texto, indice) => d.texto(texto, ESQ + 0.05, topo + 0.66 + indice * ALT_LINHA_TEXTO, 7));
    } else if (bloco.tipo === "texto") {
      d.caixa(ESQ, topo, LARG_COLUNA, 0.39, { fundo: true });
      d.texto(bloco.titulo, ESQ + 0.05, topo + 0.08, 7, { negrito: true, largura: LARG_COLUNA - 0.1 });
      const linhasCabem = Math.max(0, Math.floor((alturaComplementar - 0.35 - 0.1) / ALT_LINHA_TEXTO));
      const linhas = bloco.texto ? quebrar(fontes.normal, bloco.texto, 7, larguraTexto) : [];
      const visiveis = linhas.slice(0, linhasCabem);
      if (linhas.length > linhasCabem && visiveis.length) visiveis[visiveis.length - 1] = caber(fontes.normal, `${visiveis[visiveis.length - 1]}...`, 7, larguraTexto);
      visiveis.forEach((texto, indice) => d.texto(texto, ESQ + 0.05, topo + 0.47 + indice * ALT_LINHA_TEXTO, 7));
      // A linha dos totais aproximados é fixa: não é cortada junto com o resto.
      d.texto(bloco.rodape, ESQ + 0.05, topo + altura - 0.33, 7, { largura: LARGURA_UTIL - 0.1 });
    } else {
      const alturaLinha = bloco.titulo === "VALOR TOTAL DA NFS-E" ? ALT_LINHA_TOTAL : ALT_LINHA;
      bloco.linhas.forEach((linha, indice) => desenharLinha(d, linha, topo + indice * alturaLinha, alturaLinha));
    }
    topo += altura;
    d.linha(topo);
  }

  // Borda da página: 1 ponto.
  d.caixa(ESQ, 0.3, LARGURA_UTIL, BASE - 0.3, { borda: 1 });

  // Marca d'água (2.5.1 / 2.5.2): diagonal, no mínimo 50 pt, cinza.
  if (modelo.marcaDagua) {
    const tamanho = 90;
    const largura = fontes.normal.widthOfTextAtSize(modelo.marcaDagua, tamanho);
    const angulo = Math.atan2(ALTURA_PAGINA, LARGURA_PAGINA);
    pagina.drawText(modelo.marcaDagua, {
      x: LARGURA_PAGINA / 2 - (largura / 2) * Math.cos(angulo), y: ALTURA_PAGINA / 2 - (largura / 2) * Math.sin(angulo),
      size: tamanho, font: fontes.normal, color: MARCA, rotate: degrees((angulo * 180) / Math.PI), opacity: 0.55,
    });
  }
  return pdf.save();
}
