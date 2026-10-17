import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvedor } from "./contexto/AuthContexto";
import { CarteiraProvedor } from "./contexto/CarteiraContexto";
import { AreaOperacional } from "./componentes/AreaOperacional";
import { RotaAutenticada } from "./componentes/RotaAutenticada";
import { RotaProtegida } from "./componentes/RotaProtegida";
import { AdminCarteiras } from "./paginas/AdminCarteiras";
import { AdminDenuncias } from "./paginas/AdminDenuncias";
import { ConsultaPublica } from "./paginas/ConsultaPublica";
import { Emitir } from "./paginas/Emitir";
import { Garrafas } from "./paginas/Garrafas";
import { GarrafaDetalhe } from "./paginas/GarrafaDetalhe";
import { GarrafaLayout } from "./paginas/GarrafaLayout";
import { GarrafaQrCode } from "./paginas/GarrafaQrCode";
import { Inicio } from "./paginas/Inicio";
import { InsumoAvaliacao } from "./paginas/InsumoAvaliacao";
import { InsumoCorrecoes } from "./paginas/InsumoCorrecoes";
import { InsumoDetalhe } from "./paginas/InsumoDetalhe";
import { InsumoLayout } from "./paginas/InsumoLayout";
import { InsumoNovo } from "./paginas/InsumoNovo";
import { Insumos } from "./paginas/Insumos";
import { InsumosLayout } from "./paginas/InsumosLayout";
import { InsumosParaMim } from "./paginas/InsumosParaMim";
import { EsqueciSenha } from "./paginas/EsqueciSenha";
import { Login } from "./paginas/Login";
import { LoteConclusao } from "./paginas/LoteConclusao";
import { LoteDetalhe } from "./paginas/LoteDetalhe";
import { LoteEtapas } from "./paginas/LoteEtapas";
import { LoteInsumos } from "./paginas/LoteInsumos";
import { LoteLayout } from "./paginas/LoteLayout";
import { LoteNovo } from "./paginas/LoteNovo";
import { Lotes } from "./paginas/Lotes";
import { LotesLayout } from "./paginas/LotesLayout";
import { LotesParaMim } from "./paginas/LotesParaMim";
import { PapeisParticipantes } from "./paginas/PapeisParticipantes";
import { Participantes } from "./paginas/Participantes";
import { Registrar } from "./paginas/Registrar";
import { VincularCarteira } from "./paginas/VincularCarteira";

// Define todas as rotas do app: quais são públicas, quais exigem login e quais exigem MetaMask.
export function App() {
  return (
    <AuthProvedor>
      <Routes>
        {/* Pública: sem auth, sem MetaMask. */}
        <Route path="/consulta/:chainId/:tokenId" element={<ConsultaPublica />} />

        {/* Páginas de autenticação: sem layout operacional. */}
        <Route path="/login" element={<Login />} />
        <Route path="/registrar" element={<Registrar />} />
        <Route path="/esqueci-senha" element={<CarteiraProvedor><EsqueciSenha /></CarteiraProvedor>} />

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
            path="admin/denuncias"
            element={
              <RotaAutenticada>
                <AdminDenuncias />
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
                <InsumosLayout />
              </RotaProtegida>
            }
          >
            <Route index element={<Insumos />} />
            <Route path="para-mim" element={<InsumosParaMim />} />
            <Route path="novo" element={<InsumoNovo />} />
          </Route>
          <Route
            path="insumos/:id"
            element={
              <RotaProtegida>
                <InsumoLayout />
              </RotaProtegida>
            }
          >
            <Route index element={<InsumoDetalhe />} />
            <Route path="correcoes" element={<InsumoCorrecoes />} />
            <Route path="avaliacao" element={<InsumoAvaliacao />} />
          </Route>
          <Route
            path="lotes"
            element={
              <RotaProtegida>
                <LotesLayout />
              </RotaProtegida>
            }
          >
            <Route index element={<Lotes />} />
            <Route path="para-mim" element={<LotesParaMim />} />
            <Route path="novo" element={<LoteNovo />} />
          </Route>
          <Route
            path="lotes/:id"
            element={
              <RotaProtegida>
                <LoteLayout />
              </RotaProtegida>
            }
          >
            <Route index element={<LoteDetalhe />} />
            <Route path="insumos" element={<LoteInsumos />} />
            <Route path="etapas" element={<LoteEtapas />} />
            <Route path="conclusao" element={<LoteConclusao />} />
          </Route>
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
                <GarrafaLayout />
              </RotaProtegida>
            }
          >
            <Route index element={<GarrafaDetalhe />} />
            <Route path="qrcode" element={<GarrafaQrCode />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvedor>
  );
}
