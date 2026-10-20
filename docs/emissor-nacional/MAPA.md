# Mapa do Emissor Nacional (Portal do Contribuinte NFS-e) — referência do emissor novo

Levantado em 20/10/2026 no portal de produção (`www.nfse.gov.br/EmissorNacional`, versão 1.6.0.0), só navegando e lendo,
logado como Moreira & Castro. Objetivo (decisão do João): o emissor da Moreira & Castro deve ter **a mesma estrutura,
telas, campos e ordem de passos** do Emissor Nacional, porque é o que o Fiscal já usa — com a nossa identidade visual
(sem marca/brasão do governo) e o nosso motor de NFS-e por baixo (`src/lib/nfse`, que já emitiu em produção).
Login e empresas continuam próprios do emissor (não do portal-hub), por decisão de 20/10/2026.

Nada de dados de clientes neste documento: só a estrutura. Telas que dependem de clicar em "Avançar", "Cancelar" ou
"Substituir" ainda precisam ser vistas no ambiente de **Produção Restrita** (sem valor fiscal).

## 1. Estrutura geral

- **Topo fixo:** logo à esquerda + título "PORTAL CONTRIBUINTE"; à direita, ícones (com dica ao passar o mouse):
  Página Principal · **Nova NFS-e ▾** (menu "Tipos de emissão": Emissão completa / Emissão simplificada / Emissão por
  decisão administrativa/judicial) · NFS-e Emitidas · NFS-e Recebidas · Rascunhos · Configurações · Serviços Favoritos ·
  Perfil ▾ (razão social + CNPJ do contribuinte, "Sair com segurança").
- **Trilha (breadcrumb)** abaixo do topo: `Home :: Emissão Completa :: Pessoas`, `Home :: NFS-e :: Emitidas` etc.
- **Rodapé:** logos institucionais + "Portal de Gestão NFS-e - Contribuinte | Versão x".
- Visual: fundo cinza-claro, cartões brancos com título de seção em verde e caixa alta (ex.: "INFORMAÇÕES GERAIS"),
  campos com rótulo em cima, `*` nos obrigatórios, ícone `?` de ajuda ao lado do rótulo, avisos em caixa azul-clara.

## 2. Página Principal (`/`)

Quatro cartões:
1. **Rascunhos** — tabela Competência | Emitida para (CPF/CNPJ - nome, ou "Não informado") | ✎ editar (abre o rascunho no passo em que parou).
2. **Meus dados** — CNPJ, Nome, E-mail, Telefone do contribuinte logado.
3. **Últimas NFS-e emitidas nos últimos 30 dias** — Geração | Emitida para | Valor (R$) | 👁 visualizar.
4. **Acesso Rápido** — atalhos (Nova NFS-e, Configurações, Meus Favoritos) + "Incluir opção".

## 3. Emissão completa — 4 passos

Barra de passos com ícones no topo: **Pessoas → Serviço → Valores → Emitir NFS-e** (o passo atual destacado).
Botões no rodapé de cada passo: **Voltar** / **Avançar** (no último: Voltar / **Emitir NFS-e**). Cada "Avançar" grava
um **rascunho** (ele aparece em Rascunhos com a data de atualização e o passo em que está).

### Passo 1 — Pessoas (`/DPS/Pessoas`)
- **INFORMAÇÕES GERAIS:** Preencher as informações IBS/CBS? (Sim/Não)* · Data de Competência* (calendário) ·
  ☐ Informar série e número da DPS (abre Série* [5] e Número da DPS* [15]).
- **EMITENTE DA NFS-E:** Você irá emitir esta NFS-e como?* (Prestador/Fornecedor · Tomador/Adquirente · Intermediário) ·
  Município* · Indicador Municipal · CNPJ (preenchido) · Razão Social (preenchida) · Opção no Simples Nacional* /
  Regime de Apuração dos Tributos no SN* · "Exibir detalhes do emitente" (Telefone, E-mail, CEP, Logradouro, Número,
  Complemento, Bairro).
