CREATE TABLE IF NOT EXISTS usuarios (
  id           BIGSERIAL    PRIMARY KEY,
  email        TEXT         NOT NULL UNIQUE,
  senha_hash   TEXT         NOT NULL,
  criado_em    TIMESTAMPTZ  NOT NULL DEFAULT now()
);
