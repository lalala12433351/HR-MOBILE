import { Router } from 'express';
import {
  getAnnouncements,
  createAnnouncement,
  markAnnouncementRead,
  toggleAnnouncementReaction,
  addAnnouncementComment,
  toggleAnnouncementPin,
  deleteAnnouncement,
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  clearAllNotifications,
  getAuditLogs,
} from './audit.controller.js';
import { createAnnouncementSchema } from './announcement.schema.js';
import { validateRequest } from '../../middleware/validateRequest.js';
import { authenticateToken } from '../../middleware/auth.middleware.js';
import { requireTenantContext } from '../../middleware/tenant.middleware.js';
import { requireRole } from '../../middleware/rbac.middleware.js';

export const auditCommsRoutes = Router();

auditCommsRoutes.use(authenticateToken);
auditCommsRoutes.use(requireTenantContext);

auditCommsRoutes.get('/announcements', getAnnouncements);
auditCommsRoutes.post(
  '/announcements',
  requireRole(['super_admin', 'hr_manager']),
  validateRequest({ body: createAnnouncementSchema }),
  createAnnouncement
);
auditCommsRoutes.put('/announcements/:id/read', markAnnouncementRead);
auditCommsRoutes.put('/announcements/:id/react', toggleAnnouncementReaction);
auditCommsRoutes.post('/announcements/:id/comments', addAnnouncementComment);
auditCommsRoutes.put(
  '/announcements/:id/pin',
  requireRole(['super_admin', 'hr_manager']),
  toggleAnnouncementPin
);
auditCommsRoutes.delete(
  '/announcements/:id',
  requireRole(['super_admin', 'hr_manager']),
  deleteAnnouncement
);

auditCommsRoutes.get('/notifications', getNotifications);
auditCommsRoutes.put('/notifications/read-all', markAllNotificationsRead);
auditCommsRoutes.delete('/notifications/clear-all', clearAllNotifications);
auditCommsRoutes.put('/notifications/:id/read', markNotificationRead);
auditCommsRoutes.delete('/notifications/:id', deleteNotification);

auditCommsRoutes.get('/audit-trail', requireRole(['super_admin', 'hr_manager']), getAuditLogs);
