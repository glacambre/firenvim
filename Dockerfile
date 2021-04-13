FROM node:lts as build-stage
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# Install Neovim
RUN export DEBIAN_FRONTEND=noninteractive && \
    apt-get update -y && \
    apt-get install --no-install-recommends -y neovim && \
    rm -rf /var/lib/apt/lists/*

# Drop privileges and build firenvim
RUN useradd --create-home --user-group user
USER user
COPY --chown=user:user . /firenvim
WORKDIR /firenvim
RUN npm install
RUN npm run build
RUN npm run install_manifests

FROM scratch AS export-stage
COPY --from=build-stage /firenvim/target /
