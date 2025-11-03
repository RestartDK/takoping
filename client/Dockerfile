FROM oven/bun:1 AS build
WORKDIR /app

COPY bun.lock package.json ./
RUN bun install --ci

COPY . .

ARG VITE_API_BASE
ENV VITE_API_BASE=${VITE_API_BASE}

RUN bun run build


