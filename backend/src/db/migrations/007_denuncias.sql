CREATE TABLE IF NOT EXISTS denuncias (
  id            BIGSERIAL    PRIMARY KEY,
  chain_id      INTEGER      NOT NULL,
  lote_id       TEXT         NOT NULL,
  token_id      TEXT         NOT NULL,
  motivo        TEXT         NOT NULL,
  local_consumo TEXT,
  data_consumo  DATE,
  status        TEXT         NOT NULL DEFAULT 'pendente'
                CHECK (status IN ('pendente', 'em_analise', 'descartada', 'confirmada')),
  criado_em     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS denuncias_lote_idx
  ON denuncias (chain_id, lote_id, status);
