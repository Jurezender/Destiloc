# Protótipo de rastreabilidade de bebidas destiladas — contratos

Contratos inteligentes e suíte de testes do TCC de Julia Rezende Rodrigues,
Bacharelado em Sistemas de Informação, Ifes Cachoeiro de Itapemirim.

## Estado atual

| Etapa | Situação |
|---|---|
| Refatoração dos contratos | concluída |
| Suíte de testes local | 92 testes, todos passando |
| Integração com o IPFS | não iniciada |
| Interface web | não iniciada |
| Implantação na Sepolia | **não realizada**, aguarda autorização |

## Versões exatas

As dependências estão fixadas sem intervalos, para que a instalação seja
reproduzível. O `package-lock.json` acompanha o projeto e deve ser versionado.

| Dependência | Versão |
|---|---|
| hardhat | 2.28.6 |
| @nomicfoundation/hardhat-toolbox | 5.0.0 |
| @openzeppelin/contracts | 5.6.1 |
| dotenv | 16.6.1 |
| solc | 0.8.24 |

Ambiente de referência: Node.js 22.22.2 e npm 10.9.7. O compilador Solidity é o
0.8.24, com otimizador ativo e alvo de EVM `cancun`, conforme `hardhat.config.js`.

## Como executar

Use `npm ci`, e não `npm install`. O `ci` instala exatamente o que está no
lockfile e falha se houver divergência, que é o comportamento desejado para
reproduzir os resultados.

```bash
npm ci
npm run compile
npm test
```

O resultado esperado é a compilação de 33 arquivos sem avisos e 92 testes
aprovados.

### Se a compilação não conseguir baixar o solc

O Hardhat obtém o compilador de `binaries.soliditylang.org` na primeira
compilação. Em redes que bloqueiam esse endereço, prepare o compilador a partir
do pacote npm `solc`, que já está entre as dependências:

```bash
npm run compilador:local
npm run compile
```

O script copia o compilador 0.8.24 distribuído pelo npm para o cache local do
Hardhat. Ele não faz nada quando o compilador nativo já está instalado e
operante, de modo que é seguro executá-lo em qualquer ambiente. Esse foi o
caminho utilizado durante a implementação do protótipo.

## Arquitetura

Três contratos implantáveis, em cadeia estritamente linear de dependências.

```
ContratoLote ◄────── ContratoTokenizacao ◄────── ContratoRastreamento
   (1º)                     (2º)                        (3º)
```

| Contrato | Granularidade | Responsabilidade |
|---|---|---|
| `ContratoLote` | Lote | Fluxo produtivo, do cadastro à conclusão |
| `ContratoTokenizacao` | Garrafa | Identidade digital individual, não transferível |
| `ContratoRastreamento` | Garrafa | Custódia posterior à emissão |

Dois arquivos de apoio não geram contrato implantável: `TiposCadeia.sol`, com os
enums e a validação sintática de referências IPFS, e `AcessoProtegido.sol`, com
o controle de acesso compartilhado.

## Sequência produtiva

Cada lote declara, no cadastro, a sequência que seu processo executa. A
gramática aceita é:

```
RecebimentoMateriaPrima
TransformacaoDestilacao+
( Envelhecimento | Finalizacao )*
Engarrafamento
```

A repetição de `TransformacaoDestilacao` existe porque determinados processos
possuem mais de um ciclo de transformação e destilação. O modelo não impõe uma
quantidade universal.

A emissão de garrafas é permitida somente após o registro digital da conclusão
da produção e do engarrafamento.

## Papéis

Os três papéis operacionais do `ContratoRastreamento` são mutuamente exclusivos.
Uma conta pode acumular a administração com um papel operacional, mas não pode
deter dois papéis operacionais ao mesmo tempo. Sem essa regra, o varejista não
seria terminal, já que uma conta com os papéis de varejista e distribuidor
poderia receber como varejista e expedir como distribuidor.

A saída do papel de administração, por revogação ou renúncia, é recusada quando
a conta seria a última administradora. A contagem vem de
`AccessControlEnumerable`, extensão do OpenZeppelin que mantém o conjunto de
detentores por papel.

## Suíte de testes

| Grupo | Testes | Cobre |
|---|---|---|
| A | 16 | Cadastro do lote e validação estrutural da sequência |
| B | 11 | Avanço da produção |
| C | 13 | Emissão das garrafas, incluindo atomicidade |
| D | 6 | Não transferibilidade do token |
| E | 18 | Custódia, expedição, confirmação e cancelamento |
| F | 11 | Concessão, revogação, renúncia e proteção do administrador |
| G | 5 | Histórico, separação de granularidade e imutabilidade |
| H | 6 | Exclusividade dos papéis operacionais |
| I | 6 | Revogação durante expedição pendente |

## Implantação

A implantação na Sepolia depende de autorização e ainda não foi realizada.
Quando autorizada, o script registra endereços, hashes, blocos e gas em
`implantacao-sepolia.json`.

```bash
npm run deploy:sepolia   # requer .env preenchido e autorizacao expressa
```
