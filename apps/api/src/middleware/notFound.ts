import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '../types/api';

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(new ApiError(404, 'not_found', `No route for ${req.method} ${req.originalUrl}`));
}
