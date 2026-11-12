import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { getMe } from '../controllers/me.controller';

export const meRouter = Router();

meRouter.get('/', requireAuth, getMe);
