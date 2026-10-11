FROM node:22-alpine
WORKDIR /app
COPY server.js start.sh ./
RUN chmod +x /app/start.sh
ENV NODE_ENV=production
EXPOSE 8080
CMD ["/app/start.sh"]
