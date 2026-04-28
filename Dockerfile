# Render Free Plan Dockerfile
# Rust backend: pre-built by GitHub Actions, stored in dist/
# Frontend: built in Docker (Node is lightweight, no OOM risk on Free Plan)

FROM node:24-bookworm AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y ca-certificates curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Copy pre-built Rust binary (built by GitHub Actions CI)
COPY dist/ai-gateway /app/ai-gateway
RUN chmod +x /app/ai-gateway

# Copy frontend
COPY --from=frontend-builder /app/frontend/dist /app/static

# Copy config
COPY config.toml /app/config.toml

RUN mkdir -p /data /app/data

ENV HOST=0.0.0.0
ENV PORT=1994
ENV SQL_DSN=sqlite:///data/ai-gateway.db
EXPOSE 1994

CMD ["/app/ai-gateway"]
