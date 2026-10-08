import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvedor } from "./contexto/AuthContexto";
import { AreaOperacional } from "./componentes/AreaOperacional";
import { RotaAutenticada } from "./componentes/RotaAutenticada";
import { RotaProtegida } from "./componentes/RotaProtegida";
import { AdminCarteiras } from "./paginas/AdminCarteiras";
import { ConsultaPublica } from "./paginas/ConsultaPublica";
import { Emitir } from "./paginas/Emitir";
import { Garrafas } from "./paginas/Garrafas";
import { GarrafaDetalhe } from "./paginas/GarrafaDetalhe";
import { Inicio } from "./paginas/Inicio";
import { InsumoDetalhe } from "./paginas/InsumoDetalhe";
import { Insumos } from "./paginas/Insumos";
import { EsqueciSenha } from "./paginas/EsqueciSenha";
import { Login } from "./paginas/Login";
import { LoteDetalhe } from "./paginas/LoteDetalhe";
import { Lotes } from "./paginas/Lotes";
import { PapeisParticipantes } from "./paginas/PapeisParticipantes";
import { Participantes } from "./paginas/Participantes";
import { Registrar } from "./paginas/Registrar";
import { VincularCarteira } from "./paginas/VincularCarteira";

export function App() {
  return (
    <AuthProvedor>
      <Routes>
        {/* Pública: sem auth, sem MetaMask. */}
        <Route path="/consulta/:chainId/:tokenId" element={<ConsultaPublica />} />

        {/* Páginas de autenticação: sem layout operacional. */}
        <Route path="/login" element={<Login />} />
        <Route path="/registrar" element={<Registrar />} />
        <Route path="/esqueci-senha" element={<EsqueciSenha />} />

        {/* Operacional: layout com nav, MetaMask e papéis. */}
        <Route element={<AreaOperacional />}>
          <Route
            path="vincular-carteira"
            element={
              <RotaAutenticada>
                <VincularCarteira />
              </RotaAutenticada>
            }
          />
          <Route
            path="admin/carteiras"
            element={
              <RotaAutenticada>
                <AdminCarteiras />
              </RotaAutenticada>
            }
          />
          <Route
            index
            element={
              <RotaProtegida>
                <Inicio />
              </RotaProtegida>
            }
          />
          <Route
            path="participantes"
            element={
              <RotaProtegida
                exigirPapel={(p) => p.admin}
                mensagemPapel="Só administradores (em algum dos três contratos) podem gerenciar participantes."
              >
                <Participantes />
              </RotaProtegida>
            }
          />
          <Route
            path="participantes/papeis"
            element={
              <RotaProtegida
                exigirPapel={(p) => p.admin}
                mensagemPapel="Só administradores podem gerenciar papéis."
              >
                <PapeisParticipantes />
              </RotaProtegida>
            }
          />
          <Route
            path="insumos"
            element={
              <RotaProtegida>
                <Insumos />
              </RotaProtegida>
            }
          />
          <Route
            path="insumos/:id"
            element={
              <RotaProtegida>
                <InsumoDetalhe />
              </RotaProtegida>
            }
          />
          <Route
            path="lotes"
            element={
              <RotaProtegida>
                <Lotes />
              </RotaProtegida>
            }
          />
          <Route
            path="lotes/:id"
            element={
              <RotaProtegida>
                <LoteDetalhe />
              </RotaProtegida>
            }
          />
          <Route
            path="lotes/:id/emitir"
            element={
              <RotaProtegida>
                <Emitir />
              </RotaProtegida>
            }
          />
          <Route
            path="garrafas"
            element={
              <RotaProtegida>
                <Garrafas />
              </RotaProtegida>
            }
          />
          <Route
            path="garrafas/:tokenId"
            element={
              <RotaProtegida>
                <GarrafaDetalhe />
              </RotaProtegida>
            }
          />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvedor>
  );
}
