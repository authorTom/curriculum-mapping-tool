# syntax=docker/dockerfile:1

# ---- Stage 1: build the React client ----
# Node 24 so the runtime has node:sqlite available without an experimental flag.
FROM node:24-slim AS client
WORKDIR /app/client
COPY client/package*.json ./
RUN npm install
COPY client/ ./
RUN npm run build

# ---- Stage 2: runtime ----
FROM node:24-slim
ENV NODE_ENV=production
# Default data directory; mount a Railway volume here for persistence.
ENV DATA_DIR=/data
WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY server/ ./server/
COPY --from=client /app/client/dist ./client/dist

EXPOSE 3001
CMD ["node", "server/index.js"]
