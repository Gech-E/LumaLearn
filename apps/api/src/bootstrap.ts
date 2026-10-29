import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { json, urlencoded } from 'express';
import { rateLimit } from 'express-rate-limit';
import { randomUUID } from 'node:crypto';
import { ApiErrorFilter } from './http/api-error.filter';
import { configureProxyTrust } from './http/trusted-proxy';

export function configureApp(app: INestApplication) {
  configureProxyTrust(
    app.getHttpAdapter().getInstance(),
    Number(process.env.TRUST_PROXY_HOPS ?? 0),
  );
  app.setGlobalPrefix('api/v1');
  app.enableShutdownHooks();
  app.use(
    (
      req: import('express').Request,
      res: import('express').Response,
      next: import('express').NextFunction,
    ) => {
      res.setHeader('X-Request-Id', randomUUID());
      res.setHeader('Cache-Control', 'no-store');
      next();
    },
  );
  app.use(
    helmet({ contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false }),
  );
  app.use(cookieParser());
  app.use(json({ limit: '1mb' }));
  app.use(urlencoded({ extended: false, limit: '1mb' }));
  app.enableCors({
    origin: process.env.WEB_ORIGIN || 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
  });
  app.use(
    '/api/v1/auth',
    rateLimit({
      windowMs: Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS ?? 15 * 60 * 1000),
      limit: Number(process.env.AUTH_RATE_LIMIT_MAX ?? 100),
      skip: (request) => ['GET', 'HEAD', 'OPTIONS'].includes(request.method),
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: {
        code: 'RATE_LIMITED',
        message: 'Too many account requests. Please wait before trying again.',
      },
    }),
  );
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      validationError: { target: false, value: false },
    }),
  );
  app.useGlobalFilters(new ApiErrorFilter());
  const config = new DocumentBuilder()
    .setTitle('Pathway LMS')
    .setDescription(
      'Versioned Pathway API. Cookie authentication and X-CSRF-Token protect authenticated mutations.',
    )
    .setVersion('1.0')
    .addCookieAuth('pathway_session')
    .addApiKey({ type: 'apiKey', in: 'header', name: 'X-CSRF-Token' }, 'csrf')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/v1/docs', app, document, { jsonDocumentUrl: 'api/v1/openapi.json' });
}
