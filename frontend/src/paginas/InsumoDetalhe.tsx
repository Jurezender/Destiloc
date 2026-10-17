import { DocumentosAnexados } from "../componentes/DocumentosAnexados";
import { ipfsParaUrl } from "../lib/ipfs";
import { useInsumoContexto } from "./InsumoLayout";

export function InsumoDetalhe() {
  const { lote } = useInsumoContexto();

  return (
    <>
      <h2>Documentos</h2>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "0.375rem", marginBottom: "0.75rem" }}>
        <span className="mono" style={{ fontSize: "0.8125rem", color: "var(--cor-texto-secundario)" }}>
          {lote.metadataURI}
        </span>
        <button
          type="button"
          className="botao--compacto"
          onClick={() => window.open(ipfsParaUrl(lote.metadataURI), "_blank", "noopener,noreferrer")}
        >
          Ver metadados
        </button>
      </div>
      <DocumentosAnexados metadataUri={lote.metadataURI} />
    </>
  );
}
