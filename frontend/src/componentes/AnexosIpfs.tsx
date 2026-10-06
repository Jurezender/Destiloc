import { useEffect, useRef, useState } from "react";
import { adicionarArquivo } from "../ipfs/kubo";

interface AnexoInfo {
  id: string;
  arquivo: File;
  estado: "pendente" | "enviando" | "ok" | "erro";
  cid: string | null;
  erroMensagem: string | null;
}

interface Props {
  /** Chamado sempre que a lista de CIDs confirmados ou o estado de upload muda. */
  onChange: (cids: string[], subindo: boolean) => void;
  rotulo?: string;
  desabilitado?: boolean;
}

export function AnexosIpfs({
  onChange,
  rotulo = "Documentos (PDF, JPG, PNG — opcional)",
  desabilitado,
}: Props) {
  const [anexos, setAnexos] = useState<AnexoInfo[]>([]);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const cids = anexos.filter((a) => a.estado === "ok" && a.cid).map((a) => a.cid!);
    const subindo = anexos.some((a) => a.estado === "pendente" || a.estado === "enviando");
    onChangeRef.current(cids, subindo);
  }, [anexos]);

  async function enviarAnexo(id: string, arquivo: File) {
    setAnexos((prev) => prev.map((a) => (a.id === id ? { ...a, estado: "enviando" as const } : a)));
    try {
      const cid = await adicionarArquivo(arquivo);
      setAnexos((prev) => prev.map((a) => (a.id === id ? { ...a, estado: "ok" as const, cid } : a)));
    } catch (err) {
      const erroMensagem = err instanceof Error ? err.message : "Falha no upload.";
      setAnexos((prev) =>
        prev.map((a) => (a.id === id ? { ...a, estado: "erro" as const, erroMensagem } : a))
      );
    }
  }

  function adicionarArquivos(files: FileList | null) {
    if (!files || files.length === 0) return;
    const novos: AnexoInfo[] = Array.from(files).map((arquivo) => ({
      id: `${Date.now()}-${Math.random()}`,
      arquivo,
      estado: "pendente" as const,
      cid: null,
      erroMensagem: null,
    }));
    setAnexos((prev) => [...prev, ...novos]);
    novos.forEach((a) => void enviarAnexo(a.id, a.arquivo));
  }

  function remover(id: string) {
    setAnexos((prev) => prev.filter((a) => a.id !== id));
  }

  function tentarNovamente(id: string) {
    const anexo = anexos.find((a) => a.id === id);
    if (anexo) void enviarAnexo(id, anexo.arquivo);
  }

  return (
    <div className="anexos-ipfs">
      <span className="anexos-ipfs__rotulo">{rotulo}</span>

      {anexos.length > 0 && (
        <ul className="anexos-ipfs__lista">
          {anexos.map((anexo) => (
            <li
              key={anexo.id}
              className={`anexos-ipfs__item anexos-ipfs__item--${anexo.estado}`}
            >
              <span className="anexos-ipfs__nome">{anexo.arquivo.name}</span>

              {anexo.estado === "enviando" && (
                <span className="anexos-ipfs__estado anexos-ipfs__estado--enviando">
                  Enviando…
                </span>
              )}
              {anexo.estado === "ok" && (
                <span className="anexos-ipfs__estado anexos-ipfs__estado--ok">✓ Enviado</span>
              )}
              {anexo.estado === "ok" && anexo.cid && (
                <a
                  href={`https://ipfs.io/ipfs/${anexo.cid.slice(7)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="anexos-ipfs__link"
                >
                  Ver documento
                </a>
              )}
              {anexo.estado === "erro" && (
                <span className="anexos-ipfs__estado anexos-ipfs__estado--erro">
                  {anexo.erroMensagem}
                </span>
              )}
              {anexo.estado === "erro" && (
                <button
                  type="button"
                  className="botao--secundario anexos-ipfs__btn"
                  onClick={() => tentarNovamente(anexo.id)}
                  disabled={desabilitado}
                >
                  Tentar novamente
                </button>
              )}

              <button
                type="button"
                className="botao--secundario anexos-ipfs__btn"
                onClick={() => remover(anexo.id)}
                disabled={desabilitado || anexo.estado === "enviando"}
              >
                Remover
              </button>
            </li>
          ))}
        </ul>
      )}

      <label
        className={`anexos-ipfs__adicionar${desabilitado ? " anexos-ipfs__adicionar--desabilitado" : ""}`}
      >
        <input
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png"
          onChange={(e) => adicionarArquivos(e.target.files)}
          disabled={desabilitado}
          style={{ display: "none" }}
        />
        + Adicionar arquivos
      </label>
    </div>
  );
}