- **COMPRAS GOVERNAMENTAIS:** A operação se trata de uma compra governamental? (Sim/Não) → Tipo de ente governamental*
  (União, Estado, DF, Município).
- **TOMADOR/ADQUIRENTE DO SERVIÇO:** Onde está localizado o estabelecimento/domicílio?* (Brasil · Exterior ·
  Tomador/Adquirente não informado).
  - Brasil: CPF/CNPJ* · Indicador Municipal · Nome/Razão Social* · Telefone · E-mail · ☐ Informar endereço (CEP*,
    Município, Bairro*, Logradouro*, Número*, Complemento).
  - Exterior: NIF* ou Motivo da não informação do NIF* (Dispensado / Não exigência) · Nome* · endereço exterior
    (Logradouro, Número, Complemento, Bairro*, Cidade*, Código de Endereçamento Postal*, Estado/província/região*, País*).
- **DESTINATÁRIO DO SERVIÇO** (IBS/CBS): O destinatário é o próprio adquirente? (Sim/Não) → se Não, mesmo bloco do tomador.
- **INTERMEDIÁRIO DO SERVIÇO:** Brasil · Exterior · Intermediário não informado (mesmos campos do tomador).

### Passo 2 — Serviço (`/DPS/Servico`)
- **LOCAL DO FORNECIMENTO/PRESTAÇÃO DO SERVIÇO:** País* (Brasil) · Município*.
- **SERVIÇO/FORNECIMENTO PRESTADO:** Código de Tributação Nacional* (lista com busca) · O serviço é caso de imunidade,
  exportação de serviço ou não incidência do ISSQN?* (Não/Sim) · Item da NBS correspondente* · Código indicador da
  operação · Descrição do Serviço/Fornecimento* (contador "Total de caracteres: 0 / 2000").
- **INFORMAÇÕES COMPLEMENTARES:** Número do documento de responsabilidade técnica · Documento de referência ·
  Informações complementares (0/2000) · Número do Pedido/Ordem de Compra/OS/Projeto (B2B).

### Passo 3 — Valores (`/DPS/Tributacao`)
- (Na substituição) **SUBSTITUIÇÃO DE NFS-E:** Chave de acesso da NFS-e substituída · Data de competência · Valor do serviço
  — e o 4º passo vira "Substituição".
- **VALORES DO FORNECIMENTO/SERVIÇO PRESTADO:** Valor da operação/serviço prestado* · Valor recebido pelo intermediário ·
  Desconto incondicionado · Desconto condicionado (todos R$).
- Aviso azul quando a empresa é do Simples (ISSQN apurado pelo SN: tributação municipal travada, exceto retenção).
- **TRIBUTAÇÃO MUNICIPAL:** Tributação do ISSQN (ex.: Operação Tributável) · Regime Especial de Tributação* ·
  Exigibilidade suspensa?* · Há retenção do ISSQN pelo Tomador/Intermediário?* · Benefício municipal?* ·
  Dedução/Redução da base de cálculo?* (ou aviso de que o município não permite) · Alíquota % · BC ISSQN · Valor ISSQN.
- **TRIBUTAÇÃO FEDERAL:** Situação Tributária do PIS/COFINS · BC PIS/COFINS · PIS alíquota/débito · COFINS
  alíquota/débito · Tipo de retenção do PIS/COFINS/CSLL · IRRF · Contribuições Sociais retidas · Contribuição
  Previdenciária retida.
- **IBS/CBS:** CST e Classificação Tributária (e "Regular"), percentuais de diferimento (municipal, estadual, CBS),
  Código de Crédito Presumido*, documentos referenciados (reembolso/repasse/ressarcimento) com "Incluir Documento".
- **VALOR APROXIMADO DOS TRIBUTOS:** Preencher os valores monetários em cada NFS-e · Configurar os valores percentuais
  (Federal*, Estadual*, Municipal* %) · Informar alíquota do Simples Nacional.

