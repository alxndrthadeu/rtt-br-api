FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/
COPY prisma.config.ts ./
COPY tsconfig.json ./
COPY nest-cli.json ./
COPY src ./src/

RUN npm ci && npm run build

EXPOSE 8080

# Aplica migrations pendentes (usa DIRECT_URL via prisma.config.ts) antes de subir a API.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
