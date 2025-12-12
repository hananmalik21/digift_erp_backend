# ---------- Base image ----------
FROM node:20-slim

ENV NODE_ENV=production

# ---------- System dependencies ----------
# wget  : to download the client
# unzip : to extract the zip
# libaio1 : required by Oracle Instant Client
RUN apt-get update \
  && apt-get install -y wget unzip libaio1 \
  && rm -rf /var/lib/apt/lists/*

# ---------- Oracle Instant Client from Dropbox ----------
# NOTE: we use a stable direct-download URL with only `?dl=1`
RUN mkdir -p /opt/oracle \
  && cd /opt/oracle \
  && wget -O instantclient.zip "https://www.dropbox.com/scl/fi/1g8ceina1v10vedn05z3f/instantclient-basic-linux.x64-23.26.0.0.0.zip?dl=1" \
  && unzip instantclient.zip \
  && rm instantclient.zip \
  && ls -R /opt/oracle

# The extracted folder name for 23.26 is usually instantclient_23_6
ENV LD_LIBRARY_PATH=/opt/oracle/instantclient_23_6
ENV ORACLE_CLIENT_LIB_DIR=/opt/oracle/instantclient_23_6

# ---------- App setup ----------
WORKDIR /app

# Install dependencies first (better caching)
COPY package*.json ./
RUN npm install --omit=dev

# Copy the rest of the app (includes TESTDB wallet folder)
COPY . .

# Port your Node app listens on
EXPOSE 3000

# Start command (adjust if you use a different entrypoint)
CMD ["node", "api-server.js"]
