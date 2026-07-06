FROM node:22-slim AS deps
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json turbo.json ./
COPY packages ./packages
COPY services ./services
COPY modules ./modules
RUN pnpm install --frozen-lockfile --prod=false || pnpm install --prod=false

FROM node:22-slim AS run
# poppler-utils: pdftoppm render PDF → ảnh cho vision đọc (hóa đơn scan/PDF text)
RUN apt-get update && apt-get install -y --no-install-recommends poppler-utils && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate && npm i -g tsx@4.22.4 \
    && groupadd -r app && useradd -r -g app -m -d /home/app app
WORKDIR /app
ENV HOME=/home/app
COPY --from=deps /app ./
RUN chown -R app:app /app /home/app
USER app
EXPOSE 3001
HEALTHCHECK --interval=15s --timeout=4s --retries=5 CMD node -e "fetch('http://localhost:3001/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
WORKDIR /app/services/api
CMD ["tsx", "src/index.ts"]
