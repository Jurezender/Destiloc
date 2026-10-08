import { BottleWine, ClipboardList, FlaskConical, Home, Leaf, Users } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../contexto/AuthContexto";
import { useCarteira } from "../contexto/CarteiraContexto";
import { usePapeis } from "../contexto/PapeisContexto";
import { encurtarEndereco } from "../lib/formatadores";

const TODOS_LINKS = [
  { para: "/",                rotulo: "Início",        Icone: Home,         apenasAdmin: false },
  { para: "/participantes",   rotulo: "Participantes", Icone: Users,        apenasAdmin: true  },
  { para: "/insumos",         rotulo: "Insumos",       Icone: Leaf,         apenasAdmin: false },
  { para: "/lotes",           rotulo: "Lotes",         Icone: FlaskConical, apenasAdmin: false },
  { para: "/garrafas",        rotulo: "Garrafas",      Icone: BottleWine,   apenasAdmin: false },
  { para: "/admin/carteiras", rotulo: "Solicitações",  Icone: ClipboardList, apenasAdmin: true  },
];

function PopupCarteiraTrocada() {
  const { carteira, logout } = useAuth();
  const { conta } = useCarteira();

  const visivel =
    !!carteira &&
    !!conta &&
    conta.toLowerCase() !== carteira.address.toLowerCase();

  if (!visivel) return null;

  return (
    <div className="popup-overlay" role="alertdialog" aria-modal="true">
      <div className="popup-carteira-trocada">
        <h2>Carteira diferente detectada</h2>
        <p>
          A conta MetaMask foi trocada para{" "}
          <strong className="mono">{encurtarEndereco(conta)}</strong>, que é
          diferente da carteira autorizada desta sessão (
          <strong className="mono">{encurtarEndereco(carteira.address)}</strong>).
        </p>
        <p>Clique em <em>Sair</em> para encerrar a sessão com segurança.</p>
        <div className="popup-carteira-trocada__acoes">
          <button onClick={logout}>Sair</button>
        </div>
      </div>
    </div>
  );
}

export function Layout() {
  const { admin } = usePapeis();
  const { usuario, logout } = useAuth();
  const links = TODOS_LINKS.filter((l) => !l.apenasAdmin || admin);

  const nomeExibido =
    usuario?.nome_responsavel || usuario?.nome_empresa || usuario?.email || "";

  return (
    <div className="layout">
      <PopupCarteiraTrocada />
      <aside className="layout__barra">
        <div className="layout__topo">
          <span className="layout__titulo">Destiloc</span>
          <span className="layout__usuario-nome">{nomeExibido}</span>
        </div>
        <nav className="layout__nav">
          {links.map(({ para, rotulo, Icone }) => (
            <NavLink key={para} to={para} end={para === "/"}>
              <Icone size={15} strokeWidth={1.75} aria-hidden="true" />
              {rotulo}
            </NavLink>
          ))}
        </nav>
        <button className="layout__sair" onClick={logout}>Sair</button>
      </aside>
      <main className="layout__conteudo">
        <Outlet />
      </main>
    </div>
  );
}