### Passo 4 — Emitir NFS-e (`/DPS/EmitirNFSe`)
Aviso azul: "revise sua DPS e confira o cálculo prévio do imposto… Em seguida, emita".
Resumo em blocos, cada um com link **Editar** (volta ao passo): **PESSOAS** (Informações Gerais, Emitente, Tomador com
endereço) · **SERVIÇO** (código completo, descrição do código, NBS, local da prestação, local de incidência, descrição) ·
**VALORES** (valor, tributação municipal: as 5 perguntas) · **PRÉVIA DOS VALORES DA NFS-E** (ISSQN calculado: serviço,
base, alíquota, ISSQN; Tributação federal: PIS, COFINS, IRRF, CS retidas, CP retida; **Valor líquido**: serviço, total
retido, líquido). Botões **Voltar** / **Emitir NFS-e**.

## 4. Outros tipos de emissão
- **Emissão simplificada** (`/DPS/Simplificada`): só para MEI — para nós aparece "não disponível para seu usuário". Não entra.
- **Emissão por decisão administrativa/judicial** (`/ByPass/Pessoas`): mesmo fluxo da completa. Fica para depois.

## 5. Listas
- **NFS-e Emitidas** (`/Notas/Emitidas`) e **NFS-e Recebidas** (`/Notas/Recebidas`): aviso "são exibidas as notas dos
  últimos 30 dias… o período não deve ser superior a 30 dias". Botões **+ Nova NFS-e** · **Recarregar lista** · busca
  "Pesquisar pessoa física ou jurídica" · Data Inicial / Data Final · **Filtrar**. Colunas: Geração ▾ · Emitida para
  (Recebidas: Emitida por) · Competência (MM/AAAA) · Município Emissor · Preço Serviço (R$) · Situação (ícone) · ⋮.
  Menu ⋮ da linha: **Visualizar · Substituir · Cancelar NFS-e · Download XML · Download DANFS-e**. Paginação + "Total de N registros".
