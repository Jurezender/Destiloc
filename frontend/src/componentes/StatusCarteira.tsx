import { useAuth } from "../contexto/AuthContexto";
import {
  eDispositivoMobile,
  urlDeepLinkMetaMask,
  useCarteira,
} from "../contexto/CarteiraContexto";
import { REDES } from "../contracts/redes";
import { encurtarEndereco } from "../lib/formatadores";

export function StatusCarteira() {
  const { usuario, logout } = useAuth();
  const { disponivel, conta, chainId, conectando, erro, conectar } = useCarteira();

  if (!disponivel) {
    if (eDispositivoMobile()) {
      return (
        <span className="status-carteira status-carteira--aviso">
          <a href={urlDeepLinkMetaMask()} rel="noreferrer">Abrir no MetaMask</a>
        </span>
      );
    }
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
      {usuario && (
        <>
          <span className="status-carteira__email">{usuario.email}</span>
          {" · "}
          <button className="status-carteira__sair" onClick={logout}>
            Sair
          </button>
          {" · "}
        </>
      )}
      <strong>{encurtarEndereco(conta)}</strong>
      {" · "}
      {rede ? rede.rotulo : chainId ? `Rede desconhecida (${chainId})` : "Sem rede"}
    </span>
  );
}
