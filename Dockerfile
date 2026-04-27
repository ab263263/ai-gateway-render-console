FROM node:24-bookworm AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM rust:1.88-bookworm AS rust-builder
WORKDIR /app
COPY Cargo.toml Cargo.lock* ./
COPY src ./src
COPY config.toml ./config.toml
RUN cargo build --release

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y ca-certificates curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=rust-builder /app/target/release/ai-gateway /app/ai-gateway
COPY --from=frontend-builder /app/frontend/dist /app/static
COPY config.toml /app/config.toml
RUN mkdir -p /data /app/data
ENV HOST=0.0.0.0
ENV PORT=1994
ENV SQL_DSN=sqlite:///data/ai-gateway.db
EXPOSE 1994
CMD ["/app/ai-gateway"]
