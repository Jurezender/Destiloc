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

## 7.1 Tipos de bebida

`TipoBebida` possui os valores:

- `NaoDefinido`;
- `Cachaca`;
- `Whisky`;
- `Vodca`;
- `Gin`.

## 7.2 Estados da produção

`EstadoProducao` possui os valores:

- `Criado`;
- `EmProducao`;
- `Concluido`.

O fluxo de estado é:

Criado → EmProducao → Concluido

A primeira etapa registrada muda o lote de `Criado` para `EmProducao`. A
conclusão é explícita e nunca automática.

## 7.3 Cadastro do lote de produção

Somente contas com `PRODUTOR_ROLE` podem cadastrar lotes de produção.

Cada lote é cadastrado com:

- identificador on-chain `uint256`, sequencial e iniciado em 1;
- produtor responsável igual a `msg.sender`;
- `TipoBebida` diferente de `NaoDefinido`;
- `metadataURI` obrigatória;
- `criadoEm` igual a `block.timestamp`;
- `concluidoEm` inicialmente igual a 0;
- estado inicial `Criado`.

## 7.4 Vínculo de insumos

O produtor responsável pode vincular insumos ao lote enquanto seu estado for
`Criado` ou `EmProducao`.

Para vincular um insumo:

- a conta deve possuir `PRODUTOR_ROLE` no momento da operação;
- a conta deve ser o produtor responsável pelo lote;
- o insumo deve existir;
- o insumo deve estar válido;
- o insumo deve estar aprovado por aquele produtor no `ContratoInsumos`;
- não pode existir vínculo duplicado.

Os vínculos são append-only. Não existe desvinculação nesta versão.

## 7.5 Etapas permitidas

O sistema utiliza etapas genéricas:

- `PreparacaoBase`;
- `Fermentacao`;
- `Destilacao`;
- `Retificacao`;
- `Maturacao`;
- `Filtragem`;
- `Blendagem`;
- `Aromatizacao`;
- `AjusteFinal`.

Cada etapa pode ser registrada no máximo uma vez por lote nesta versão.

Não criar etapas específicas por bebida. Detalhes repetitivos, medições,
equipamentos, cortes e demais informações ficam no `metadataURI` da etapa.

Exemplo: "corte cabeça/coração/cauda" não é uma etapa; é uma informação
dentro da etapa `Destilacao`.

## 7.6 Registro de etapa

O registro de uma etapa contém conceitualmente:

- `loteId`;
- etapa;
- `executadoPor`;
- `inicioInformado`;
- `fimInformado`;
- `registradoEm`;
- `metadataURI`;
- relação com os insumos utilizados.

Para registrar uma etapa:

- a conta deve possuir `PRODUTOR_ROLE` no momento da operação;
- a conta deve ser o produtor responsável pelo lote;
- o lote não pode estar concluído;
- a etapa deve ser aplicável ao `TipoBebida`;
- a etapa ainda não pode ter sido registrada no lote;
- a precedência deve ser válida;
- `metadataURI` deve ser obrigatória;
- `inicioInformado` deve ser menor ou igual a `fimInformado`;
- `registradoEm` deve ser igual a `block.timestamp`.

`inicioInformado` e `fimInformado` são declarados pelo produtor.
`registradoEm` representa quando a informação entrou na blockchain.

Ao registrar uma etapa, o produtor pode informar zero ou vários insumos
utilizados. Cada insumo utilizado:

- deve estar previamente vinculado ao lote;
- deve continuar válido;
- deve continuar aprovado pelo produtor responsável;
- não pode aparecer mais de uma vez dentro da mesma etapa.

A relação entre etapa e insumos utilizados fica registrada on-chain e deve ser
consultável por total e índice. Uma etapa pode validamente não introduzir
nenhum novo insumo. O mesmo insumo pode ser utilizado em etapas diferentes do
mesmo lote.

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

Passa a ser obrigatória quando o produtor a declara aplicável ao lote.

## N/A

Não aplicável.

A etapa não deve ser registrada.

## 8.1 Configuração das etapas condicionais

As etapas condicionais configuráveis por bebida são:

- cachaça: `Maturacao` e `AjusteFinal`;
- whisky: `Blendagem` e `AjusteFinal`;
- vodca: `Retificacao` e `AjusteFinal`;
- gin: `AjusteFinal`.

A configuração condicional:

- é registrada on-chain;
- deve ser compatível com o `TipoBebida`;
- pode ser alterada somente enquanto o lote estiver em `Criado`;
- fica congelada após o registro da primeira etapa;
- não pode ser alterada em `EmProducao` ou `Concluido`.

Etapas OBR são sempre exigidas. Etapas OPC podem existir ou não e não precisam
de configuração. Etapas N/A não podem ser registradas.

