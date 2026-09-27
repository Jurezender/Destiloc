CREATE TABLE IF NOT EXISTS carteiras_vinculadas (
  id           BIGSERIAL    PRIMARY KEY,
  usuario_id   BIGINT       NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  address      TEXT         NOT NULL UNIQUE,
  status       TEXT         NOT NULL DEFAULT 'pendente'
               CHECK (status IN ('pendente','autorizada','revogada')),
  vinculada_em TIMESTAMPTZ  NOT NULL DEFAULT now(),
  revisada_em  TIMESTAMPTZ,
  revisada_por TEXT
);
