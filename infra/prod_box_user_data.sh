#!/bin/bash
# First-boot setup for the KoristProd box: base software only. Apps bring their
# own users, units and Caddy blocks through their provision scripts.
# Runs once. Editing this file restarts the box on the next deploy (see prod_box.py).
set -eux
export DEBIAN_FRONTEND=noninteractive

# Swap: a spike should page, not OOM-kill a service.
fallocate -l 1G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

apt-get update
apt-get install -y curl unzip sqlite3 debian-keyring debian-archive-keyring apt-transport-https

# AWS CLI v2 (no apt candidate on Ubuntu 24.04)
curl -s "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o /tmp/awscliv2.zip
unzip -q /tmp/awscliv2.zip -d /tmp
/tmp/aws/install

# Caddy (official repo). The package's sample site would answer on :80, so
# start from an empty Caddyfile that apps append to.
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  > /etc/apt/sources.list.d/caddy-stable.list
apt-get update
apt-get install -y caddy
echo '# Site blocks are appended by each app'"'"'s provision script.' > /etc/caddy/Caddyfile
systemctl restart caddy

# uv (system-wide)
curl -LsSf https://astral.sh/uv/install.sh | env UV_INSTALL_DIR="/usr/local/bin" INSTALLER_NO_MODIFY_PATH=1 sh
