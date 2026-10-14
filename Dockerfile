FROM node:22-alpine
WORKDIR /app
COPY server.js start.sh ./
RUN mkdir -p /app/site
COPY site/football.html site/football.css site/football.js site/football-data.js site/football-world.js site/football-clubs.js site/football-values.js site/football-positions.js site/football-lineup.js ./site/
COPY scripts/build-market-values.mjs scripts/build-positions.mjs scripts/market-refresh.mjs ./scripts/
RUN chmod +x /app/start.sh && node --check /app/server.js && node --check /app/site/football.js && node --check /app/site/football-data.js && node --check /app/site/football-world.js && node --check /app/site/football-clubs.js && node --check /app/scripts/build-market-values.mjs && node --check /app/scripts/build-positions.mjs && node --check /app/scripts/market-refresh.mjs && node /app/scripts/build-market-values.mjs && node /app/scripts/build-positions.mjs && node --check /app/site/football-values.js && node --check /app/site/football-positions.js && node --check /app/site/football-lineup.js
ENV NODE_ENV=production
EXPOSE 8080
CMD ["/app/start.sh"]
