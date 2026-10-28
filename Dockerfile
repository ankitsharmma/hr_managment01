FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json
RUN npm ci
COPY client client
COPY server server
COPY scripts scripts
RUN npm run build
ENV NODE_ENV=production
WORKDIR /app/server
EXPOSE 4000
CMD ["node", "src/index.js"]
