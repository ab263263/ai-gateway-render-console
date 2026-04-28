# syntax=docker/dockerfile:1

FROM rust:1-bookworm AS backend-builder
WORKDIR /app

RUN apt-get update && apt-get install -y pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*

COPY Cargo.toml Cargo.lock ./
COPY src ./src
COPY config.toml ./config.toml
RUN cargo build --release

FROM node:24-bookworm AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y ca-certificates curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY --from=backend-builder /app/target/release/ai-gateway /app/ai-gateway
RUN chmod +x /app/ai-gateway

COPY --from=frontend-builder /app/static /app/static
COPY config.toml /app/config.toml
COPY scripts /app/scripts
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

RUN mkdir -p /data /app/data

ENV HOST=0.0.0.0
ENV PORT=1994
ENV SQL_DSN=sqlite:///data/ai-gateway.db
EXPOSE 1994

CMD ["/app/docker-entrypoint.sh"]
