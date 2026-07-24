# syntax=docker/dockerfile:1

# ---- Build stage: the React client -------------------------------------------
# Node 24 so the runtime has node:sqlite available without an experimental flag.
FROM node:24-alpine AS client
WORKDIR /app/client
# Dependencies first so they cache independently of source changes.
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# ---- Runtime dependencies ----------------------------------------------------
# A separate npm pass keeps the client's build toolchain (Vite, React) out of
# the final image. The server needs only Express, bcryptjs, cookie-session and
# nodemailer - SQLite comes from Node's built-in node:sqlite, so there is no
# native module to compile and no build toolchain in the runtime image.
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ---- Runtime stage -----------------------------------------------------------
FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=client /app/client/dist ./client/dist
COPY server ./server
COPY package.json ./

# The SQLite database and the persisted session secret live here. Created
# before dropping privileges so a named volume mounted at this path inherits
# the right owner; bind mounts must be writable by uid 1000.
RUN mkdir -p /data && chown -R node:node /data
USER node

ENV PORT=8080 \
    DATA_DIR=/data \
    CMT_SEED_DEMO=false
VOLUME ["/data"]

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:8080/api/health || exit 1

CMD ["node", "server/index.js"]
