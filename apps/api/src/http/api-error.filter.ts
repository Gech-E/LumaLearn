import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
@Catch()
export class ApiErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger('RequestFailure');
  catch(error: unknown, host: ArgumentsHost) {
    const request = host.switchToHttp().getRequest<Request>();
    const response = host.switchToHttp().getResponse<Response>();
    let status = 500;
    let code = 'INTERNAL_ERROR';
    let message: string | string[] =
      'We could not complete this request. Try again or contact support.';
    let details: Record<string, unknown> = {};
    if (error instanceof HttpException) {
      status = error.getStatus();
      const body = error.getResponse();
      if (typeof body === 'string') message = body;
      else {
        const b = body as {
          message?: string | string[];
          code?: string;
          dependencies?: Record<string, boolean>;
          issues?: string[];
        };
        message = b.message || message;
        code = b.code || code;
        if (b.dependencies) details = { dependencies: b.dependencies };
        if (b.issues) details = { ...details, issues: b.issues };
      }
      if (code === 'INTERNAL_ERROR')
        code =
          (
            {
              400: 'VALIDATION_ERROR',
              401: 'AUTH_REQUIRED',
              403: 'ACCESS_DENIED',
              404: 'NOT_FOUND',
              409: 'VERSION_CONFLICT',
              413: 'PAYLOAD_TOO_LARGE',
              429: 'RATE_LIMITED',
              503: 'SERVICE_UNAVAILABLE',
            } as Record<number, string>
          )[status] || 'REQUEST_FAILED';
    } else if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      ['P2002', 'P2025', 'P2034'].includes(error.code)
    ) {
      status = error.code === 'P2025' ? 404 : 409;
      code = status === 404 ? 'NOT_FOUND' : 'VERSION_CONFLICT';
      message = 'The record changed. Refresh and try again.';
    } else {
      this.logger.error({
        requestId: response.getHeader('X-Request-Id'),
        type: error instanceof Error ? error.name : 'UnknownError',
      });
    }
    response.status(status).json({
      statusCode: status,
      code,
      message,
      ...details,
      requestId: response.getHeader('X-Request-Id'),
      path: request.path,
    });
  }
}