- **Rascunhos** (`/Notas/Rascunhos`): Atualização ▾ · Competência · Emitida para ("Tomador e Intermediário não
  informados") · Valor (R$) · **Passo** (ícone do passo em que parou) · ⋮.

## 6. Visualizar NFS-e (`/Notas/Visualizar/Index/{chave}`)
Barra: **+ Nova NFS-e · Voltar · `<>` (XML) · PDF · Imprimir · NFS-e Emitidas**.
Cartões: **Identificação da NFS-e** (Chave de acesso, Data de geração, Versão) · **Identificação do DPS** (Número, Série,
Data de emissão, Versão). Abas: **NFS-e · Pessoas · Serviço · Outros Tributos**. Na aba NFS-e: Emitente (razão social,
CNPJ, IM, situação no SN, regime especial, endereço), Tributação Municipal (tributação do ISSQN, país do resultado,
município de incidência, imunidade, suspensão, benefício, valor do serviço, desconto, deduções, benefício, base,
alíquota, ISSQN, retenção), Outras Informações (versão da aplicação, ambiente gerador, **Situação da NFS-e**, ex.
"100 - NFS-e Gerada").

## 7. Configurações e Favoritos
- **Configurações** (`/Perfil/Configuracao`): INFORMAÇÕES PESSOAIS (E-mail, Telefone — usados na DPS) · VALOR
  APROXIMADO DOS TRIBUTOS (opção atual no SN, lida da base; escolher: preencher valores em cada nota / percentuais
  fixos / alíquota do SN %) · **Salvar**.
- **Serviços Favoritos** (`/Perfil/ServicosFavoritos`): até **10** serviços com informações pré-preenchidas; ao
  escolher um favorito na emissão, os campos ligados vêm preenchidos. "+ Novo Serviço Favorito".

## 8. Comportamentos vistos na Produção Restrita (20/10/2026, clicando de verdade)

Percorrido com dados de teste (tomador = CNPJ público do Banco do Brasil, R$ 100,00, código 17.19.01) até o passo 4.
- **Topo:** na restrita já existe um menu a mais, **Apuração Nacional ▾** (Pré-Apuração, Apuração, Arrecadação,
  Créditos/Débitos — `/MAN/...`). Fora do nosso escopo por ora.
- **Página Principal sem rascunhos:** texto explicativo "A emissão de uma nova NFS-e é dividida em 4 passos… ao passar
  para o próximo passo, as informações… serão salvas e listadas aqui".
- **Passo 1:**
  - A **Data de Competência** vem antes da pergunta do IBS/CBS; depois de preenchida, aparece um aviso azul: IBS/CBS é
    **permitido** com competência a partir de 01/12/2025 e **obrigatório** a partir de 01/01/2027.
  - Ao marcar **Prestador**, o portal **preenche sozinho** Município (do cadastro do estabelecimento), CNPJ, Razão Social e
    Opção no Simples Nacional (somente leitura), e aparece **Regime de Apuração dos Tributos no SN*** com 3 opções:
    1 = federais e municipal pelo SN · 2 = federais pelo SN e ISSQN pela NFS-e · 3 = federais e municipal pela NFS-e.
  - **Tomador:** ao sair do CPF/CNPJ, busca na base da Receita e preenche Nome, marca "Informar endereço" e preenche
    CEP/Município/endereço. Ao lado do campo: 🔍 (pesquisar) e 👥 **Últimos Tomadores** (janela "Histórico": lista as
    pessoas para quem já se emitiu, para recuperar os dados; vazia na restrita).
- **Passo 2:**
  - O **Município** é uma lista com busca; o **Código de Tributação Nacional** fica travado até escolher o município e
    também tem busca (digitando "contabil" achou 17.19.01).
  - Escolhido o código, aparecem **Código Complementar Municipal*** (ex.: 17.19.01.001, do município) e, para o IBS/CBS,
    **Código de Situação Tributária*** e **Código de Classificação Tributária***.
  - **Item da NBS*** é uma lista de ~918 itens.
- **Passo 3 (layout novo da restrita, diferente de produção):** seções **VALORES** · aviso do Simples · **ISSQN**
  (Tributação do ISSQN: 1 Operação Tributável / 2 Imunidade / 3 Exportação / 4 Não incidência; Regime Especial*: 0
  Nenhum / 6 Sociedade de Profissionais; exigibilidade suspensa → Tipo de suspensão: 1 decisão judicial / 2 processo
  administrativo; retenção; benefício municipal → lista de benefícios do município, ex. "Alíquota diferenciada") ·
  **IBS/CBS** (CST e classificação) · **AJUSTE DA BASE DE CÁLCULO DO ISSQN E/OU IBS/CBS** (Sim/Não) · **OUTROS TRIBUTOS**
  (Situação Tributária do PIS/COFINS: 00 Nenhum, 01…09, 49, 50…; Tipo de retenção do PIS/COFINS/CSLL: 0 Não retidos,
  3 Retidos, 4 PIS/COFINS retidos e CSLL não, 5…; IRRF; CS retidas; CP retida) · **VALOR APROXIMADO DOS TRIBUTOS**
  (com dica de pré-configurar em Configurações; escolhendo "valores monetários" pede Federal*, Estadual*, Municipal* em R$).
- **Validação:** ao clicar Avançar com falta de dados, faixa amarela no topo "Preencha o formulário conforme orientações
  abaixo" e, embaixo de cada campo, "Campo obrigatório" em vermelho. Nada avança até corrigir.
- **Passo 4:** igual ao de produção (aviso azul + resumo por blocos com Editar + prévia dos valores).
- **IBS/CBS (reforma tributária) — o que mais muda:**
  - Na restrita, emitir com competência 20/10/2026 e IBS/CBS = Não foi **recusado no clique de Emitir**: "É obrigatório
    declarar informações de IBS/CBS quando a data de competência for igual ou posterior a 01/10/2026" (o aviso do passo 1
    ainda diz 01/01/2027 — em produção vale o aviso de 2027). **O nosso motor hoje não emite IBS/CBS.**
  - Trocar a resposta do IBS/CBS num rascunho abre "Confirmação: os demais dados já informados serão perdidos. Deseja
    continuar? SIM/NÃO" (e apaga mesmo). Mudar o passo 1 depois de ter avançado: "Os dados já informados para os passos
    subsequentes serão perdidos".
  - Com IBS/CBS = Sim: passo 1 ganha "o destinatário é o próprio adquirente?*" obrigatório; passo 2, ao escolher a NBS,
    carrega **Código de Situação Tributária*** (000 Tributação integral, 010, 011, 200 Alíquota reduzida, 220, 221, 222
    Redução de BC, 400 Isenção, 410 Imunidade e não incidência, 510/515 Diferimento, 550 Suspensão, 800, 811, 820, 830) e
    **Código de Classificação Tributária*** (ex.: 000001 "Situações tributadas integralmente pelo IBS e CBS"), e o
    **Código indicador da operação*** vira obrigatório (lista de 26: 020101 imóvel… 100301 "Demais serviços, em operações
    onerosas — local do domicílio principal do adquirente", o de contabilidade). Campos novos também: Município de
    incidência, Tipo de operação, Imóveis, Comércio Exterior (modo, vínculo, mecanismos de apoio, movimentação temporária).
  - Passo 4 ganha o bloco **IBS/CBS**: Base de cálculo, Valor IBS total, Valor CBS total, alíquotas efetivas (CBS 0,90% e
    IBS estadual 0,10% — alíquotas de teste de 2026), IBS estadual e municipal.
- **Outro estilo de validação:** faixa amarela com lista numerada — "Para avançar, por favor verifique a seguinte
  situação: 1. Código indicador da operação não preenchido."
- **Depois de emitir** (`/DPS/NFSe`): faixa verde "A NFS-e foi gerada com sucesso" + resumo (Chave de Acesso, Município
  Gerador, Competência, Emitente, Tomador, Intermediário, Serviço, NBS, Valor, Tributação do ISSQN, Município de
  incidência, Ajuste de BC, Base, Alíquota, ISSQN, **IBS**, **CBS**, Valor líquido) + botões **Baixar XML · Baixar DANFSe ·
  Visualizar NFS-e · NFS-e emitidas · Nova NFS-e**.
- **Lista de emitidas (versão da restrita):** "+ Nova NFS-e ▾" · botão de filtro (funil) · recarregar; aviso "Caso nenhum
  filtro tenha sido informado… últimos 30 dias. Para outros períodos, clique em Filtrar"; colunas Emissão ▾ · Emitida
  para · Competência · Município Emissor · Preço Serviço · Situação · ⋮ (Visualizar · Substituir · Cancelar NFS-e ·
  Download XML · Download DANFS-e).
- **Substituir** (`/DPS/Pessoas/?subst=…`): mesmos 4 passos **já preenchidos com a nota original**, cartão
  "SUBSTITUIÇÃO DE NFS-E" no topo de cada passo (chave substituída com botão de abrir, competência, valor), 4º passo
  chamado **Substituição** (ícone ⇅). Observações: o **valor do serviço fica travado** no da original; o CST/classificação
  do IBS/CBS e o indicador da operação **não vêm preenchidos** (tem que escolher de novo). Revisão: aviso "Revise… comparando
  com a NFS-e que será substituída. Os campos destacados em vermelho sofreram alteração" + **tabela de duas colunas "NFS-e
  original" × "NFS-e substituta"** em todas as seções (que abrem/fecham) + prévias lado a lado + **Emitir NFS-e Substituta**.
- **Sessão expirada:** abre a janela de login por cima da página (usuário/senha · certificado digital · gov.br).

## 9. Diferenças que o nosso precisa ter (o "do nosso jeito")
- **Vários contribuintes:** o Emissor Nacional é um login por empresa. No nosso, o Fiscal emite por várias empresas →
  um seletor de empresa no topo (no lugar do "Perfil"), e tudo (listas, rascunhos, favoritos, configurações) por empresa.
- **Tomadores salvos** (o nacional não guarda): buscar o tomador pelo CPF/CNPJ e preencher o passo 1.
- **Listas sem o limite de 30 dias** (é limite do portal, não da lei).
