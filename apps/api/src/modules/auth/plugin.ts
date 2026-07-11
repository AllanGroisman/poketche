import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { AppConfig } from '../../lib/config.js';
import { forbidden, unauthorized } from '../../lib/errors.js';

/**
 * Verificação de JWT do Supabase Auth. O papel `admin` (back-office de disputas, US11)
 * vem de uma claim no token. Auth é delegada ao Supabase — aqui só validamos e extraímos.
 */
export interface AuthUser {
  id: string;
  role: 'user' | 'admin';
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
  }
}

function extractRole(payload: Record<string, unknown>): 'user' | 'admin' {
  // Supabase permite claims customizadas (ex.: app_metadata.role).
  const appMeta = payload.app_metadata as { role?: string } | undefined;
  const role = appMeta?.role ?? (payload.role as string | undefined);
  return role === 'admin' ? 'admin' : 'user';
}

export async function registerAuth(app: FastifyInstance, config: AppConfig): Promise<void> {
  if (!config.SUPABASE_JWKS_URL) {
    app.log.warn('SUPABASE_JWKS_URL ausente — autenticação desativada (apenas dev local).');
  }
  const jwks = config.SUPABASE_JWKS_URL
    ? createRemoteJWKSet(new URL(config.SUPABASE_JWKS_URL))
    : null;

  async function authenticate(req: FastifyRequest): Promise<AuthUser> {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw unauthorized('token ausente');
    }
    if (!jwks) {
      throw unauthorized('autenticação não configurada');
    }
    try {
      const { payload } = await jwtVerify(header.slice(7), jwks, {
        issuer: config.SUPABASE_JWT_ISSUER,
      });
      return { id: payload.sub as string, role: extractRole(payload) };
    } catch {
      throw unauthorized('token inválido');
    }
  }

  // preHandler: exige usuário autenticado.
  app.decorate('requireAuth', async (req: FastifyRequest, _reply: FastifyReply) => {
    req.user = await authenticate(req);
  });

  // preHandler: exige papel admin (FR-078).
  app.decorate('requireAdmin', async (req: FastifyRequest, _reply: FastifyReply) => {
    req.user = await authenticate(req);
    if (req.user.role !== 'admin') {
      throw forbidden('requer papel de administrador');
    }
  });
}

declare module 'fastify' {
  interface FastifyInstance {
    requireAuth: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireAdmin: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
