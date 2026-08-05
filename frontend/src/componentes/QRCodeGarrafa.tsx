import { QRCodeSVG } from "qrcode.react";

interface Props {
  chainId: number;
  tokenId: string;
}

/** QR code apontando para a página pública de consulta desta garrafa. */
export function QRCodeGarrafa({ chainId, tokenId }: Props) {
  const url = `${window.location.origin}/consulta/${chainId}/${tokenId}`;

  return (
    <div className="qr-garrafa">
      <QRCodeSVG value={url} size={180} />
      <p className="qr-garrafa__url">{url}</p>
    </div>
  );
}
