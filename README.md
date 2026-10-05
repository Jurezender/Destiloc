# Destiloc - Rastreabilidade de Bebidas Destiladas

Trabalho de Conclusão de Curso · Bacharelado em Sistemas de Informação
Instituto Federal do Espírito Santo, Campus Cachoeiro de Itapemirim

Autoria: Julia Rezende Rodrigues

Orientação: Prof. Dr. João Paulo de Brito Gonçalves

---

## O que é

Destiloc é um protótipo de rastreabilidade de bebidas destiladas que utiliza blockchain, contratos inteligentes e identificação individual de garrafas. Cada garrafa emitida recebe um token ERC-721 único, vinculado à sua cadeia completa de produção — insumos, etapas, lote de produção e envasamento. O consumidor final pode escanear o QR Code da garrafa e consultar todo esse histórico sem precisar de carteira ou conta.

---

## Principais tecnologias

| Camada | Tecnologias |
|---|---|
| Contratos | Solidity · Ethereum / Sepolia · Hardhat · OpenZeppelin |
| Backend | Node.js · Fastify · TypeScript · PostgreSQL / Neon |
| Frontend | React · TypeScript · MetaMask · Leaflet |
| Armazenamento | IPFS / Pinata |

---

## Arquitetura

```
┌─────────────────────────────────────────────────────────────────┐
│  Frontend (React + MetaMask)                                    │
│  Interface web, conexão com carteira, envio de transações       │
└────────────────────────┬────────────────────────────────────────┘
                         │ HTTP / REST
┌────────────────────────▼────────────────────────────────────────┐
│  Backend (Fastify + TypeScript)                                 │
│  Autenticação JWT, upload de arquivos, cache de dados           │
└────────────┬───────────────────────────────┬────────────────────┘
             │                               │
    ┌────────▼────────┐             ┌────────▼────────┐
    │ PostgreSQL/Neon │             │  IPFS / Pinata  │
    │ Cache, scans,   │             │ Arquivos e JSON │
    │ participantes   │             │ de metadados    │
    └─────────────────┘             └─────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────────┐
│  Blockchain (Ethereum / Sepolia)                                │
│  Contratos inteligentes — fonte de verdade imutável             │
└─────────────────────────────────────────────────────────────────┘
```

**Frontend** lê e escreve diretamente na blockchain via MetaMask para operações que exigem carteira. Para uploads de metadados e arquivos, passa pelo backend.

**Backend** gerencia autenticação (JWT + assinatura de carteira), mantém um cache no PostgreSQL para evitar chamadas repetidas à blockchain e ao Pinata, e é o único ponto que conhece as credenciais do Pinata.

**Blockchain** é a fonte de verdade: todos os dados críticos (insumos, lotes, etapas, garrafas) vivem nos contratos e não podem ser alterados retroativamente.

---

## Contratos inteligentes

| Contrato | Responsabilidade |
|---|---|
| `ContratoAcesso` | Papéis e permissões: `ADMIN`, `FORNECEDOR_ROLE`, `PRODUTOR_ROLE`, `ENVASADOR_ROLE` |
| `ContratoInsumos` | Cadastro de lotes de insumos, invalidação e avaliações por produtores |
| `ContratoProducao` | Criação e configuração de lotes de produção, vínculo de insumos e registro de etapas |
| `ContratoEnvasamento` | Registro de envasamentos e emissão dos tokens ERC-721 (uma garrafa = um token) |

Os contratos se comunicam entre si via interfaces. Uma mesma conta pode ter mais de um papel.

---

## Documentos no IPFS

Em qualquer etapa do fluxo é possível anexar arquivos — PDF, JPEG ou PNG. O processo é simples:

1. O usuário seleciona os arquivos na interface.
2. O frontend envia cada arquivo ao backend.
3. O backend faz o upload ao Pinata/IPFS, que devolve um CID individual por arquivo.
4. Um JSON de metadados é gerado automaticamente referenciando esses CIDs.
5. Esse JSON também vai ao Pinata e o `metadataURI` resultante (`ipfs://...`) é gravado no contrato.

