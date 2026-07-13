import { loadConfig } from '../lib/config.js';
import { prisma } from '../lib/prisma.js';
import { createCatalogProvider } from '../integrations/catalog/index.js';
import { createImageStore } from '../integrations/storage/r2.js';
import { runCatalogSync } from './catalog-sync.js';
import { runImageBackfill } from './image-backfill.js';

/**
 * Runner CLI de jobs sob demanda: `pnpm --filter api jobs:run <job> [flags]`.
 * Ex.: `jobs:run catalog-sync --limit=1`  ·  `jobs:run catalog-sync --set=swsh3`
 * Distinto do agendador pg_boss (index.ts), que roda no processo da API.
 */

function parseFlags(argv: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (const arg of argv) {
    const m = /^--([^=]+)=(.*)$/.exec(arg);
    if (m && m[1]) flags[m[1]] = m[2] ?? '';
  }
  return flags;
}

async function main(): Promise<void> {
  const [job, ...rest] = process.argv.slice(2);
  const flags = parseFlags(rest);
  const config = loadConfig();
  const logger = { info: (m: string) => console.log(m), warn: (m: string) => console.warn(m) };

  switch (job) {
    case 'catalog-sync': {
      const provider = createCatalogProvider(config);
      const result = await runCatalogSync(
        { provider, prisma, logger },
        {
          onlySets: flags.set ? [flags.set] : undefined,
          setLimit: flags.limit ? Number(flags.limit) : undefined,
        },
      );
      console.log(JSON.stringify(result));
      break;
    }
    case 'image-backfill': {
      const store = createImageStore(config);
      const result = await runImageBackfill(
        { prisma, store, logger },
        { limit: flags.limit ? Number(flags.limit) : undefined },
      );
      console.log(JSON.stringify(result));
      break;
    }
    default:
      console.error(
        `Job desconhecido: ${job ?? '(vazio)'}. Disponíveis: catalog-sync, image-backfill`,
      );
      process.exitCode = 1;
  }
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
