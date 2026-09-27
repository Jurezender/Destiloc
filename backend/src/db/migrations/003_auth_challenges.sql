CREATE TABLE IF NOT EXISTS auth_challenges (
  id           BIGSERIAL    PRIMARY KEY,
  usuario_id   BIGINT       NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  address      TEXT         NOT NULL,
  nonce        TEXT         NOT NULL UNIQUE,
  mensagem     TEXT         NOT NULL,
  expira_em    TIMESTAMPTZ  NOT NULL,
  usado_em     TIMESTAMPTZ,
  criado_em    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS auth_challenges_nonce_idx
  ON auth_challenges (nonce) WHERE usado_em IS NULL;
