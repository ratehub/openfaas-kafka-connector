FROM node:10.15-alpine

LABEL org.label-schema.name="openfaas-kafka-connector"\
      org.label-schema.vcs-ref="$VCS_REF" \
      org.label-schema.vcs-url="https://github.com/ratehub/openfaas-kafka-connector"\
      org.label-schema.build-date="$BUILD_DATE"\
      org.label-schema.version="$VERSION"

# Create app directory
WORKDIR /usr/src/app
COPY ./ ./

RUN apk add --update \
   curl \
   bash \
 && rm -rf /var/cache/apk/*

RUN npm install && npm cache clean --force
COPY . .

CMD [ "npm", "start" ]
