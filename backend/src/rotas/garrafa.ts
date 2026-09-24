import type { FastifyPluginAsync } from "fastify";
import {
  consultarGarrafa,
  GarrafaNaoEncontradaError,
} from "../servicos/consulta.js";

interface ParamsGarrafa {
  chainId: string;
  tokenId: string;
}

const garrafa: FastifyPluginAsync = async (app) => {
  app.get<{ Params: ParamsGarrafa }>(
    "/garrafa/:chainId/:tokenId",
    async (req, reply) => {
      const chainId = Number(req.params.chainId);
      const { tokenId } = req.params;

      if (!Number.isInteger(chainId) || chainId <= 0) {
        return reply.status(400).send({ erro: "chainId inválido." });
      }
      if (!tokenId || !/^\d+$/.test(tokenId)) {
        return reply.status(400).send({
          erro: "tokenId deve ser um inteiro positivo.",
        });
      }

      try {
        const dados = await consultarGarrafa(chainId, tokenId);
        return reply.send(dados);
      } catch (erro) {
        if (erro instanceof GarrafaNaoEncontradaError) {
          return reply.status(404).send({ erro: (erro as Error).message });
        }
        req.log.error(erro, "Erro ao consultar garrafa na blockchain");
        return reply.status(503).send({
          erro: "Não foi possível consultar a blockchain. Tente novamente em instantes.",
        });
      }
    }
  );
};

export default garrafa;
