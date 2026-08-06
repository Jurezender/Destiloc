# Protótipo de rastreabilidade de bebidas destiladas

TCC de Julia Rezende Rodrigues, Bacharelado em Sistemas de Informação, Ifes
Cachoeiro de Itapemirim. Contratos inteligentes (`contratos/`, com a suíte
de testes) e interface web (`frontend/`, React + MetaMask + IPFS/Kubo).

## Estado atual

| Etapa | Situação |
|---|---|
| Refatoração dos contratos | concluída |
| Suíte de testes local (contratos) | 92 testes, todos passando |
| Scripts de implantação (local + Sepolia) | concluídos, testados na rede `localhost` |
| Interface web (React + MetaMask) | implementada, testada na rede `localhost` (sem MetaMask real neste ambiente — ver "Interface web", abaixo) |
| Integração com o IPFS (Kubo local) | implementada, **não testada ao vivo** — sem daemon Kubo disponível neste ambiente |
| Fluxo completo em Hardhat local | validado de ponta a ponta por script (`contratos/scripts/fluxo-local.js`) e pela consulta pública real |
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

### Frontend

O frontend tem sua própria suíte, cobrindo a lógica pura de validação
(construtor de sequência produtiva e validação de referência IPFS), em
`frontend/src/lib/*.test.ts`. Não exige contratos implantados, nó local,
MetaMask nem Kubo:

```bash
cd frontend
npm ci
npm test        # vitest run
npm run typecheck
```

O restante da interface (leitura/escrita nos contratos, MetaMask, upload no
IPFS) não tem cobertura automatizada — é verificado pelo checklist manual em
"Interface web", abaixo, e por `contratos/scripts/fluxo-local.js`.

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

## Interface web

Em `frontend/`: React + Vite + TypeScript, com MetaMask para as rotas
operacionais e IPFS/Kubo local para os metadados. Não contém regra de
negócio própria — só lê e escreve nos três contratos, e sobe/recupera JSON
no IPFS.

Os endereços e as ABIs consumidos pela interface são gerados por
`contratos/scripts/exportar-frontend.js`, chamado automaticamente pelo
script de implantação (local ou Sepolia) — não são versionados, ficam em
`frontend/src/contracts/`. Sem eles, a interface sobe normalmente, mas
mostra um aviso claro em vez de travar (ver `ContratosIndisponiveisError`
em `frontend/src/contracts/index.ts`).

A consulta pública (`/consulta/:chainId/:tokenId`, acessada pelo QR code
impresso no rótulo) é somente leitura e não usa a MetaMask: lê diretamente
de um `JsonRpcProvider` apontado para a RPC configurada em
`frontend/.env`.

### Como rodar

Depende dos contratos implantados numa rede local (ver "Rede local" em
Implantação, mais abaixo):

```bash
cd frontend
npm ci
cp .env.example .env    # ajuste se os padrões locais não servirem
npm run dev
```

Abre em `http://localhost:5173`.

### Kubo/IPFS local

A interface envia e recupera metadados via a API HTTP do Kubo
(`VITE_KUBO_API_URL`, padrão `http://127.0.0.1:5001`) e um gateway
(`VITE_KUBO_GATEWAY_URL`, padrão `http://127.0.0.1:8080`), com um gateway
público (`ipfs.io`) como reserva de leitura se o nó local não responder.

Por padrão, o Kubo recusa requisições `POST` vindas de outra origem (a
página em `localhost:5173`). Rode uma vez, com o daemon **parado**:

```bash
ipfs config --json API.HTTPHeaders.Access-Control-Allow-Origin '["http://localhost:5173"]'
ipfs config --json API.HTTPHeaders.Access-Control-Allow-Methods '["PUT","POST","GET"]'
```

Depois inicie o daemon normalmente (`ipfs daemon`) e reinicie a cada vez que
a porta ou a origem mudarem.

### Rede na MetaMask (Hardhat local)

