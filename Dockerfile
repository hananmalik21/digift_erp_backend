# ---------- Base image ----------
FROM node:20-slim

ENV NODE_ENV=production

# System dependencies
RUN apt-get update \
  && apt-get install -y wget unzip libaio1 \
  && rm -rf /var/lib/apt/lists/*

# ---------- Oracle Instant Client (download from Dropbox) ----------
RUN mkdir -p /opt/oracle \
  && cd /opt/oracle \
  && wget -O instantclient.zip "https://www.dropbox.com/scl/fi/1g8ceina1v10vedn05z3f/instantclient-basic-linux.x64-23.26.0.0.0.zip?rlkey=0ldp74bn3krfpqgzepsg8m4u1&st=j5vf6ins&dl=1" \
  && unzip instantclient.zip \
  && rm instantclient.zip

# The extracted folder is instantclient_23_6
ENV LD_LIBRARY_PATH=/opt/oracle/instantclient_23_6
ENV ORACLE_CLIENT_LIB_DIR=/opt/oracle/instantclient_23_6

# ---------- App setup ----------
WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

EXPOSE 3000

CMD ["node", "api-server.js"]
