# Interface web — rastreabilidade de bebidas destiladas

React + Vite + TypeScript, MetaMask e IPFS/Kubo local por cima dos três
contratos em `../contratos/`. Não contém regra de negócio própria: só lê e
escreve nos contratos, e sobe/recupera metadados no IPFS.

## Pré-requisitos

Os endereços e ABIs dos contratos são gerados por `contratos/scripts/`, não
versionados aqui. Antes de rodar esta aplicação pela primeira vez:

```bash
cd ../contratos
npm ci
npm run compile
npm run node:local      # em um terminal à parte, deixa rodando
npm run deploy:local    # em outro terminal
```

Isso preenche `src/contracts/abi/*.json` e `src/contracts/enderecos.localhost.json`.
Sem isso, a interface sobe normalmente, mas mostra um aviso claro em vez de
travar (ver `ContratosIndisponiveisError` em `src/contracts/index.ts`).

## Como rodar

```bash
npm ci
cp .env.example .env    # ajuste se os padrões locais não servirem
npm run dev
```

Abre em `http://localhost:5173`. `npm run typecheck` e `npm test` (vitest,
lógica pura de validação) também estão disponíveis.

## Kubo/IPFS local

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

## Rede na MetaMask (Hardhat local)

Adicione manualmente, se ainda não existir:

- Nome: `Hardhat Local`
- RPC: `http://127.0.0.1:8545`
- Chain ID: `31337`
- Moeda: `ETH`

Importe uma das contas de teste impressas por `npm run node:local` (nunca
use essas chaves privadas fora de uma rede local — são públicas e
conhecidas).

## Checklist manual do fluxo completo (com MetaMask de verdade)

O que eu consigo verificar sem a extensão MetaMask real já está coberto por
`contratos/scripts/fluxo-local.js` (roda o fluxo inteiro por script) e por
navegação automatizada nas rotas que não exigem assinatura — inclusive
`/consulta/:chainId/:tokenId`, testada de verdade contra dados reais gerados
pelo script. O que exige clicar de fato numa extensão MetaMask instalada
fica para você conferir com este roteiro:

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
