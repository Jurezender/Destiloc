import { ipfsParaUrl } from "../lib/ipfs";

interface Props {
  uri: string;
}

export function LinkMetadados({ uri }: Props) {
  if (!uri) return null;
  return (
    <>
      <span className="mono">{uri}</span>
      {uri.startsWith("ipfs://") && (
        <>
          {" "}
          <a
            href={ipfsParaUrl(uri)}
            target="_blank"
            rel="noopener noreferrer"
            className="link-ipfs"
          >
            Ver documento
          </a>
        </>
      )}
    </>
  );
}
