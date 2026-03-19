FROM node:20-alpine AS base
RUN corepack enable pnpm

WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches/
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM base AS production
RUN apk add --no-cache su-exec
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/package.json ./
COPY --from=build /app/drizzle.config.ts ./

RUN addgroup --system app && adduser --system --ingroup app app
RUN mkdir -p /data/uploads && chown -R app:app /data/uploads

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENV NODE_ENV=production
ENV PORT=3000
ENV STORAGE_PATH=/data/uploads

EXPOSE 3000

ENTRYPOINT ["/entrypoint.sh"]
