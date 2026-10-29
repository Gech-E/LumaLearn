# syntax=docker/dockerfile:1
# Reviewed LTS base; refresh the digest deliberately with each security release.
ARG NODE_IMAGE=node:24-bookworm-slim@sha256:be8204d4bd327363357f532187b752ff62759c31bedf98e9e18fc08c9cbd605c
FROM ${NODE_IMAGE} AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS dependencies
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/api-client/package.json packages/api-client/package.json
RUN pnpm install --frozen-lockfile

FROM dependencies AS build
ARG API_INTERNAL_URL=http://api:4000
ENV API_INTERNAL_URL=${API_INTERNAL_URL} NEXT_TELEMETRY_DISABLED=1
COPY packages ./packages
COPY apps ./apps
RUN pnpm db:generate && pnpm build
# pnpm's generated Prisma client lives alongside its real package, outside the symlink.
RUN node -e "const fs=require('node:fs'),path=require('node:path'); const client=require.resolve('@prisma/client/package.json',{paths:['/app/apps/api']}); fs.cpSync(path.resolve(path.dirname(client),'../../.prisma'),'/generated-prisma',{recursive:true});"

FROM base AS api-dependencies
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/api-client/package.json packages/api-client/package.json
# The fresh filtered install contains production dependencies only.
RUN pnpm install --prod --frozen-lockfile --filter @pathway/api... --ignore-scripts
# Prisma Client's optional build peers can remain bound by the workspace lockfile.
# The generated client needs neither the Prisma CLI nor the TypeScript compiler.
RUN rm -rf /app/node_modules/.pnpm/prisma@* /app/node_modules/.pnpm/typescript@* /app/node_modules/.pnpm/node_modules/prisma /app/node_modules/.pnpm/node_modules/typescript
COPY --from=build /generated-prisma /generated-prisma
RUN node -e "const fs=require('node:fs'),path=require('node:path'); const client=require.resolve('@prisma/client/package.json',{paths:['/app/apps/api']}); fs.cpSync('/generated-prisma',path.resolve(path.dirname(client),'../../.prisma'),{recursive:true}); require('/app/apps/api/node_modules/argon2');" && rm -rf /generated-prisma

# Dedicated migration tooling; do not run this image as the API or worker.
FROM dependencies AS migration
COPY apps/api/prisma ./apps/api/prisma
ENV NODE_ENV=production
WORKDIR /app/apps/api
USER node
CMD ["node", "node_modules/prisma/build/index.js", "migrate", "deploy", "--schema", "prisma/schema.prisma"]

# Explicit development-only seed tooling, excluded from production runtime targets.
FROM build AS development-tools
USER node
CMD ["pnpm", "--filter", "@pathway/api", "db:seed"]

FROM base AS web
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/public ./apps/web/public
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000',{signal:AbortSignal.timeout(3000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]

FROM base AS api
ENV NODE_ENV=production PORT=4000
COPY --from=api-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=api-dependencies --chown=node:node /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build --chown=node:node /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=node:node /app/apps/api/package.json ./apps/api/package.json
WORKDIR /app/apps/api
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD node -e "fetch('http://127.0.0.1:4000/api/v1/health',{signal:AbortSignal.timeout(3000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
