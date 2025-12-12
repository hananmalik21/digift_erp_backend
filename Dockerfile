# ---------- Base image ----------
FROM node:20-slim

ENV NODE_ENV=production

# ---------- System deps (wget, unzip, libaio for Oracle) ----------
RUN apt-get update \
  && apt-get install -y wget unzip libaio1 \
  && rm -rf /var/lib/apt/lists/*

# ---------- Oracle Instant Client 23.26 (download inside Docker) ----------
RUN mkdir -p /opt/oracle \
  && cd /opt/oracle \
  && wget -q https://download.oracle.com/otn_software/linux/instantclient/2326000/instantclient-basic-linux.x64-23.26.0.0.0dbru.zip \
  && unzip instantclient-basic-linux.x64-23.26.0.0.0dbru.zip \
  && rm instantclient-basic-linux.x64-23.26.0.0.0dbru.zip

# Extracted folder name is instantclient_23_6
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

# Start command (adjust if you use a script like `npm start`)
CMD ["node", "api-server.js"]
