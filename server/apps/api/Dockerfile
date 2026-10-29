FROM node:24-alpine

WORKDIR /app

RUN addgroup -S aipets && adduser -S aipets -G aipets

RUN corepack enable

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.json ./
COPY patches/ ./patches/
COPY server/apps/api server/apps/api
COPY server/packages/auth-shared server/packages/auth-shared
COPY server/packages/http-error-shared server/packages/http-error-shared
COPY server/packages/server-sdk-shared server/packages/server-sdk-shared

RUN --mount=type=cache,id=pnpm-store,target=/root/.pnpm-store \
    pnpm install --frozen-lockfile --ignore-scripts

RUN pnpm -F @proj-aipets/server-sdk-shared run build
RUN pnpm -F @proj-aipets/api-server run build

EXPOSE 3000

USER aipets

CMD ["pnpm", "-F", "@proj-aipets/api-server", "start"]
