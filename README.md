# Protótipo de Rastreabilidade de Bebidas Destiladas

Trabalho de Conclusão de Curso do Bacharelado em Sistemas de Informação
Instituto Federal do Espírito Santo, Campus Cachoeiro de Itapemirim

Autoria: Julia Rezende Rodrigues
Orientação: Prof. Dr. João Paulo de Brito Gonçalves

## Sobre o projeto

Protótipo de rastreabilidade de bebidas destiladas apoiado em blockchain, cobrindo o ciclo completo desde o cadastro dos insumos até a consulta pública de uma garrafa individual pelo consumidor final.

O fluxo segue: o fornecedor cadastra o insumo; o produtor avalia e aprova (ou rejeita) o insumo; um insumo aprovado passa a poder ser vinculado a um lote de produção; o produtor cria e configura esse lote, vincula os insumos aprovados, registra as etapas de produção previstas para o tipo de bebida e conclui a produção; o envasador registra um envasamento referente a um lote de produção concluído e emite as garrafas correspondentes. Cada garrafa emitida recebe uma identidade individual não transferível, representada por um token ERC-721 vinculado ao envasamento — e, por meio dele, ao lote de produção, às etapas e aos insumos utilizados. A consulta pública percorre essa cadeia (garrafa → envasamento → produção → etapas → insumos → fornecedores) sem exigir carteira conectada.

O controle de acesso é baseado em papéis — administrador, fornecedor, produtor e envasador —, geridos pelo `ContratoAcesso`; uma mesma conta pode acumular mais de um papel.

## Estrutura do repositório

| Diretório | Conteúdo |
|---|---|
| `contratos/` | Contratos inteligentes em Solidity, suíte de testes automatizados e scripts de implantação |
| `frontend/` | Interface web em React, integrada à MetaMask para conexão da carteira e envio de transações |
| `backend/` | API em Node.js com Fastify, integrada ao PostgreSQL (Neon) e ao Pinata IPFS |

## Estado de validação

Os contratos seguem a arquitetura atual (`ContratoAcesso`, `ContratoInsumos`, `ContratoProducao` e `ContratoEnvasamento`) e a suíte de 134 testes passa integralmente na rede Hardhat local, distribuída nos grupos J a N. Os scripts de implantação foram executados com sucesso contra `localhost`.

O fluxo completo, do cadastro do insumo até a consulta pública da garrafa, é validado de ponta a ponta pelo grupo de testes `N. Fluxo completo da arquitetura nova` (`contratos/test/12-fluxo-completo.js`).

