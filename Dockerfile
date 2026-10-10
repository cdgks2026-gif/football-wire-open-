FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server.js start.sh ./
COPY public ./public
COPY scripts ./scripts
RUN node scripts/prepare-villages.mjs
RUN chmod +x /app/start.sh
ENV NODE_ENV=production
EXPOSE 8088
CMD ["/app/start.sh"]
