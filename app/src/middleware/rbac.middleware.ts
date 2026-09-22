import { Request, Response, NextFunction } from 'express';
import { UserRole } from '../types/index.js';

/**
 * Role-Based Access Control (RBAC) Guard:
 * Restricts route access to users with authorized permission tiers.
 */
export function requireRole(allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHENTICATED',
          message: 'User authentication context is missing.',
        },
      });
      return;
    }

    // Exact role match only — platform_admin is separate from tenant super_admin
    if (allowedRoles.includes(req.user.role)) {
      next();
      return;
    }

    res.status(403).json({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: `Access denied. Required roles: [${allowedRoles.join(', ')}]. Current role: "${req.user.role}".`,
      },
    });
  };
}
