import type { NextFunction, Request, Response } from 'express'

/**
 * Public ingress layers overwrite this header before proxying to Express.
 * Service-to-service callers on the shared Docker network bypass those layers.
 */
export const PUBLIC_INGRESS_HEADER = 'X-Vedanta-Public'

export function requireInternalRequest(req: Request, res: Response, next: NextFunction): void {
  if (req.get(PUBLIC_INGRESS_HEADER) === '1') {
    res.sendStatus(404)
    return
  }

  next()
}
