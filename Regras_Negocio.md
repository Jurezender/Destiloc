# Regras de Negócio - Protótipo Blockchain para Rastreabilidade de Bebidas

## 1. Objetivo do protótipo

O sistema tem como objetivo registrar e consultar a rastreabilidade da produção de bebidas alcoólicas destiladas utilizando blockchain.

O protótipo representa o fluxo:

Fornecedor → Produtor → Envasador → Consulta

A blockchain deve garantir:

- autoria dos registros;
- histórico imutável;
- rastreabilidade dos eventos;
- relacionamento entre insumos, produção e produto final.

A blockchain não substitui análises laboratoriais ou fiscalização. Ela registra declarações, documentos e evidências associados aos processos.

---

# 2. Atores do sistema

## Fornecedor

Responsabilidades:

- cadastrar insumos;
- registrar informações de procedência;
- adicionar documentos, fotos e evidências;
- disponibilizar lotes para avaliação.

Exemplos de insumos:

- matéria-prima agrícola;
- álcool neutro;
- água;
- zimbro;
- botânicos;
- leveduras.

---

## Produtor

Responsabilidades:

- avaliar insumos recebidos;
- aprovar ou rejeitar insumos;
- criar lotes de produção;
- vincular insumos ao lote;
- registrar etapas produtivas;
- concluir a produção.

---

## Envasador

Responsabilidades:

- receber somente lotes concluídos;
- registrar o envasamento;
- gerar identificação individual das garrafas.

---

## Consulta

Usuário sem permissão de escrita.

Pode consultar:

- origem dos insumos;
- etapas realizadas;
- produtor responsável;
- documentos associados;
- informações do produto final.

---

# 3. Controle de acesso (RBAC)

O sistema utiliza controle baseado em papéis.

Papéis principais:

- ADMIN
- FORNECEDOR_ROLE
- PRODUTOR_ROLE
- ENVASADOR_ROLE

Uma mesma organização pode possuir múltiplos papéis.

Exemplo:

Uma pequena destilaria pode ser:

- fornecedor de água própria;
- produtor da bebida;
- envasador.

O sistema controla permissões, não empresas.

---

# 4. Contratos principais

## ContratoAcesso

Responsável por:

- gerenciamento de papéis;
- autorização das operações;
- controle de permissões.

---

## ContratoInsumos

Responsável por:

- cadastro dos insumos;
- documentos e evidências;
- avaliação pelo produtor;
- aprovação/rejeição.

Fluxo:

Fornecedor registra:

INSUMO

↓

Produtor avalia:

APROVADO ou REJEITADO

↓

Insumo aprovado pode ser utilizado.

---

## ContratoProducao

Responsável por:

- criação dos lotes;
- registro das etapas;
- regras de precedência;
- conclusão da produção.

---

## ContratoEnvasamento

Responsável por:

- receber lotes concluídos;
- registrar envase;
- gerar identificação das garrafas.

---

# 5. Armazenamento de dados

## Blockchain

Armazena:

- identificadores;
- responsáveis;
- etapas realizadas;
- datas;
- relacionamentos;
- hashes/CIDs.

---

## IPFS

Armazena:

- fotos;
- laudos;
- documentos;
- informações técnicas detalhadas;
- metadados das etapas.

A blockchain guarda a referência ao conteúdo.

---

# 6. Regras de insumos

Um insumo possui três níveis:

## 1. Registrado

Fornecedor declarou a existência do insumo.

## 2. Vinculado ao lote

Produtor declarou que aquele insumo faz parte da produção.

## 3. Utilizado em uma etapa

Produtor declarou exatamente onde aquele insumo foi utilizado.

Exemplo:

Água:

Fornecedor registra INS-001

↓

Produtor aprova INS-001

↓

Lote VOD-001 utiliza INS-001

↓

AjusteFinal referencia INS-001

---

# 7. Regras gerais de produção

## Etapas permitidas

O sistema utiliza etapas genéricas:

- PreparacaoBase
- Fermentacao
- Destilacao
- Retificacao
- Maturacao
- Filtragem
- Blendagem
- Aromatizacao
- AjusteFinal

Não criar etapas específicas por bebida.

Exemplo:

"Corte cabeça/coração/cauda" não é uma etapa.

É uma informação dentro da etapa Destilacao.

---

# 8. Classificação das etapas

Cada bebida possui regras:

## OBR

Obrigatória.

Sem ela o lote não pode ser concluído.

## OPC

Opcional.

Pode existir ou não.

## COND

Condicional.

Depende da configuração escolhida.

## N/A

Não aplicável.

A etapa não deve ser registrada.

---

# 9. Matriz das bebidas

| Etapa | Cachaça | Whisky | Vodca | Gin |
|---|---|---|---|---|
| PreparacaoBase | OBR | OBR | N/A | N/A |
| Fermentacao | OBR | OBR | N/A | N/A |
| Destilacao | OBR | OBR | N/A | N/A |
| Retificacao | N/A | N/A | COND | N/A |
| Maturacao | COND | OBR | N/A | N/A |
| Filtragem | N/A | N/A | OPC | N/A |
| Blendagem | N/A | COND | OPC | N/A |
| Aromatizacao | N/A | N/A | OPC | OBR |
| AjusteFinal | COND | COND | COND | COND |

---

# 10. Regras específicas

## Cachaça

Fluxo principal:

PreparacaoBase

↓

Fermentacao

↓

Destilacao

↓

Maturacao (quando aplicável)

↓

AjusteFinal (quando aplicável)

---

## Whisky

Fluxo principal:

PreparacaoBase

↓

Fermentacao

↓

Destilacao

↓

Maturacao obrigatória

↓

Blendagem (quando aplicável)

↓

AjusteFinal (quando aplicável)

---

## Vodca

Fluxo principal:

Base alcoólica aprovada

↓

Processos opcionais:

- Retificacao;
- Filtragem;
- Blendagem;
- Aromatizacao.

↓

AjusteFinal

Observação:

A base alcoólica pode ser fornecida por outro participante.

---

## Gin

Fluxo principal:

Base alcoólica aprovada

+

Zimbro/extrato de zimbro aprovado

↓

Aromatizacao

↓

AjusteFinal

A aromatização pode ocorrer por:

- redestilação com zimbro;
- adição de extrato de zimbro.

---

# 11. Regras de conclusão

Um lote só pode ser concluído quando:

- todas as etapas obrigatórias existirem;
- todas as etapas condicionais aplicáveis existirem;
- todos os insumos utilizados estiverem aprovados;
- o produtor responsável registrar a conclusão.

Após concluído:

- novas etapas não podem ser adicionadas;
- o lote pode seguir para envasamento.

---

# 12. Regras que não devem ser implementadas

O contrato não deve validar:

- pH;
- Brix;
- temperatura;
- teor alcoólico;
- validade de laudos;
- qualidade química.

Esses dados são registrados como evidências.

A blockchain valida:

- quem registrou;
- quando registrou;
- qual lote;
- qual etapa;
- quais insumos foram relacionados.

---

# 13. Princípio principal do desenvolvimento

O agente de código deve implementar esta especificação.

Não deve alterar a arquitetura sem discussão.

Antes de modificar contratos:

1. Ler este documento.
2. Comparar com o código existente.
3. Informar divergências.
4. Solicitar confirmação antes de mudanças estruturais.