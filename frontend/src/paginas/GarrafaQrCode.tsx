import { QRCodeGarrafa } from "../componentes/QRCodeGarrafa";
import { useGarrafaContexto } from "./GarrafaLayout";

export function GarrafaQrCode() {
  const { dados, chainId } = useGarrafaContexto();

  return (
    <>
      <h2>QR Code de consulta pública</h2>
      <p className="dica">Aponte a câmera do celular para consultar a procedência desta garrafa sem precisar de login.</p>
      <QRCodeGarrafa chainId={chainId} tokenId={dados.tokenId.toString()} />
    </>
  );
}
