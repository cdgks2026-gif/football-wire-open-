FROM node:22-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-pip ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json ./
RUN npm install --omit=dev
COPY extractor/requirements.txt /tmp/extractor-requirements.txt
RUN pip3 install --break-system-packages --no-cache-dir -r /tmp/extractor-requirements.txt
COPY . .
RUN chmod +x /app/start.sh
EXPOSE 8088
CMD ["/app/start.sh"]
