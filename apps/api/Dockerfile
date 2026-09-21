FROM node:22-slim AS build
WORKDIR /repo
ENV DO_NOT_TRACK=1
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/package.json apps/api/package.json
RUN pnpm install --frozen-lockfile --filter @opex/api... || pnpm install --filter @opex/api...
COPY packages/shared packages/shared
COPY apps/api apps/api
COPY tsconfig.base.json tsconfig.base.json
RUN pnpm --filter @opex/shared run build
RUN pnpm --filter @opex/api run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production DO_NOT_TRACK=1 HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1
RUN corepack enable
COPY --from=build /repo/package.json /repo/pnpm-workspace.yaml* ./
COPY --from=build /repo/packages/shared/package.json packages/shared/package.json
COPY --from=build /repo/packages/shared/dist packages/shared/dist
COPY --from=build /repo/apps/api/package.json apps/api/package.json
COPY --from=build /repo/apps/api/dist apps/api/dist
COPY --from=build /repo/apps/api/src/prompts apps/api/dist/prompts
COPY --from=build /repo/apps/api/src/db/migrations apps/api/dist/db/migrations
COPY infra infra
RUN pnpm install --prod --filter @opex/api...
WORKDIR /app/apps/api
EXPOSE 3000
CMD ["node", "dist/index.js"]
