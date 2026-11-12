import pinoHttp from 'pino-http';
import { logger } from '../utils/logger';

export const requestLogger = pinoHttp({
  logger,
  autoLogging: true,
  redact: ['req.headers.authorization', 'req.headers.cookie'],
});
