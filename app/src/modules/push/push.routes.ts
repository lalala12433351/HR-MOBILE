import { Router } from 'express';
import { authenticateToken } from '../../middleware/auth.middleware.js';
import { requireTenantContext } from '../../middleware/tenant.middleware.js';
import { validateRequest } from '../../middleware/validateRequest.js';
import { getVapidPublicKey, putSubscription, removeSubscription } from './push.controller.js';
import { pushSubscriptionSchema, pushUnsubscribeSchema } from './push.schema.js';

export const pushRoutes = Router();

pushRoutes.use(authenticateToken);
pushRoutes.use(requireTenantContext);

pushRoutes.get('/vapid-public-key', getVapidPublicKey);
pushRoutes.put('/subscription', validateRequest({ body: pushSubscriptionSchema }), putSubscription);
pushRoutes.delete('/subscription', validateRequest({ body: pushUnsubscribeSchema }), removeSubscription);
