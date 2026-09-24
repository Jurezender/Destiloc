-- Apelidos e anotações para endereços de carteira conhecidos
CREATE TABLE IF NOT EXISTS carteiras_conhecidas (
  address         TEXT        PRIMARY KEY,
  apelido         TEXT        NOT NULL,
  papel_principal TEXT        CHECK (papel_principal IN ('admin','fornecedor','produtor','envasador')),
  anotacoes       TEXT,
  cadastrada_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizada_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Cache permanente de garrafas consultadas na blockchain.
-- Dados de garrafas são imutáveis (emitidas de lotes concluídos), portanto sem TTL.
CREATE TABLE IF NOT EXISTS garrafa_cache (
  chain_id   INTEGER     NOT NULL,
  token_id   TEXT        NOT NULL,
  dados      JSONB       NOT NULL,
  cached_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (chain_id, token_id)
);

-- Cache de uploads ao Pinata — evita pinagens duplicadas para o mesmo conteúdo
CREATE TABLE IF NOT EXISTS ipfs_cache (
  hash_conteudo TEXT        PRIMARY KEY,
  cid           TEXT        NOT NULL,
  tipo          TEXT        NOT NULL,
  tamanho_bytes INTEGER,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
);
