FROM oven/bun:1 AS base
WORKDIR /app

# Install deps
COPY bun.lock package.json ./
RUN bun install --ci

# Copy source
COPY . .

EXPOSE 3000
CMD ["bun", "run", "index.ts"]


