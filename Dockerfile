FROM node:22-alpine
WORKDIR /app
COPY server.js start.sh ./
RUN mkdir -p /app/site
COPY site/football.html site/football.css site/football.js site/football-data.js site/football-world.js site/football-clubs.js site/football-values.js ./site/
COPY scripts/build-market-values.mjs ./scripts/build-market-values.mjs
RUN chmod +x /app/start.sh && node --check /app/server.js && node --check /app/site/football.js && node --check /app/site/football-data.js && node --check /app/site/football-world.js && node --check /app/site/football-clubs.js && node --check /app/scripts/build-market-values.mjs && node /app/scripts/build-market-values.mjs && node --check /app/site/football-values.js
ENV NODE_ENV=production
EXPOSE 8080
CMD ["/app/start.sh"]
