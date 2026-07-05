# ============================================================
# Kế Toán 10A — Dockerfile (chế độ sidecar)
# Multi-stage: build TypeScript → chạy dist gọn nhẹ.
# ============================================================

# ---------- Stage 1: build ----------
FROM node:20-slim AS builder
WORKDIR /app

COPY package.json ./
RUN npm install --no-audit --no-fund

COPY tsconfig.json tsconfig.check.json drizzle.config.ts ./
COPY src ./src
COPY seed ./seed
COPY migrations ./migrations

RUN npm run build

# ---------- Stage 2: runtime ----------
FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

# Copy artefacts từ builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/migrations ./migrations
COPY --from=builder /app/seed ./seed
# tsx để chạy migrate/seed (dev-tool nhưng cần cho ops)
RUN npm install tsx --no-audit --no-fund

EXPOSE 3010

# Healthcheck gọi endpoint /health
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.KETOAN10A_PORT||3010)+'/api/v1/ke-toan-10a/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server.js"]