Adicione manualmente, se ainda não existir:

- Nome: `Hardhat Local`
- RPC: `http://127.0.0.1:8545`
- Chain ID: `31337`
- Moeda: `ETH`

Importe uma das contas de teste impressas por `npm run node:local` (nunca
use essas chaves privadas fora de uma rede local — são públicas e
conhecidas).

### Checklist manual do fluxo completo (com MetaMask de verdade)

O que dá para verificar sem a extensão MetaMask real já está coberto por
`contratos/scripts/fluxo-local.js` (roda o fluxo inteiro por script) e por
navegação automatizada nas rotas que não exigem assinatura — inclusive
`/consulta/:chainId/:tokenId`, testada de verdade contra dados reais gerados
pelo script. O que exige clicar de fato numa extensão MetaMask instalada
fica para este roteiro:

1. `cd contratos && npm run node:local` (deixe rodando) e, em outro
   terminal, `npm run deploy:local`.
2. Configure a rede "Hardhat Local" na MetaMask (ver seção acima) e importe
   uma das contas de teste impressas pelo `node:local`.
3. Opcional: rode `npm run fluxo:local` em `contratos/` para já ter um lote
   e uma garrafa prontos, ou cadastre os seus pela interface.
4. `cd ../frontend && npm run dev`, abra `http://localhost:5173`.
5. **Participantes**: com a conta administradora, conceda `FABRICANTE_ROLE`
   a uma segunda conta (nos três contratos), e `DISTRIBUIDOR_ROLE`/
   `VAREJISTA_ROLE` a outras duas, em "Participantes".
6. **Lote**: em "Lotes", registre um lote com o construtor de sequência, e
   registre cada etapa até o engarrafamento.
7. **Emissão**: com a produção concluída, gere os metadados no IPFS (exige
   o daemon Kubo rodando com CORS liberado, ver seção acima) e emita a
   garrafa.
8. **Expedição/confirmação**: em "Garrafas", expeça para o distribuidor;
   troque de conta na MetaMask para a do distribuidor e confirme o
   recebimento.
9. **Consulta pública**: copie o link/QR code da garrafa (mostrado no
   detalhe da garrafa) e abra numa aba anônima, sem a MetaMask conectada —
   confirme que o histórico completo aparece mesmo assim.

Cada uma dessas ações passa pelas validações da lista do pedido (lote/
garrafa inexistente, papel ausente, emissão antes da conclusão, referência
IPFS inválida, expedição com pendência aberta, confirmação por destinatário
errado, papel revogado) — tente forçar alguns desses casos (ex.: confirmar
com a conta errada) para ver a mensagem amigável em vez do erro cru da
MetaMask.

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

### Rede local (Hardhat), para desenvolvimento e teste

```bash
cd contratos
npm run node:local        # em um terminal à parte, deixa rodando
npm run deploy:local      # em outro terminal — implanta e exporta para o frontend
npm run fluxo:local       # opcional: roda o fluxo completo por script, sem interface
```

### Sepolia

A implantação na Sepolia depende de autorização e **ainda não foi
realizada**. Quando autorizada, o script registra endereços, hashes, blocos
e gas em `implantacao-sepolia.json`, e exporta os mesmos dados para
`frontend/src/contracts/enderecos.sepolia.json`.

Checklist antes de rodar `deploy:sepolia`:

- [ ] `npm run compile && npm test` limpos (33 arquivos, 92 testes) na versão que será implantada.
- [ ] `contratos/.env` preenchido com `SEPOLIA_RPC_URL` e `PRIVATE_KEY` de uma conta de teste, sem fundos reais além do necessário para o gas.
- [ ] Saldo de teste (Sepolia ETH) suficiente na conta implantadora.
- [ ] Autorização expressa do responsável pelo projeto para implantar nesta execução.

```bash
npm run deploy:sepolia   # requer .env preenchido e autorizacao expressa
```