Uma etapa COND somente pode ser registrada quando estiver declarada como
aplicável na configuração do lote. Se estiver configurada como não aplicável,
seu registro deve ser rejeitado.

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

Para atender ao requisito mínimo de insumos, pelo menos um insumo do tipo
`MateriaPrimaAgricola` deve ter sido efetivamente utilizado em alguma etapa.

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

Para atender ao requisito mínimo de insumos, pelo menos um insumo do tipo
`MateriaPrimaAgricola` deve ter sido efetivamente utilizado em alguma etapa.

---

## Vodca

Pode registrar, conforme aplicabilidade:

- Retificacao;
- Filtragem;
- Blendagem;
- Aromatizacao.

Não existe uma ordem universal artificial entre essas operações.

Se `AjusteFinal` for aplicável e registrado, ele deve ser a última etapa
produtiva e nenhuma outra etapa pode ser registrada depois dele.

Para atender ao requisito mínimo de insumos, pelo menos uma `BaseAlcoolica`
deve ter sido efetivamente utilizada em alguma etapa.

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

Para atender ao requisito mínimo de insumos, pelo menos uma `BaseAlcoolica` e
um `Zimbro` devem ter sido efetivamente utilizados em alguma etapa.

A aromatização pode ocorrer por:

- redestilação com zimbro;
- adição de extrato de zimbro.

`Agua`, `Levedura`, `Botanico` e `Outro` não são insumos universalmente
obrigatórios para a conclusão.

---

# 11. Regras de conclusão

A conclusão usa uma operação explícita equivalente a:

`concluirProducao(loteId, metadataURI)`

Somente o produtor responsável pode concluir a produção e ele deve possuir
`PRODUTOR_ROLE` no momento da operação. O lote deve estar em `EmProducao`.

Para concluir:

- pelo menos uma etapa deve ter sido registrada no lote;
- todas as etapas obrigatórias existirem;
- todas as etapas condicionais aplicáveis existirem;
- os tipos mínimos de insumo da bebida devem ter sido efetivamente utilizados;
- todos os insumos efetivamente utilizados devem continuar válidos;
- todos os insumos efetivamente utilizados devem continuar aprovados pelo
  produtor responsável;
- a `metadataURI` da conclusão deve ser obrigatória e válida.

Ao concluir:

- o estado passa a `Concluido`;
- `concluidoEm` recebe `block.timestamp`;
- a `metadataURI` da conclusão é registrada.

Depois de `Concluido`, o lote:

- não aceita novas etapas;
- não aceita novos vínculos de insumo;
- não aceita alteração da configuração;
- não aceita nova conclusão;
- permanece totalmente consultável;
- pode seguir para o `ContratoEnvasamento`.

Se um insumo efetivamente utilizado for invalidado ou rejeitado antes da
conclusão, a conclusão deve falhar. Se a produção já estiver concluída, uma
invalidação ou reavaliação posterior não altera retroativamente seu estado.

Para vodca, a exigência de pelo menos uma etapa significa que ao menos uma das
etapas produtivas permitidas deve ter sido efetivamente registrada.

Para rastreabilidade, deve ser possível distinguir um insumo apenas vinculado
de um insumo efetivamente utilizado. A utilização efetiva é o relacionamento
relevante para rastrear impacto e identificar as produções que utilizaram o
insumo.

Para rastreabilidade reversa, deve ser possível consultar, por total e índice,
quais lotes de produção efetivamente utilizaram determinado insumo. Se o mesmo
insumo for utilizado em várias etapas do mesmo lote, esse lote deve aparecer
apenas uma vez na relação reversa daquele insumo.

---

# 12. Regras de envasamento

## 12.1 Responsabilidade e acesso

O `ContratoEnvasamento` depende do `ContratoAcesso` e do `ContratoProducao`.

Somente contas com `ENVASADOR_ROLE` vigente podem registrar envasamentos e
emitir novas garrafas. Uma mesma conta pode possuir `PRODUTOR_ROLE` e
`ENVASADOR_ROLE`.

O contrato registra declarações do envasador autorizado e preserva autoria,
timestamp e relacionamentos. Ele não comprova a verdade física da declaração.

## 12.2 Envasamento

Cada envasamento referencia exatamente um lote de produção. Somente lotes de
produção existentes e concluídos podem ser envasados. Uma produção pode
possuir vários envasamentos.

A estrutura conceitual é:

```solidity
struct Envasamento {
    uint256 loteProducaoId;
    address envasador;
    uint256 quantidadeDeclarada;
    uint256 quantidadeEmitida;
    uint64 registradoEm;
    uint64 concluidoEm;
    string metadataURI;
}
```

Os IDs de envasamento são `uint256`, sequenciais e começam em 1.

O registro usa uma operação equivalente a:

```solidity
registrarEnvasamento(
    uint256 loteProducaoId,
    uint256 quantidadeDeclarada,
    string metadataURI
)
```

