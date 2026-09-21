FROM node:22-slim AS build
WORKDIR /repo
ENV DO_NOT_TRACK=1
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile --filter @opex/web... || pnpm install --filter @opex/web...
COPY packages/shared packages/shared
COPY apps/web apps/web
COPY tsconfig.base.json tsconfig.base.json
RUN pnpm --filter @opex/shared run build
RUN pnpm --filter @opex/web run build

FROM nginx:1.27-alpine
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
