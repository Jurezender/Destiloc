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

-- Registro de consultas públicas: rastreabilidade pós-consumo.
-- Coordenadas truncadas a 2 casas (≈1.1 km) — minimização de dados (LGPD).
CREATE TABLE IF NOT EXISTS scan_garrafa (
  id               BIGSERIAL    PRIMARY KEY,
  chain_id         INTEGER      NOT NULL,
  token_id         TEXT         NOT NULL,
  latitude         NUMERIC(7,2) NOT NULL,
  longitude        NUMERIC(7,2) NOT NULL,
  precisao_m       INTEGER,
  cidade           TEXT,
  estado           TEXT,
  pais             TEXT,
  tipo_dispositivo TEXT         CHECK (tipo_dispositivo IN ('mobile', 'tablet', 'desktop')),
  ip_prefixo       TEXT,
  escaneado_em     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  suspeito         BOOLEAN      NOT NULL DEFAULT false,
  motivo_suspeita  TEXT
);

CREATE INDEX IF NOT EXISTS scan_garrafa_garrafa_idx
  ON scan_garrafa (chain_id, token_id, escaneado_em DESC);

-- Cache de uploads ao Pinata — evita pinagens duplicadas para o mesmo conteúdo
CREATE TABLE IF NOT EXISTS ipfs_cache (
  hash_conteudo TEXT        PRIMARY KEY,
  cid           TEXT        NOT NULL,
  tipo          TEXT        NOT NULL,
  tamanho_bytes INTEGER,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
);
