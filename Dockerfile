FROM node:22-alpine
WORKDIR /app
COPY server.js start.sh ./
RUN mkdir -p /app/site
COPY site/football.html site/football.css site/football.js site/football-data.js site/football-world.js ./site/
RUN chmod +x /app/start.sh && node --check /app/server.js && node --check /app/site/football.js && node --check /app/site/football-data.js && node --check /app/site/football-world.js
ENV NODE_ENV=production
EXPOSE 8080
CMD ["/app/start.sh"]
