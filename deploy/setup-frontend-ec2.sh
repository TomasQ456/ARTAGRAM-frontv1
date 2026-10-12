#!/usr/bin/env bash
set -e

echo "=========================================================="
echo "  Artagram - Setup para instancia EC2 del Frontend        "
echo "=========================================================="

sudo apt-get update -y
sudo apt-get install -y ca-certificates curl gnupg

sudo install -m 0755 -d /etc/apt/keyrings
if [ ! -f /etc/apt/keyrings/docker.gpg ]; then
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    sudo chmod a+r /etc/apt/keyrings/docker.gpg
fi

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update -y
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin

CURRENT_USER=$(whoami)
sudo usermod -aG docker "${CURRENT_USER}"
mkdir -p "/home/${CURRENT_USER}/artagram"

echo "=========================================================="
echo "  Instalación de Docker lista en la máquina del Frontend!  "
echo "=========================================================="
