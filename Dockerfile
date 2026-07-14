FROM node:24-alpine
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY --chown=node:node backend ./backend
COPY --chown=node:node db ./db

ENV NODE_ENV=production
EXPOSE 3000
USER node
CMD ["node", "backend/server.mjs"]
