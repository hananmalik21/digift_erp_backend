# ---------- Oracle Instant Client ----------
RUN mkdir -p /opt/oracle && \
    cd /opt/oracle && \
    apt-get update && apt-get install -y wget unzip libaio1 && \
    wget https://download.oracle.com/otn_software/linux/instantclient/2326000/instantclient-basic-linux.x64-23.26.0.0.0dbru.zip && \
    unzip instantclient-basic-linux.x64-23.26.0.0.0dbru.zip && \
    rm instantclient-basic-linux.x64-23.26.0.0.0dbru.zip

# The extracted folder is instantclient_23_6
ENV LD_LIBRARY_PATH=/opt/oracle/instantclient_23_6
ENV ORACLE_CLIENT_LIB_DIR=/opt/oracle/instantclient_23_6