O JWT do Pinata fica exclusivamente no `backend/.env` e nunca é exposto no bundle do frontend.

---

## Estrutura do projeto

```
destiloc/
├── contratos/          # Contratos Solidity, testes e scripts de implantação
│   ├── contracts/      # Código-fonte dos contratos (.sol)
│   ├── test/           # Suíte de testes com Hardhat
│   └── scripts/        # Deploy e exportação de ABI para o frontend
│
├── backend/            # API Fastify (Node.js + TypeScript)
│   ├── src/
│   │   ├── rotas/      # Endpoints HTTP
│   │   ├── servicos/   # Integração com Pinata, lógica de negócio
│   │   └── db/         # Schema SQL e acesso ao PostgreSQL
│   └── test/           # Testes do backend com Vitest
│
└── frontend/           # Interface web (React + TypeScript)
    └── src/
        ├── paginas/    # Telas da aplicação
        ├── componentes/# Componentes reutilizáveis
        ├── contexto/   # Contextos React (carteira, papéis, auth)
        └── ipfs/       # Upload de arquivos e JSON ao IPFS via backend
```

---

## Como executar

### Pré-requisitos

- Node.js 20 ou superior
- MetaMask instalado no navegador
- Conta gratuita no [Pinata](https://app.pinata.cloud) para obter um JWT
- PostgreSQL local **ou** string de conexão do [Neon](https://neon.tech)

---

### 1. Contratos

```bash
cd contratos
npm ci
npm run compile
```

Para rodar os testes dos contratos:

```bash
npm test
```

Para executar localmente com um nó Hardhat:

```bash
# Terminal 1 — sobe o nó local
npm run node:local

# Terminal 2 — implanta os contratos e exporta o ABI para o frontend
npm run deploy:local
```

Copie `.env.example` para `.env` somente se for implantar na Sepolia (veja a seção [Sepolia](#sepolia)).

---

### 2. Backend

```bash
cd backend
npm ci
cp .env.example .env
```

Edite o `.env` criado e preencha pelo menos:

```env
DATABASE_URL=postgresql://usuario:senha@localhost:5432/destiloc
PINATA_JWT=seu_jwt_do_pinata
JWT_SECRET=uma-string-secreta-longa
ADMIN_WALLET=0xSuaCarteiraAdmin
```

Crie as tabelas no banco de dados:

```bash
npm run db:schema
```

Inicie o servidor em modo de desenvolvimento:

```bash
npm run dev
```

O servidor sobe na porta `3001` por padrão. Para confirmar: `GET http://localhost:3001/health` deve retornar `{"status":"ok"}`.

---

### 3. Frontend

```bash
cd frontend
npm ci
cp .env.example .env
```

O `.env` padrão já aponta para o nó local e o backend em `localhost:3001`. Ajuste se necessário.

Inicie a interface:

```bash
npm run dev
```

Acesse `http://localhost:5173` no navegador com a MetaMask instalada.

---

## Testes

### Contratos

```bash
cd contratos
npm test
```

134 testes cobrindo todos os contratos, incluindo o fluxo completo de ponta a ponta (insumo → produção → envasamento → consulta pública de garrafa).

### Backend

```bash
cd backend
npm test
```

127 testes cobrindo autenticação, upload ao IPFS (com mock do Pinata), cache no banco e rastreabilidade pós-consumo.

---

## Sepolia

Os contratos estão implantados na Sepolia Testnet. Os endereços estão em `contratos/implantacao-sepolia.json`.

Para reimplantar, copie `contratos/.env.example` para `contratos/.env` e preencha:

```env
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/SEU_PROJECT_ID
PRIVATE_KEY=0xSuaChavePrivadaDeTeste
```

```bash
cd contratos
npm run deploy:sepolia
```

> **Nunca versione o `.env` com chave privada real.** Use sempre uma carteira de teste sem fundos reais. O `.env` já está no `.gitignore`.

