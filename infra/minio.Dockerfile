# Official upstream source, pinned to the archived repository's last revision.
# Build locally because the former minio/minio and minio/mc public images are unavailable.
FROM golang:1.25-bookworm AS server
ENV CGO_ENABLED=0
RUN go install github.com/minio/minio@7aac2a2c5b7c882e68c1ce017d8256be2feea27f
FROM golang:1.25-bookworm AS client
ENV CGO_ENABLED=0
RUN go install github.com/minio/mc@77f82e18b5401a65958f1619df6ebb994634bd88
FROM debian:bookworm-slim AS minio
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && rm -rf /var/lib/apt/lists/*
COPY --from=server /go/bin/minio /usr/local/bin/minio
EXPOSE 9000 9001
ENTRYPOINT ["minio"]
FROM debian:bookworm-slim AS mc
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=client /go/bin/mc /usr/local/bin/mc
ENTRYPOINT ["mc"]
