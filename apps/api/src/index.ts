import { buildApp } from './app.js';
import { loadConfig } from './lib/config.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const app = await buildApp(config);

  try {
    await app.listen({ port: config.PORT, host: config.HOST });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
