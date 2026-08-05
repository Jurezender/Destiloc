import { useCarteira } from "../contexto/CarteiraContexto";
import { REDES } from "../contracts/redes";
import { encurtarEndereco } from "../lib/formatadores";

export function StatusCarteira() {
  const { disponivel, conta, chainId, conectando, erro, conectar } = useCarteira();

  if (!disponivel) {
    return <span className="status-carteira status-carteira--aviso">MetaMask não detectada</span>;
  }

  if (!conta) {
    return (
      <span className="status-carteira">
        <button onClick={() => void conectar()} disabled={conectando}>
          {conectando ? "Conectando…" : "Conectar MetaMask"}
        </button>
        {erro && <span className="erro"> {erro}</span>}
      </span>
    );
  }

  const rede = chainId ? REDES[chainId] : undefined;

  return (
    <span className="status-carteira">
      <strong>{encurtarEndereco(conta)}</strong>
      {" · "}
      {rede ? rede.rotulo : chainId ? `Rede desconhecida (${chainId})` : "Sem rede"}
    </span>
  );
}
