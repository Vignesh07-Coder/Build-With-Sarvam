/**
 * Verified identity attached by auth.middleware.ts. Never set from a
 * client-supplied value — only from a Supabase-verified access token
 * (docs/ARCHITECTURE.md §6.1, ADR-002).
 */
export interface AuthContext {
  userId: string;
  isAnonymous: boolean;
  accessToken: string;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

export {};
