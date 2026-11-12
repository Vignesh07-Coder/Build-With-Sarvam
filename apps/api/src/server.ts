import { createApp } from './app';
import { env } from './config/env';
import { logger } from './utils/logger';

const app = createApp();

app.listen(env.PORT, () => {
  logger.info(`tattva-api listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
});
