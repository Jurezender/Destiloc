import { Link } from "react-router-dom";
import { formatarTimestamp } from "../lib/formatadores";
import { LinkMetadados } from "../componentes/LinkMetadados";
import { useGarrafaContexto } from "./GarrafaLayout";

export function GarrafaDetalhe() {
  const { dados } = useGarrafaContexto();

  return (
    <>
      <h2>Envasamento</h2>
      <dl className="info-grade">
        <div className="info-campo">
          <dt className="info-campo__rotulo">Garrafas emitidas / declaradas</dt>
          <dd className="info-campo__valor">
            {dados.quantidadeEmitida.toString()} / {dados.quantidadeDeclarada.toString()}
          </dd>
        </div>
        <div className="info-campo">
          <dt className="info-campo__rotulo">Registrado em</dt>
          <dd className="info-campo__valor">{formatarTimestamp(dados.registradoEm)}</dd>
        </div>
        <div className="info-campo">
          <dt className="info-campo__rotulo">Situação</dt>
          <dd className="info-campo__valor">
            {dados.concluidoEm !== 0n
              ? `Concluído em ${formatarTimestamp(dados.concluidoEm)}`
              : "Em andamento"}
          </dd>
        </div>
        <div className="info-campo info-campo--largo">
          <dt className="info-campo__rotulo">Metadados do envasamento</dt>
          <dd className="info-campo__valor"><LinkMetadados uri={dados.metadataURI} /></dd>
        </div>
        <div className="info-campo info-campo--largo">
          <dt className="info-campo__rotulo">Endereço técnico ERC-721</dt>
          <dd className="info-campo__valor mono">{dados.enderecoTecnico}</dd>
        </div>
      </dl>
      <p className="dica">A garrafa não é transferível, o endereço técnico corresponde ao envasador responsável.</p>
      <Link to={`/lotes/${dados.loteProducaoId}`} className="botao--compacto">
        Ver lote #{dados.loteProducaoId.toString()}
      </Link>
    </>
  );
}
