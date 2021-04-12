FROM node:lts as build-stage
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# Install deps
RUN apt-get update -y \
    && export DEBIAN_FRONTEND=noninteractive \
    && apt-get install --no-install-recommends -y wget=1.* \
    && rm -rf /var/lib/apt/lists/*
# Download latest nvim stable Github release. See:
# https://gist.github.com/steinwaywhw/a4cd19cda655b8249d908261a62687f8
RUN wget -O - --progress=dot:giga https://api.github.com/repos/neovim/neovim/releases/latest \
    | grep 'browser_download_url.*nvim.appimage"' \
    | cut -d : -f 2,3 \
    | tr -d \" \
    | wget --progress=dot:giga -i -
RUN chmod +x nvim.appimage
RUN ./nvim.appimage --appimage-extract
RUN chmod -R a+rx /squashfs-root/
RUN mkdir -p /usr/local/bin
RUN ln -s /squashfs-root/AppRun /usr/local/bin/nvim

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
