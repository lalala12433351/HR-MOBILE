import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { login, register, refresh, me, studentLogin } from './auth.controller.js';
import {
  acceptInvite,
  forgotPassword,
  getInvite,
  resetPasswordWithToken,
  sendVerificationCode,
  verifyEmailCode,
} from './emailFlows.controller.js';
import {
  changeEmailStatus,
  confirmChangeEmail,
  requestChangeEmail,
  resendChangeEmail,
} from './changeEmail.controller.js';
import { authenticateToken } from '../../middleware/auth.middleware.js';

export const authRoutes = Router();

const tooManyRequests = {
  success: false,
  error: { code: 'RATE_LIMITED', message: 'Too many requests. Please wait a few minutes and try again.' },
};

// Endpoints that send email: tight per-IP budget.
const emailSendLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: tooManyRequests,
});

// Endpoints that check a code or token: allow typos, block brute force.
const tokenCheckLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 40,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: tooManyRequests,
});

// Public routes
authRoutes.post('/login', login);
authRoutes.post('/student-login', studentLogin);
authRoutes.post('/register', register);
authRoutes.post('/refresh', refresh);

authRoutes.post('/send-verification-code', emailSendLimiter, sendVerificationCode);
authRoutes.post('/verify-email', tokenCheckLimiter, verifyEmailCode);
authRoutes.get('/invite/:token', tokenCheckLimiter, getInvite);
authRoutes.post('/accept-invite', tokenCheckLimiter, acceptInvite);
authRoutes.post('/forgot-password', emailSendLimiter, forgotPassword);
authRoutes.post('/reset-password', tokenCheckLimiter, resetPasswordWithToken);
authRoutes.get('/change-email/status', tokenCheckLimiter, changeEmailStatus);
authRoutes.post('/change-email/resend', emailSendLimiter, resendChangeEmail);
authRoutes.post('/change-email/confirm', tokenCheckLimiter, confirmChangeEmail);

// Protected routes
authRoutes.get('/me', authenticateToken, me);
authRoutes.post('/change-email', authenticateToken, emailSendLimiter, requestChangeEmail);
