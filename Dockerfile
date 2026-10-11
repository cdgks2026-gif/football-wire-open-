FROM node:22-alpine
# Wanxiang Chess learning lab; only site/ assets are included in the image.
WORKDIR /app
COPY server.js start.sh ./
COPY site ./site
RUN chmod +x /app/start.sh && node --check /app/server.js && node --check /app/site/app.js && node /app/site/check.mjs
ENV NODE_ENV=production
EXPOSE 8080
CMD ["/app/start.sh"]
