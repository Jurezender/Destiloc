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

## Estado de validação

Os contratos seguem a arquitetura atual (`ContratoAcesso`, `ContratoInsumos`, `ContratoProducao` e `ContratoEnvasamento`) e a suíte de 134 testes passa integralmente na rede Hardhat local, distribuída nos grupos J a N. Os scripts de implantação foram executados com sucesso contra `localhost`.

O fluxo completo, do cadastro do insumo até a consulta pública da garrafa, é validado de ponta a ponta pelo grupo de testes `N. Fluxo completo da arquitetura nova` (`contratos/test/12-fluxo-completo.js`).

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
4. Importe para a MetaMask contas de teste geradas pelo nó Hardhat e conceda a elas os papéis necessários (fornecedor, produtor, envasador) na tela Participantes.
5. Conecte a carteira pela interface e confirme que o(s) papel(is) atribuído(s) à conta são reconhecidos corretamente.
6. Como fornecedor, cadastre um lote de insumo; como produtor, avalie e aprove esse insumo.
7. Como produtor, crie e configure um lote de produção, vincule o insumo aprovado, registre as etapas previstas para o tipo de bebida e conclua a produção.
8. Como envasador, registre um envasamento referente ao lote concluído e emita as garrafas.
9. Leia o QR Code de uma garrafa em um navegador sem carteira conectada e confirme que a consulta pública retorna o histórico esperado.

Tentativas de executar operações fora da sequência válida ou a partir de uma conta sem o papel exigido devem ser rejeitadas pelo contrato. Essas rejeições são o comportamento correto e evidenciam que as regras estão sendo aplicadas na cadeia.

## Implantação na Sepolia

> [Preencher após a implantação com os endereços dos contratos e os links correspondentes no Etherscan.]

| Contrato | Endereço |
|---|---|
| `ContratoAcesso` | |
| `ContratoInsumos` | |
| `ContratoProducao` | |
| `ContratoEnvasamento` | |

## Licença

MIT, conforme já declarado em `contratos/package.json`. Falta incluir o arquivo `LICENSE` na raiz do repositório.
