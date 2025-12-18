# Builder stage - install dependencies (including dev) and compile TypeScript
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json tsconfig.json
COPY api-gateway ./api-gateway
COPY core ./core
COPY src ./src
COPY test ./test
COPY scripts ./scripts
RUN npm run build

# Install production dependencies only
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# Runtime image with only production deps and runtime code
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
COPY --from=deps /app/node_modules ./node_modules
COPY server.js ./server.js
COPY src/ ./src
COPY --from=builder /app/dist ./dist
EXPOSE 8080
CMD ["node", "server.js"]




