FROM node:lts-alpine AS build-stage
SHELL ["/bin/sh", "-o", "pipefail", "-c"]

RUN apk add --no-cache neovim

COPY . /firenvim
WORKDIR /firenvim
RUN npm install
RUN npm run build
RUN npm run install_manifests

FROM scratch AS export-stage
COPY --from=build-stage /firenvim/target /