A interface web está implementada e foi exercitada contra a rede local. A integração com o IPFS via Pinata também está implementada. Ambas dependem de recursos externos ao processo de teste, a extensão MetaMask e as credenciais do Pinata, e por isso a verificação delas é manual. O roteiro está na seção [Interface web](#interface-web).

Os contratos foram implantados na Sepolia Testnet em 2026-09-13. Os endereços estão registrados em `contratos/implantacao-sepolia.json` e listados na seção [Implantação na Sepolia](#implantação-na-sepolia).

## Pré-requisitos

| Requisito | Versão usada no desenvolvimento |
|---|---|
| Node.js | 22.22.2 |
| npm | 10.9.7 |
| MetaMask | Extensão de navegador, versão atual |
| Conta no Pinata | Plano gratuito é suficiente — gere um JWT em https://app.pinata.cloud/developers/api-keys |

## Versões fixadas

As dependências estão fixadas sem intervalo, sem `^` e sem `~`, para que a instalação seja reproduzível. O arquivo `package-lock.json` faz parte do repositório e não deve ser ignorado.

### Contratos

| Dependência | Versão |
|---|---|
| `hardhat` | 2.28.6 |
| `@nomicfoundation/hardhat-toolbox` | 5.0.0 |
| `@openzeppelin/contracts` | 5.6.1 |
| `dotenv` | 16.6.1 |
| `solc` | 0.8.24 |

O compilador Solidity é o 0.8.24, com o otimizador habilitado e alvo de EVM `cancun`, conforme definido em `hardhat.config.js`.

### Frontend

| Dependência | Versão |
|---|---|
| `react` | 19.2.8 |
| `react-dom` | 19.2.8 |
| `ethers` | 6.17.0 |
| `react-router-dom` | 7.18.2 |
| `qrcode.react` | 4.2.0 |
| `vite` | 8.2.0 |
| `vitest` | 4.1.10 |
| `typescript` | 7.0.2 |

## Variáveis de ambiente

Copie `.env.example` para `.env` em cada módulo que exigir configuração e preencha os valores.

| Variável | Módulo | Descrição |
|---|---|---|
| `SEPOLIA_RPC_URL` | `contratos` | Endpoint RPC do provedor de acesso à Sepolia |
| `PRIVATE_KEY` | `contratos` | Chave privada da conta de implantação |
| `VITE_RPC_URL_LOCALHOST` | `frontend` | RPC usada pela consulta pública (sem MetaMask) na rede local |
| `VITE_RPC_URL_SEPOLIA` | `frontend` | RPC usada pela consulta pública (sem MetaMask) na Sepolia |
| `VITE_API_URL` | `frontend` | URL do backend Destiloc (padrão: `http://localhost:3001`) |
| `VITE_PUBLIC_APP_URL` | `frontend` | URL base da aplicação; usada na geração dos QR Codes em produção (opcional em desenvolvimento) |
| `PINATA_JWT` | `backend` | JWT do Pinata, para enviar metadados ao IPFS |
| `DATABASE_URL` | `backend` | String de conexão PostgreSQL |
| `CORS_ORIGIN` | `backend` | Origem permitida pelo CORS (URL do frontend em produção) |
| `NODE_ENV` | `backend` | Ambiente de execução (`development` ou `production`) |

A chave privada nunca deve ser versionada. Confirme que `.env` está listado no `.gitignore`.

## Como executar

### Contratos

O comando de instalação é `npm ci` e não `npm install`. O `npm ci` instala exatamente o que está descrito no lockfile e falha diante de qualquer divergência, o que é o comportamento desejado para garantir reprodutibilidade.

```bash
cd contratos
npm ci
npm run compile
npm test
```

Para executar o fluxo completo contra uma rede local, deixe um nó Hardhat rodando em um terminal e implante os contratos no outro.

```bash
npm run node:local        # em um terminal à parte, deixa rodando
```

```bash
npm run deploy:local      # em outro terminal — implanta e exporta para o frontend
```

### IPFS / Pinata

Os metadados fora da cadeia são enviados ao Pinata (https://pinata.cloud) pelo backend. Não é necessário instalar nenhum daemon local.

Gere um JWT em https://app.pinata.cloud/developers/api-keys e configure-o em `backend/.env`:

```
PINATA_JWT=seu_jwt_aqui
```

O JWT fica exclusivamente no backend — nunca é exposto no bundle do frontend. O valor real nunca deve ser versionado. O arquivo `backend/.env` está listado no `backend/.gitignore`.

### Interface web

```bash
cd frontend
npm ci
npm run dev
```

Verificação manual da interface, na ordem:

1. Suba o nó Hardhat local e implante os contratos, anotando os endereços resultantes.
2. Confirme que os endereços implantados estão configurados no frontend.
3. Adicione a rede local à MetaMask, apontando para `http://127.0.0.1:8545` com o `chainId` correspondente.
4. Importe para a MetaMask contas de teste geradas pelo nó Hardhat e conceda a elas os papéis necessários (fornecedor, produtor, envasador) na tela Participantes.
5. Conecte a carteira pela interface e confirme que o(s) papel(is) atribuído(s) à conta são reconhecidos corretamente.
6. Como fornecedor, cadastre um lote de insumo; como produtor, avalie e aprove esse insumo.
7. Como produtor, crie e configure um lote de produção, vincule o insumo aprovado, registre as etapas previstas para o tipo de bebida e conclua a produção.
8. Como envasador, registre um envasamento referente ao lote concluído e emita as garrafas.
9. Leia o QR Code de uma garrafa em um navegador sem carteira conectada e confirme que a consulta pública retorna o histórico esperado.

Tentativas de executar operações fora da sequência válida ou a partir de uma conta sem o papel exigido devem ser rejeitadas pelo contrato. Essas rejeições são o comportamento correto e evidenciam que as regras estão sendo aplicadas na cadeia.

### Backend

```bash
cd backend
npm ci
cp .env.example .env   # preencha DATABASE_URL, PINATA_JWT e CORS_ORIGIN
npm run dev
```

O backend sobe na porta configurada em `PORT` (padrão: 3001). O endpoint de saúde `GET /health` retorna `{"status":"ok"}` quando o servidor está pronto.

## Implantação na Sepolia

Implantação realizada em 2026-09-13. Registro completo em `contratos/implantacao-sepolia.json`.

| Contrato | Endereço |
|---|---|
| `ContratoAcesso` | `0x3f1c9F542AF7D5a7Bfd386F4b645d396bea69766` |
| `ContratoInsumos` | `0x95173eDFc3606826242fb9cd9e30a3D8C4005390` |
| `ContratoProducao` | `0xb73b6a9A06E3EE3c81D1F3A383f8586017137Da3` |
| `ContratoEnvasamento` | `0xE8C40B72A80E960405AbDCb555046A9ec1EE45CC` |

## Licença

MIT, conforme já declarado em `contratos/package.json`. Falta incluir o arquivo `LICENSE` na raiz do repositório.
