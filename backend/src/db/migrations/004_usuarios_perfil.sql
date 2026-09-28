ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS nome_responsavel TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS nome_empresa      TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS tipo_participante TEXT
    CHECK (tipo_participante IN ('fornecedor', 'produtor', 'envasador'));
