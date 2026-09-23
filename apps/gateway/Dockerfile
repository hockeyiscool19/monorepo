# eisensoftware API gateway — Cloud Run image.
# Build context is the REPOSITORY ROOT so the registry can be bundled as the offline fallback:
#   docker build -f apps/gateway/Dockerfile \
#     --build-arg IMAGE_REVISION=$(git rev-parse HEAD) --build-arg IMAGE_VERSION=1.2.3 \
#     -t us-central1-docker.pkg.dev/researcher-455022/<repo>/gateway:sha-<12> .
# Stage "build" compiles TypeScript and writes the registry snapshot; stage "runtime" ships dist/ only.

FROM node:20-alpine AS build
WORKDIR /app/apps/gateway
COPY apps/gateway/package.json apps/gateway/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY registry/registry.json /app/registry/registry.json
COPY apps/gateway/tsconfig.json apps/gateway/tsconfig.build.json ./
COPY apps/gateway/scripts ./scripts
COPY apps/gateway/src ./src
RUN npm run build

FROM node:20-alpine AS runtime
ARG IMAGE_SOURCE=https://github.com/hockeyiscool19/monorepo
ARG IMAGE_REVISION=unknown
ARG IMAGE_VERSION=dev
LABEL org.opencontainers.image.title="eisensoftware-gateway" \
      org.opencontainers.image.description="Registry-driven API gateway for eisensoftware.com" \
      org.opencontainers.image.source=$IMAGE_SOURCE \
      org.opencontainers.image.revision=$IMAGE_REVISION \
      org.opencontainers.image.version=$IMAGE_VERSION
ENV NODE_ENV=production \
    PORT=8080 \
    GATEWAY_VERSION=$IMAGE_VERSION
WORKDIR /app
COPY apps/gateway/package.json apps/gateway/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/apps/gateway/dist ./dist
USER node
EXPOSE 8080
CMD ["node", "dist/main.js"]
