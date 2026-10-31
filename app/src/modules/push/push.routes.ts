import { Router } from 'express';
import { authenticateToken } from '../../middleware/auth.middleware.js';
import { requireTenantContext } from '../../middleware/tenant.middleware.js';
import { validateRequest } from '../../middleware/validateRequest.js';
import { getVapidPublicKey, putDevice, putSubscription, removeDevice, removeSubscription } from './push.controller.js';
import {
  pushDeviceDeleteSchema,
  pushDeviceSchema,
  pushSubscriptionSchema,
  pushUnsubscribeSchema,
} from './push.schema.js';

export const pushRoutes = Router();

pushRoutes.use(authenticateToken);
pushRoutes.use(requireTenantContext);

pushRoutes.get('/vapid-public-key', getVapidPublicKey);
pushRoutes.put('/subscription', validateRequest({ body: pushSubscriptionSchema }), putSubscription);
pushRoutes.delete('/subscription', validateRequest({ body: pushUnsubscribeSchema }), removeSubscription);
pushRoutes.put('/device', validateRequest({ body: pushDeviceSchema }), putDevice);
pushRoutes.delete('/device', validateRequest({ body: pushDeviceDeleteSchema }), removeDevice);
