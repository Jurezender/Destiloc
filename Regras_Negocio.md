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
- aprovação/rejeição;
- correções documentais;
- invalidação de lotes de insumo.

O contrato mantém uma referência `immutable` ao `ContratoAcesso`. Seu
construtor deve rejeitar `address(0)` e endereço sem código.

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

As referências IPFS armazenadas on-chain usam URI completa no formato
`ipfs://<CID>` e recebem o nome `metadataURI` no código.

Nesta versão, a validação é apenas sintática: verifica o prefixo `ipfs://` e
limites de comprimento. O contrato não valida existência, disponibilidade,
autenticidade nem conteúdo do CID.

---

# 6. Regras de insumos

## 6.1 Cadastro do lote de insumo

Somente contas com `FORNECEDOR_ROLE`, consultado no `ContratoAcesso`, podem
registrar lotes de insumo.

Cada lote de insumo possui:

- identificador único on-chain do tipo `uint256`;
- fornecedor responsável;
- tipo do insumo;
- `metadataURI` obrigatório;
- timestamp do registro.

Formatos visuais como `INS-001` pertencem ao frontend e não são armazenados
como identificador on-chain.

`TipoInsumo` possui os valores:

- `NaoDefinido`;
- `MateriaPrimaAgricola`;
- `BaseAlcoolica`;
- `Agua`;
- `Levedura`;
- `Zimbro`;
- `Botanico`;
- `Outro`.

`Zimbro` inclui bagas ou derivados/extrato de zimbro. Os detalhes ficam no
metadata referenciado por `metadataURI`.

Documentos, fotos, laudos, informações de procedência e detalhes técnicos não
são armazenados diretamente on-chain. A blockchain registra autoria,
referência e histórico, sem validar autenticidade física, qualidade química ou
veracidade dos documentos.

## 6.2 Avaliação por produtor

Para registrar uma nova avaliação, a conta deve possuir `PRODUTOR_ROLE` no
`ContratoAcesso` no momento da operação.

`ResultadoAvaliacao` possui os valores:

- `NaoAvaliado`;
- `Aprovado`;
- `Rejeitado`.

A avaliação é específica para o par produtor e lote de insumo. Não existe
aprovação global: um produtor pode aprovar um insumo enquanto outro o rejeita.

Toda avaliação exige `metadataURI`, usada para registrar justificativa,
observações e/ou evidências no IPFS.

Reavaliações são permitidas. O histórico é append-only, nunca é sobrescrito e
a avaliação mais recente daquele produtor para aquele insumo é a vigente.

Avaliações já registradas continuam no histórico mesmo se o
`PRODUTOR_ROLE` da conta for revogado posteriormente.

Nesta versão, não é mantido um índice global de todos os produtores que
avaliaram um insumo.

## 6.3 Correção documental

Para adicionar um registro de correção documental, a conta deve ser o
fornecedor original daquele lote e possuir `FORNECEDOR_ROLE` no
`ContratoAcesso` no momento da operação.

As correções usam novos `metadataURI`, são append-only e não sobrescrevem o
`metadataURI` original.

Correção documental não equivale à invalidação do lote.

## 6.4 Invalidação

Para invalidar um lote de insumo, a conta deve ser o fornecedor original
daquele lote e possuir `FORNECEDOR_ROLE` no `ContratoAcesso` no momento da
operação. Ser administrador não concede permissão para invalidar lotes, e
produtores podem rejeitar um insumo para si, mas não invalidá-lo globalmente.

A invalidação:

- é definitiva e não permite reativação;
- exige `metadataURI`;
- registra timestamp;
- preserva para consulta os dados, correções e avaliações anteriores.

Depois de invalidado, o lote fica definitivamente encerrado para novas
operações. Ele continua totalmente consultável e preserva seu cadastro, suas
correções e suas avaliações anteriores, mas:

- não aceita novas avaliações;
- não aceita novas correções documentais;
- não pode ser invalidado novamente;
- não pode ser reativado.

A autoria histórica do lote permanece mesmo se o `FORNECEDOR_ROLE` do
fornecedor for revogado posteriormente, mas a conta sem o papel vigente não
pode registrar novas correções nem invalidar o lote.

Um lote invalidado nunca é considerado aprovado para novos usos, mesmo que a
avaliação vigente de determinado produtor seja `Aprovado`.

Um lote substituto é cadastrado como novo insumo, com novo ID. Nesta versão,
não existe relação on-chain obrigatória entre o lote anterior e o substituto.

## 6.5 Relacionamento futuro com a produção

Um insumo possui três níveis:

1. registrado pelo fornecedor;
2. vinculado a um lote de produção pelo produtor;
3. registrado como utilizado em uma etapa de produção.

A vinculação e o registro de utilização pertencem ao futuro
`ContratoProducao`, não ao `ContratoInsumos`.

O futuro `ContratoProducao` deve verificar se o insumo está válido e aprovado
por aquele produtor:

- ao vinculá-lo ao lote de produção;
- ao registrá-lo como utilizado em uma etapa;
- novamente ao concluir a produção.

Uma invalidação ou reavaliação posterior não altera retroativamente uma
produção já concluída.

Exemplo:

Água:

Fornecedor registra INS-001

↓

Produtor aprova INS-001

↓

Lote VOD-001 utiliza INS-001

↓

AjusteFinal referencia INS-001

## 6.6 Consultas

Consultas de coleções devem preferir funções de total e acesso por índice,
evitando retornar arrays completos sem limite.

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
- todos os insumos utilizados estiverem válidos e aprovados pelo produtor
  responsável no momento da conclusão;
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
