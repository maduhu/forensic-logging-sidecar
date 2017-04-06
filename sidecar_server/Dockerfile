FROM alpine:3.3
MAINTAINER chen@dwolla.com
USER root
ADD sidecar_server.sh /usr/local/src/sidecar_server/sidecar_server.sh
ADD sidecar_server.py /usr/local/src/sidecar_server/sidecar_server.py

RUN apk add --update python &&\
    chmod +x /usr/local/src/sidecar_server/sidecar_server.sh

EXPOSE 5678

ENTRYPOINT ["/usr/local/src/sidecar_server/sidecar_server.sh"]