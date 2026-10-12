import { CarteiraProvedor } from "../contexto/CarteiraContexto";
import { PapeisProvedor } from "../contexto/PapeisContexto";
import { Layout } from "./Layout";

/**
 * Envolve as rotas operacionais (tudo exceto /consulta) com os contextos que
 * dependem da MetaMask. `/consulta/:chainId/:tokenId` fica fora desta árvore
 * de propósito, para nunca instanciar `CarteiraProvedor` nem tocar
 * `window.ethereum`.
 */
// Envolve as rotas operacionais com os provedores de MetaMask e papéis (fora da /consulta pública).
export function AreaOperacional() {
  return (
    <CarteiraProvedor>
      <PapeisProvedor>
        <Layout />
      </PapeisProvedor>
    </CarteiraProvedor>
  );
}
