import { Router } from 'express';
import { login, register, refresh, me, resetPassword, studentLogin } from './auth.controller.js';
import { authenticateToken } from '../../middleware/auth.middleware.js';

export const authRoutes = Router();

// Public routes
authRoutes.post('/login', login);
authRoutes.post('/student-login', studentLogin);
authRoutes.post('/register', register);
authRoutes.post('/refresh', refresh);
authRoutes.post('/reset-password', resetPassword);
authRoutes.post('/update-password', resetPassword);

// Protected routes
authRoutes.get('/me', authenticateToken, me);


