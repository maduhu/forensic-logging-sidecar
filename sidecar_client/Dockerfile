FROM alpine:3.3
MAINTAINER chen@dwolla.com
USER root
ADD sidecar_client.sh /usr/local/src/sidecar_client/sidecar_client.sh
ADD sidecar_client.py /usr/local/src/sidecar_client/sidecar_client.py

RUN apk add --update python &&\
    chmod +x /usr/local/src/sidecar_client/sidecar_client.sh

ENTRYPOINT ["/usr/local/src/sidecar_client/sidecar_client.sh"]