ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS cnpj TEXT;

ALTER TABLE usuarios
  DROP CONSTRAINT IF EXISTS usuarios_tipo_participante_check;

ALTER TABLE usuarios
  ADD CONSTRAINT usuarios_tipo_participante_check
    CHECK (tipo_participante IS NULL OR tipo_participante IN ('fornecedor', 'produtor', 'envasador', 'admin'));
