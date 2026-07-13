import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

/**
 * Object storage (Cloudflare R2, S3-compatível) para o cache próprio de imagens do
 * catálogo (constituição V — não servir direto das fontes) e, futuramente, evidências
 * de disputa. Abstraído por `ObjectStore` para permitir um no-op em dev sem R2.
 */

export interface StoredObject {
  body: Uint8Array;
  contentType: string;
}

export interface ObjectStore {
  /** true quando o storage está configurado (há credenciais R2). */
  readonly enabled: boolean;
  head(key: string): Promise<boolean>;
  get(key: string): Promise<StoredObject | null>;
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
}

/** Store desabilitado — usado em dev sem credenciais R2. O proxy cai para redirect à fonte. */
export class NullObjectStore implements ObjectStore {
  readonly enabled = false;
  async head(): Promise<boolean> {
    return false;
  }
  async get(): Promise<StoredObject | null> {
    return null;
  }
  async put(): Promise<void> {
    /* no-op */
  }
}

export interface R2Config {
  R2_ACCOUNT_ID?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
}

export class R2ObjectStore implements ObjectStore {
  readonly enabled = true;
  private readonly client: S3Client;

  constructor(
    private readonly bucket: string,
    creds: Required<R2Config>,
  ) {
    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${creds.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: creds.R2_ACCESS_KEY_ID,
        secretAccessKey: creds.R2_SECRET_ACCESS_KEY,
      },
    });
  }

  async head(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }

  async get(key: string): Promise<StoredObject | null> {
    try {
      const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      if (!res.Body) return null;
      const body = await res.Body.transformToByteArray();
      return { body, contentType: res.ContentType ?? 'application/octet-stream' };
    } catch {
      return null;
    }
  }

  async put(key: string, body: Uint8Array, contentType: string): Promise<void> {
    // Cache é best-effort (constituição V): falha ao gravar não pode quebrar a requisição.
    // Ex.: bucket ausente/credencial inválida → segue servindo da fonte, apenas sem cache.
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
          CacheControl: 'public, max-age=31536000, immutable',
        }),
      );
    } catch (err) {
      if (!R2ObjectStore.warnedPut) {
        R2ObjectStore.warnedPut = true;
        console.warn(
          `[r2] falha ao gravar no cache (bucket '${this.bucket}'?): ${(err as Error).message}`,
        );
      }
    }
  }

  private static warnedPut = false;
}

/** Cria o store de imagens: R2 quando há credenciais, senão um no-op (dev). */
export function createImageStore(config: R2Config & { R2_BUCKET_IMAGES: string }): ObjectStore {
  if (config.R2_ACCOUNT_ID && config.R2_ACCESS_KEY_ID && config.R2_SECRET_ACCESS_KEY) {
    return new R2ObjectStore(config.R2_BUCKET_IMAGES, {
      R2_ACCOUNT_ID: config.R2_ACCOUNT_ID,
      R2_ACCESS_KEY_ID: config.R2_ACCESS_KEY_ID,
      R2_SECRET_ACCESS_KEY: config.R2_SECRET_ACCESS_KEY,
    });
  }
  return new NullObjectStore();
}
