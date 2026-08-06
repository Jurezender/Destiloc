# Protótipo de rastreabilidade de bebidas destiladas

Este é o protótipo do meu TCC (Bacharelado em Sistemas de Informação, Ifes
Cachoeiro de Itapemirim): rastreabilidade de bebidas destiladas usando
blockchain, do lote de produção até a garrafa individual. Duas partes:
contratos inteligentes em `contratos/` (com a suíte de testes) e a interface
web em `frontend/` (React + MetaMask + IPFS/Kubo).

## Onde as coisas estão

Os contratos estão prontos: refatorados, com 92 testes passando localmente e
os scripts de implantação testados na rede `localhost`. A interface web
também está implementada e testada na rede local, mas não tenho como testar
com a extensão MetaMask de verdade neste ambiente — o roteiro pra fazer isso
manualmente está mais abaixo, em "Interface web". A integração com IPFS
(Kubo local) está implementada, mas também não testada ao vivo, porque não
tenho um daemon Kubo disponível aqui. O fluxo completo, do cadastro do lote
até a consulta pública, já validei de ponta a ponta pelo script
`contratos/scripts/fluxo-local.js`. A implantação na Sepolia eu ainda não
fiz — é a próxima etapa, só não dá pra fazer tudo de uma vez.

## Versões exatas

Fixei as dependências sem intervalo (sem `^` nem `~`) pra instalação ficar
reproduzível. O `package-lock.json` vai junto no repositório, não é pra
ignorar.

| Dependência | Versão |
|---|---|
| hardhat | 2.28.6 |
| @nomicfoundation/hardhat-toolbox | 5.0.0 |
| @openzeppelin/contracts | 5.6.1 |
| dotenv | 16.6.1 |
| solc | 0.8.24 |

Desenvolvi usando Node.js 22.22.2 e npm 10.9.7. O compilador Solidity é o
0.8.24, com otimizador ligado e alvo de EVM `cancun` (ver `hardhat.config.js`).

## Como executar

Uso `npm ci` em vez de `npm install` de propósito: ele instala exatamente o
que está no lockfile e falha se houver qualquer divergência, que é o que eu
quero pra garantir que o resultado é reproduzível.

```bash
cd contratos
npm ci
npm run compile
npm test
```

O esperado é compilar 33 arquivos sem avisos e passar os 92 testes.

### Se a compilação não conseguir baixar o solc

O Hardhat busca o compilador em `binaries.soliditylang.org` na primeira
compilação. Se a sua rede bloquear esse endereço (foi o meu caso), dá pra
preparar o compilador a partir do pacote `solc` do npm, que já está entre as
dependências:

```bash
npm run compilador:local
npm run compile
```

Esse script copia o compilador 0.8.24 do npm pro cache local do Hardhat. Se
o compilador nativo já estiver instalado e funcionando, ele não faz nada —
então é seguro rodar em qualquer ambiente. Foi o caminho que usei durante
todo o desenvolvimento.

### Frontend

O frontend tem sua própria suíte, mas cobre só a lógica pura de validação
(o construtor de sequência produtiva e a validação de referência IPFS), em
`frontend/src/lib/*.test.ts`. Não precisa de contratos implantados, nó
local, MetaMask nem Kubo pra rodar:

```bash
cd frontend
npm ci
npm test        # vitest run
npm run typecheck
```

O resto da interface — leitura/escrita nos contratos, MetaMask, upload no
IPFS — não tem cobertura automatizada. Isso eu verifico pelo checklist
manual lá embaixo, em "Interface web", e pelo `contratos/scripts/fluxo-local.js`.

## Arquitetura

São três contratos implantáveis, numa cadeia de dependência bem linear:

```
ContratoLote ◄────── ContratoTokenizacao ◄────── ContratoRastreamento
   (1º)                     (2º)                        (3º)
```

