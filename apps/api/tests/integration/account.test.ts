import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { loadConfig } from '../../src/lib/config.js';
import type { AuthUser } from '../../src/modules/auth/plugin.js';

/**
 * Teste de integração da US1 (T027): conta → visibilidade → link público → revogação.
 * Usa o banco de teste efêmero e um verificador de auth simulado (header x-test-user-id).
 */

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'postgresql://poketche:poketche@localhost:5435/poketche_test';

const userId = randomUUID();
const email = `treinador_${userId.slice(0, 8)}@example.com`;

let prisma: PrismaClient;
let app: FastifyInstance;

const authHeaders = { 'x-test-user-id': userId, 'x-test-email': email };

beforeAll(async () => {
  prisma = new PrismaClient({ datasourceUrl: TEST_URL });
  const config = loadConfig({ DATABASE_URL: TEST_URL, NODE_ENV: 'test' });
  app = await buildApp(config, {
    prismaClient: prisma,
    authOverride: (req): AuthUser => {
      const id = req.headers['x-test-user-id'];
      if (typeof id !== 'string') throw new Error('sem usuário de teste');
      const mail = req.headers['x-test-email'];
      return { id, role: 'user', email: typeof mail === 'string' ? mail : undefined };
    },
  });
  await app.ready();
});

afterAll(async () => {
  await app.close();
  // Limpeza (cascata remove visibilidade/seller).
  await prisma.userProfile.deleteMany({ where: { id: userId } });
  await prisma.$disconnect();
});

describe('US1 — contas, visibilidade e link público', () => {
  it('GET /me provisiona o perfil com display_name semeado do e-mail', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/me', headers: authHeaders });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBe(userId);
    expect(body.display_name).toBe(email.split('@')[0]);
    expect(body.preferred_camera).toBe('back');
  });

  it('PATCH /me atualiza perfil e preferências', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/me',
      headers: authHeaders,
      payload: { displayName: 'Ash Ketchum', preferredCamera: 'front' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ display_name: 'Ash Ketchum', preferred_camera: 'front' });
  });

  it('coleção é privada por padrão', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/me/visibility',
      headers: authHeaders,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'private', share_token: null, share_url: null });
  });

  it('PUT /me/visibility ajusta os flags granulares', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/me/visibility',
      headers: authHeaders,
      payload: { show_values: true, show_quantities: true },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ show_values: true, show_quantities: true });
  });

  let shareToken: string;

  it('gera link público compartilhável', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/me/visibility/share-link',
      headers: authHeaders,
      payload: { action: 'generate' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('public_link');
    expect(typeof body.share_token).toBe('string');
    expect(body.share_url).toContain(body.share_token);
    shareToken = body.share_token;
  });

  it('link público abre sem autenticação e respeita a visibilidade', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/public/collections/${shareToken}`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.owner.display_name).toBe('Ash Ketchum');
    expect(body.visibility).toMatchObject({ show_values: true, show_quantities: true });
    expect(body.collection).toEqual([]);
  });

  it('revoga o link e o token deixa de resolver (404 opaco, SC-012)', async () => {
    const revoke = await app.inject({
      method: 'POST',
      url: '/api/v1/me/visibility/share-link',
      headers: authHeaders,
      payload: { action: 'revoke' },
    });
    expect(revoke.statusCode).toBe(200);
    expect(revoke.json()).toMatchObject({ status: 'private', share_token: null });

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/public/collections/${shareToken}`,
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('not_found');
  });

  it('token inexistente também dá 404 opaco', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/public/collections/token-invalido',
    });
    expect(res.statusCode).toBe(404);
  });

  it('POST /me/seller inicia onboarding (KYC pending via stub)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/me/seller',
      headers: authHeaders,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.kyc_status).toBe('pending');
    expect(body.provider_recipient_id).toMatch(/^stub_rp_/);
    expect(body.onboarding_url).toBeTruthy();
  });

  it('GET /me/seller reflete o status', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/me/seller', headers: authHeaders });
    expect(res.statusCode).toBe(200);
    expect(res.json().kyc_status).toBe('pending');
  });
});
