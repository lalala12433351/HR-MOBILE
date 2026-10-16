import { Request, Response, NextFunction } from 'express';
import { markTeamChannelsDirty } from './chat.service.js';

/** Resyncs team channel membership after successful writes to teams, departments or employees. */
export function resyncTeamChannelsOnWrite(req: Request, res: Response, next: NextFunction): void {
  if (req.method !== 'GET') {
    res.on('finish', () => {
      if (res.statusCode < 400) markTeamChannelsDirty(req.dbSchema);
    });
  }
  next();
}
