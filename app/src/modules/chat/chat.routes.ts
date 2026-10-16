import { Router } from 'express';
import { authenticateToken } from '../../middleware/auth.middleware.js';
import { requireTenantContext } from '../../middleware/tenant.middleware.js';
import { requireRole } from '../../middleware/rbac.middleware.js';
import { validateRequest } from '../../middleware/validateRequest.js';
import {
  addParticipantsSchema,
  createConversationSchema,
  createHrTicketSchema,
  editMessageSchema,
  listConversationsQuerySchema,
  listHrTicketsQuerySchema,
  listMessagesQuerySchema,
  peopleQuerySchema,
  reactionSchema,
  sendMessageSchema,
  updateConversationSchema,
  updateHrTicketSchema,
} from './chat.schema.js';
import {
  deleteParticipant,
  deleteReaction,
  getAttachmentUrl,
  getConversationById,
  getConversations,
  getHrTickets,
  getMe,
  getMessages,
  getPeople,
  getPresence,
  patchConversation,
  patchHrTicket,
  patchMessage,
  postConversation,
  postHrTicket,
  postMessage,
  postParticipants,
  postReaction,
  postRead,
  removeMessage,
} from './chat.controller.js';

export const chatRoutes = Router();

chatRoutes.use(authenticateToken);
chatRoutes.use(requireTenantContext);

const HR_DESK_ROLES = requireRole(['hr_manager', 'super_admin', 'platform_admin']);

chatRoutes.get('/me', getMe);
chatRoutes.get('/people', validateRequest({ query: peopleQuerySchema }), getPeople);
chatRoutes.get('/presence', getPresence);

chatRoutes.get('/conversations', validateRequest({ query: listConversationsQuerySchema }), getConversations);
chatRoutes.post('/conversations', validateRequest({ body: createConversationSchema }), postConversation);
chatRoutes.get('/conversations/:id', getConversationById);
chatRoutes.patch('/conversations/:id', validateRequest({ body: updateConversationSchema }), patchConversation);
chatRoutes.post('/conversations/:id/participants', validateRequest({ body: addParticipantsSchema }), postParticipants);
chatRoutes.delete('/conversations/:id/participants/:employeeId', deleteParticipant);
chatRoutes.get('/conversations/:id/messages', validateRequest({ query: listMessagesQuerySchema }), getMessages);
chatRoutes.post('/conversations/:id/messages', validateRequest({ body: sendMessageSchema }), postMessage);
chatRoutes.post('/conversations/:id/read', postRead);

chatRoutes.patch('/messages/:id', validateRequest({ body: editMessageSchema }), patchMessage);
chatRoutes.delete('/messages/:id', removeMessage);
chatRoutes.post('/messages/:id/reactions', validateRequest({ body: reactionSchema }), postReaction);
chatRoutes.delete('/messages/:id/reactions/:emoji', deleteReaction);

chatRoutes.get('/attachments/:id/url', getAttachmentUrl);

chatRoutes.post('/hr-tickets', validateRequest({ body: createHrTicketSchema }), postHrTicket);
chatRoutes.get('/hr-tickets', HR_DESK_ROLES, validateRequest({ query: listHrTicketsQuerySchema }), getHrTickets);
chatRoutes.patch('/hr-tickets/:id', HR_DESK_ROLES, validateRequest({ body: updateHrTicketSchema }), patchHrTicket);