| Contrato | Granularidade | Responsabilidade |
|---|---|---|
| `ContratoLote` | Lote | Fluxo produtivo, do cadastro à conclusão |
| `ContratoTokenizacao` | Garrafa | Identidade digital individual, não transferível |
| `ContratoRastreamento` | Garrafa | Custódia posterior à emissão |

Tem mais dois arquivos de apoio que não geram contrato implantável:
`TiposCadeia.sol`, com os enums e a validação sintática de referências IPFS,
e `AcessoProtegido.sol`, com o controle de acesso compartilhado entre os
outros três.

## Interface web

Em `frontend/`: React + Vite + TypeScript, MetaMask nas rotas operacionais e
IPFS/Kubo local pros metadados. Não tem regra de negócio própria — só lê e
escreve nos três contratos, e sobe/recupera JSON no IPFS.

Os endereços e as ABIs que a interface consome são gerados por
`contratos/scripts/exportar-frontend.js`, chamado automaticamente pelo
script de implantação (local ou Sepolia). Não versiono esses arquivos —
ficam em `frontend/src/contracts/`. Sem eles a interface ainda sobe, só
mostra um aviso claro em vez de travar (dá uma olhada em
`ContratosIndisponiveisError`, em `frontend/src/contracts/index.ts`).

A consulta pública (`/consulta/:chainId/:tokenId`, a rota do QR code
impresso no rótulo) é só leitura e não usa MetaMask: lê direto de um
`JsonRpcProvider` apontado pra RPC configurada em `frontend/.env`.

### Como rodar

Precisa dos contratos já implantados numa rede local (ver "Rede local" em
Implantação, mais abaixo):

```bash
cd frontend
npm ci
cp .env.example .env    # ajuste se os padrões locais não servirem pro seu caso
npm run dev
```

Abre em `http://localhost:5173`.

### Kubo/IPFS local

A interface manda e busca metadados pela API HTTP do Kubo
(`VITE_KUBO_API_URL`, padrão `http://127.0.0.1:5001`) e por um gateway
(`VITE_KUBO_GATEWAY_URL`, padrão `http://127.0.0.1:8080`), com um gateway
público (`ipfs.io`) de reserva pra leitura, caso o nó local não responda.

Por padrão o Kubo recusa requisição `POST` vinda de outra origem (a página
em `localhost:5173` conta como outra origem). Rode isto uma vez, com o
daemon **parado**:

```bash
ipfs config --json API.HTTPHeaders.Access-Control-Allow-Origin '["http://localhost:5173"]'
ipfs config --json API.HTTPHeaders.Access-Control-Allow-Methods '["PUT","POST","GET"]'
```

Depois é só iniciar o daemon normalmente (`ipfs daemon`), e repetir sempre
que a porta ou a origem mudarem.

### Rede na MetaMask (Hardhat local)

Se ainda não tiver, adicione manualmente:

- Nome: `Hardhat Local`
- RPC: `http://127.0.0.1:8545`
- Chain ID: `31337`
- Moeda: `ETH`

E importe uma das contas de teste que aparecem no terminal quando roda
`npm run node:local` (essas chaves privadas são públicas e conhecidas —
nunca use fora de uma rede local).

### Checklist manual do fluxo completo (com MetaMask de verdade)

O que dá pra verificar sem a extensão MetaMask instalada eu já cobri com o
`contratos/scripts/fluxo-local.js` (roda o fluxo inteiro por script) e com
navegação automatizada nas rotas que não pedem assinatura — inclusive
`/consulta/:chainId/:tokenId`, testada de verdade com dados reais gerados
pelo script. O que exige clicar de fato numa MetaMask instalada, fica pra
esse roteiro:

1. `cd contratos && npm run node:local` (deixa rodando) e, em outro
   terminal, `npm run deploy:local`.
2. Configura a rede "Hardhat Local" na MetaMask (seção acima) e importa uma
   das contas de teste que o `node:local` imprimiu.
