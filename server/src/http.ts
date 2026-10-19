import type { NextFunction, Request, RequestHandler, Response } from 'express'
import { ZodError } from 'zod'

export function asyncHandler(handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next)
  }
}

export function httpError(status: number, message: string, code?: string) {
  return Object.assign(new Error(message), { status, code: code || 'request_failed' })
}

export function errorHandler(error: any, _req: Request, res: Response, _next: NextFunction) {
  if (res.headersSent) return
  if (error instanceof ZodError) {
    res.status(400).json({
      error: error.issues[0]?.message || 'Invalid request',
      code: 'validation_error',
      issues: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    })
    return
  }
  if (error?.code === 'LIMIT_FILE_SIZE') {
    res.status(413).json({ error: 'File exceeds the configured upload limit.', code: 'file_too_large' })
    return
  }
  const status = Number(error?.status) || 500
  if (status >= 500) console.error('[api]', error)
  res.status(status).json({ error: status >= 500 ? 'An unexpected server error occurred.' : error.message, code: error?.code || 'request_failed' })
}

export function notFound(_req: Request, res: Response) {
  res.status(404).json({ error: 'Not found', code: 'not_found' })
}
