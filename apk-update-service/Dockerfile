ARG BUILD_FROM
FROM ${BUILD_FROM}

ENV LANG=C.UTF-8 \
    NODE_ENV=production \
    OPTIONS_FILE=/data/options.json \
    APK_DIR=/data/apks \
    STATE_FILE=/data/state.json

RUN apk add --no-cache nodejs npm ca-certificates && update-ca-certificates

WORKDIR /opt/app

COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

COPY src/ ./src/
COPY ui/ ./ui/

COPY run.sh /run.sh
RUN chmod a+x /run.sh

CMD ["/run.sh"]