3. Opcional: roda `npm run fluxo:local` em `contratos/` pra já ter um lote e
   uma garrafa prontos, ou cadastra os seus pela interface mesmo.
4. `cd ../frontend && npm run dev`, abre `http://localhost:5173`.
5. **Participantes**: com a conta administradora, concede `FABRICANTE_ROLE`
   a uma segunda conta (nos três contratos), e `DISTRIBUIDOR_ROLE`/
   `VAREJISTA_ROLE` a outras duas, em "Participantes".
6. **Lote**: em "Lotes", registra um lote pelo construtor de sequência, e
   registra cada etapa até o engarrafamento.
7. **Emissão**: com a produção concluída, gera os metadados no IPFS (precisa
   do daemon Kubo rodando com o CORS liberado, seção acima) e emite a
   garrafa.
8. **Expedição/confirmação**: em "Garrafas", expede pro distribuidor; troca
   de conta na MetaMask pra do distribuidor e confirma o recebimento.
9. **Consulta pública**: copia o link/QR code da garrafa (aparece no detalhe
   dela) e abre numa aba anônima, sem a MetaMask conectada — confere que o
   histórico completo aparece mesmo assim.

Cada uma dessas ações passa pelas validações que defini no pedido (lote ou
garrafa inexistente, papel ausente, emissão antes da conclusão, referência
IPFS inválida, expedição com pendência aberta, confirmação pelo destinatário
errado, papel revogado) — vale tentar forçar alguns desses casos (por
exemplo, confirmar com a conta errada) só pra ver a mensagem amigável
aparecendo em vez do erro cru da MetaMask.

## Sequência produtiva

No cadastro, cada lote declara a sequência que o processo vai seguir. A
gramática que aceito é:

```
RecebimentoMateriaPrima
TransformacaoDestilacao+
( Envelhecimento | Finalizacao )*
Engarrafamento
```

A repetição de `TransformacaoDestilacao` existe porque alguns processos
passam por mais de um ciclo de transformação e destilação — não quis travar
o modelo numa quantidade fixa.

A emissão de garrafas só é permitida depois que a conclusão da produção e o
engarrafamento estiverem registrados na cadeia.

## Papéis

Os três papéis operacionais do `ContratoRastreamento` são mutuamente
exclusivos. Uma conta pode acumular a administração com um papel
operacional, mas não pode ter dois papéis operacionais ao mesmo tempo. Sem
essa regra o varejista deixaria de ser terminal — uma conta com os papéis de
varejista e distribuidor ao mesmo tempo poderia receber como varejista e
expedir como distribuidor, o que não faz sentido no fluxo.

A saída do papel de administração, seja por revogação ou renúncia, é
recusada quando a conta seria a última administradora. Essa contagem vem do
`AccessControlEnumerable`, extensão do OpenZeppelin que mantém o conjunto de
quem tem cada papel.

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

### Rede local (Hardhat), pra desenvolvimento e teste

```bash
cd contratos
npm run node:local        # em um terminal à parte, deixa rodando
npm run deploy:local      # em outro terminal — implanta e exporta para o frontend
npm run fluxo:local       # opcional: roda o fluxo completo por script, sem interface
```

### Sepolia

Ainda não implantei na Sepolia — ainda não chegou a vez dessa etapa. Quando
implantar, o script vai registrar endereços, hashes, blocos e gas em
`implantacao-sepolia.json`, e exportar os mesmos dados pra
`frontend/src/contracts/enderecos.sepolia.json`.

Checklist que sigo antes de rodar `deploy:sepolia`:

- [ ] `npm run compile && npm test` limpos (33 arquivos, 92 testes) na versão que vou implantar.
- [ ] `contratos/.env` preenchido com `SEPOLIA_RPC_URL` e `PRIVATE_KEY` de uma conta de teste, sem fundos reais além do necessário pro gas.
- [ ] Saldo de teste (Sepolia ETH) suficiente na conta implantadora.

```bash
npm run deploy:sepolia   # requer .env preenchido
```
