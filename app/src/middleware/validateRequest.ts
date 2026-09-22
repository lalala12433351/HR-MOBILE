import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

export interface ValidationTargets {
  body?: ZodSchema<any>;
  query?: ZodSchema<any>;
  params?: ZodSchema<any>;
}

export function validateRequest(schema: ValidationTargets) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      if (schema.body) {
        req.body = schema.body.parse(req.body);
      }
      if (schema.query) {
        req.query = schema.query.parse(req.query);
      }
      if (schema.params) {
        req.params = schema.params.parse(req.params);
      }
      next();
    } catch (err: any) {
      if (err instanceof ZodError) {
        const fieldErrors: Record<string, string[]> = {};
        for (const issue of err.issues) {
          const pathKey = issue.path.join('.') || 'payload';
          if (!fieldErrors[pathKey]) {
            fieldErrors[pathKey] = [];
          }
          fieldErrors[pathKey].push(issue.message);
        }

        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Validation failed for request payload',
            details: {
              fieldErrors,
              issues: err.issues.map((i) => ({
                field: i.path.join('.'),
                message: i.message,
              })),
            },
          },
        });
        return;
      }
      next(err);
    }
  };
}