Para registrar:

- a conta deve possuir `ENVASADOR_ROLE` vigente;
- a produção deve existir e estar concluída;
- `quantidadeDeclarada` deve ser maior que zero;
- `metadataURI` deve ser obrigatória e válida;
- o envasador deve ser `msg.sender`;
- `quantidadeEmitida` deve iniciar em 0;
- `concluidoEm` deve iniciar em 0.

Uma produção pode possuir vários envasamentos. O contrato não controla estoque
ou saldo físico do lote de produção e não verifica se a quantidade física
declarada realmente existe.

## 12.3 Garrafas

As garrafas são identificadas individualmente por tokens ERC-721. Os token IDs
são `uint256`, globais, sequenciais e começam em 1.

A estrutura conceitual é:

```solidity
struct Garrafa {
    uint256 envasamentoId;
    uint64 emitidaEm;
}
```

A emissão pode ocorrer em múltiplas chamadas equivalentes a:

```solidity
emitirGarrafas(
    uint256 envasamentoId,
    uint256 quantidade
)
```

Cada chamada pode emitir múltiplas garrafas. Nesta versão, não existe limite
arbitrário de quantidade por transação. Emissões grandes podem ser divididas
pelo frontend em várias transações para respeitar limites de gas.

Para emitir:

- `quantidade` deve ser maior que zero;
- a conta deve ser o envasador original;
- a conta deve possuir `ENVASADOR_ROLE` vigente;
- a emissão não pode ultrapassar `quantidadeDeclarada`.

`quantidadeEmitida` acumula as emissões realizadas e nunca pode ultrapassar
`quantidadeDeclarada`.

Quando `quantidadeEmitida` atingir `quantidadeDeclarada`:

- `concluidoEm` recebe `block.timestamp`;
- o envasamento passa a ser considerado completo;
- não existe conclusão manual adicional.

Garrafas já emitidas permanecem válidas se o `ENVASADOR_ROLE` for revogado
posteriormente. A revogação impede apenas novas emissões.

## 12.4 Identidade digital não transferível

O ERC-721 é utilizado apenas como identidade digital individual da garrafa. As
garrafas são não transferíveis.

O ERC-721 possui:

- nome `Destiloc Garrafa`;
- símbolo `DSG`.

Devem ser bloqueados:

- `transferFrom`;
- `safeTransferFrom`;
- `approve`;
- `setApprovalForAll`;
- `burn`.

Não deve existir função pública de `burn`. A implementação também deve impedir
que tokens já emitidos sejam destruídos por qualquer mecanismo de
transferência ou atualização do ERC-721. Uma garrafa emitida permanece
registrada permanentemente.

O token pode ser emitido para o endereço do envasador responsável. `ownerOf` é
somente uma característica técnica do ERC-721 e não representa propriedade
jurídica, posse física ou autenticidade da garrafa.

Nesta versão, não existe `metadataURI` individual obrigatória para cada
garrafa. A `metadataURI` pertence ao envasamento e pode ser compartilhada por
suas garrafas. A individualização ocorre pelo `tokenId`, e `tokenURI(tokenId)`
pode retornar a `metadataURI` do envasamento correspondente.

## 12.5 Relacionamentos e consultas

A relação on-chain permite percorrer:

tokenId → envasamento → lote de produção

Também deve existir rastreabilidade reversa:

lote de produção → envasamentos → garrafas

As coleções usam consultas por total e índice.

O contrato deve oferecer consultas equivalentes a:

- `envasamentoExiste`;
- `obterEnvasamento`;
- `envasamentoConcluido`;
- `totalEnvasamentos`;
- `totalEnvasamentosDaProducao`;
- `envasamentoDaProducaoPorIndice`;
- `totalGarrafas`;
- `garrafaExiste`;
- `obterGarrafa`;
- `envasamentoDaGarrafa`;
- `totalGarrafasDoEnvasamento`;
- `garrafaDoEnvasamentoPorIndice`.

O QR Code não é armazenado on-chain. Ele é gerado no frontend e referencia o
`tokenId`.

A consulta pública segue:

tokenId → envasamento → produção → etapas → insumos → fornecedores/evidências

## 12.6 Fora do escopo

O `ContratoEnvasamento` não implementa:

- transporte;
- custódia;
- distribuidor;
- varejista;
- venda;
- propriedade do consumidor;
- estoque físico;
- transferência física;
- validação de autenticidade física.

---

# 13. Regras que não devem ser implementadas

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

# 14. Princípio principal do desenvolvimento

O agente de código deve implementar esta especificação.

Não deve alterar a arquitetura sem discussão.

Antes de modificar contratos:

1. Ler este documento.
2. Comparar com o código existente.
3. Informar divergências.
4. Solicitar confirmação antes de mudanças estruturais.
