# Protótipo de Rastreabilidade de Bebidas Destiladas

Trabalho de Conclusão de Curso do Bacharelado em Sistemas de Informação
Instituto Federal do Espírito Santo, Campus Cachoeiro de Itapemirim

Autoria: Julia Rezende Rodrigues
Orientação: Prof. Dr. João Paulo de Brito Gonçalves

## Sobre o projeto

Protótipo de rastreabilidade de bebidas destiladas apoiado em blockchain, cobrindo o ciclo completo desde o registro do lote de produção até a verificação de uma garrafa individual pelo consumidor final.

A identidade de cada garrafa é representada por um token ERC-721 não transferível. Os eventos de produção pertencem ao lote e seguem uma gramática estrutural que impõe uma sequência válida de etapas. A transferência de custódia acontece em duas fases, expedição e confirmação, com reverificação do papel do destinatário no momento da confirmação. O controle de acesso é baseado em papéis, com exclusividade mútua entre os papéis operacionais, de modo que o varejista é um estado terminal.

## Estrutura do repositório

| Diretório | Conteúdo |
|---|---|
| `contratos/` | Contratos inteligentes em Solidity, suíte de testes automatizados e scripts de implantação |
| `frontend/` | Interface web em React, integrada à MetaMask para autenticação e envio de transações |

## Estado de validação

Os contratos estão refatorados e a suíte de 92 testes passa integralmente na rede local. Os scripts de implantação foram executados com sucesso contra `localhost`.

O fluxo completo, do cadastro do lote até a consulta pública, foi validado de ponta a ponta pelo script `contratos/scripts/fluxo-local.js`.

A interface web está implementada e foi exercitada contra a rede local. A integração com o IPFS via nó Kubo local também está implementada. Ambas dependem de recursos externos ao processo de teste, a extensão MetaMask e o daemon Kubo em execução, e por isso a verificação delas é manual. O roteiro está na seção [Interface web](#interface-web).

A implantação na Sepolia Testnet ainda não foi realizada.

## Pré-requisitos

| Requisito | Versão usada no desenvolvimento |
|---|---|
| Node.js | 22.22.2 |
| npm | 10.9.7 |
| Kubo (IPFS) | Não há versão fixada pelo projeto; qualquer build recente serve |
| MetaMask | Extensão de navegador, versão atual |

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
| `VITE_KUBO_API_URL` | `frontend` | API HTTP do nó Kubo local, para enviar metadados |
| `VITE_KUBO_GATEWAY_URL` | `frontend` | Gateway do nó Kubo local, para recuperar metadados |

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
npm run fluxo:local       # opcional: roda o fluxo completo por script, sem interface
```

### Nó IPFS

O armazenamento fora da cadeia depende de um nó Kubo em execução na máquina local. A RPC administrativa fica restrita a `localhost`.

Por padrão, o Kubo recusa requisições `POST` vindas de outra origem — a página da interface, em `localhost:5173`, conta como outra origem. Rode uma vez, com o daemon **parado**:

```bash
ipfs config --json API.HTTPHeaders.Access-Control-Allow-Origin '["http://localhost:5173"]'
ipfs config --json API.HTTPHeaders.Access-Control-Allow-Methods '["PUT","POST","GET"]'
```

Depois inicie o daemon normalmente, e repita a configuração sempre que a porta ou a origem mudarem.

```bash
ipfs daemon
```

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
4. Importe para a MetaMask uma das contas de teste geradas pelo nó Hardhat.
5. Conecte a carteira pela interface e confirme que o papel atribuído à conta é reconhecido corretamente.
6. Cadastre um lote, registre os eventos de produção na sequência válida e faça a tokenização das garrafas.
7. Execute a expedição e a confirmação de custódia entre duas contas com papéis distintos.
8. Leia o QR Code de uma garrafa em um navegador sem carteira conectada e confirme que a consulta pública retorna o histórico esperado.

Tentativas de executar operações fora da sequência válida ou a partir de uma conta sem o papel exigido devem ser rejeitadas pelo contrato. Essas rejeições são o comportamento correto e evidenciam que as regras estão sendo aplicadas na cadeia.

## Implantação na Sepolia

> [Preencher após a implantação com os endereços dos contratos e os links correspondentes no Etherscan.]

| Contrato | Endereço |
|---|---|
| `ContratoLote` | |
| `ContratoTokenizacao` | |
| `ContratoRastreamento` | |

## Licença

MIT, conforme já declarado em `contratos/package.json`. Falta incluir o arquivo `LICENSE` na raiz do repositório.
