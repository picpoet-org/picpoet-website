# syntax=docker/dockerfile:1.7
# 工作目录：仓库根目录。
#   docker buildx build -t picpoet-website:local .
# 运行镜像同时托管 public/ 与同源 /web-api BFF（scripts/web-server.mjs）。

FROM node:22-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run public:sync

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    WEB_HOST=0.0.0.0 \
    WEB_PORT=18090
COPY --from=build /src/package.json ./
COPY --from=build /src/scripts/web-server.mjs /src/scripts/web-session.mjs scripts/
COPY --from=build /src/public public
USER node
EXPOSE 18090
CMD ["node", "scripts/web-server.mjs"]
