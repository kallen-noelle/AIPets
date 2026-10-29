FROM node:24-alpine

WORKDIR /app

RUN addgroup -S aipets && adduser -S aipets -G aipets

RUN corepack enable

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.json ./
COPY patches/ ./patches/
COPY server/apps/auth server/apps/auth
COPY server/packages/auth-shared server/packages/auth-shared
COPY server/packages/http-error-shared server/packages/http-error-shared

RUN pnpm install --frozen-lockfile --ignore-scripts --filter @proj-aipets/auth-server...

RUN pnpm -F @proj-aipets/auth-server run build

EXPOSE 3000

USER aipets

CMD ["pnpm", "-F", "@proj-aipets/auth-server", "start"]
