import type { FastifyPluginAsync } from "fastify";
import { registrarScan, listarScans } from "../servicos/scans.js";
import { GarrafaNaoEncontradaError } from "../servicos/consulta.js";

interface BodyPostScan {
  chainId: number;
  tokenId: string;
  latitude: number;
  longitude: number;
  precisao?: number;
}

interface ParamsScans {
  chainId: string;
  tokenId: string;
}

const scans: FastifyPluginAsync = async (app) => {
  app.post<{ Body: BodyPostScan }>("/scans", async (req, reply) => {
    const corpo = req.body ?? ({} as Partial<BodyPostScan>);
    const { chainId, tokenId, latitude, longitude, precisao } = corpo;

    if (
      !Number.isInteger(chainId) ||
      (chainId as number) <= 0 ||
      !tokenId ||
      !/^\d+$/.test(String(tokenId)) ||
      typeof latitude !== "number" ||
      (latitude as number) < -90 ||
      (latitude as number) > 90 ||
      typeof longitude !== "number" ||
      (longitude as number) < -180 ||
      (longitude as number) > 180
    ) {
      return reply.status(400).send({ erro: "Parâmetros inválidos." });
    }

    const ip =
      (req.headers["x-forwarded-for"] as string | undefined)
        ?.split(",")[0]
        .trim() ?? req.ip;
    const userAgent = req.headers["user-agent"] ?? "";

    try {
      await registrarScan({
        chainId: chainId as number,
        tokenId: String(tokenId),
        latitude: latitude as number,
        longitude: longitude as number,
        precisao,
        ip: ip ?? null,
        userAgent,
      });
      return reply.status(201).send({ registrado: true });
    } catch (erro) {
      if (erro instanceof GarrafaNaoEncontradaError) {
        return reply.status(422).send({ erro: (erro as Error).message });
      }
      req.log.error(erro, "Erro ao registrar scan");
      return reply
        .status(503)
        .send({ erro: "Não foi possível registrar a consulta. Tente novamente." });
    }
  });

  app.get<{ Params: ParamsScans }>(
    "/garrafa/:chainId/:tokenId/scans",
    async (req, reply) => {
      const chainId = Number(req.params.chainId);
      const { tokenId } = req.params;

      if (!Number.isInteger(chainId) || chainId <= 0)
        return reply.status(400).send({ erro: "chainId inválido." });
      if (!tokenId || !/^\d+$/.test(tokenId))
        return reply
          .status(400)
          .send({ erro: "tokenId deve ser um inteiro positivo." });

      try {
        const historico = await listarScans(chainId, tokenId);
        return reply.send(historico);
      } catch (erro) {
        req.log.error(erro, "Erro ao listar scans");
        return reply
          .status(503)
          .send({ erro: "Não foi possível buscar o histórico." });
      }
    }
  );
};

export default scans;
