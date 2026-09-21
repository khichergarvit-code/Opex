#!/usr/bin/env bash
# Records host hardware facts relevant to Spike A (do the 4 model endpoints
# fit in VRAM?) and to sizing llama-server for this machine. Portable across
# macOS and Linux. Prints a human-readable report and writes it to
# scripts/spikes/results/hw-probe.md.
set -euo pipefail

OUT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/scripts/spikes/results"
mkdir -p "$OUT_DIR"
OUT_FILE="$OUT_DIR/hw-probe.md"

OS="$(uname -s)"
ARCH="$(uname -m)"

{
  echo "# hw-probe results"
  echo
  echo "Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  echo
  echo "- OS: $OS"
  echo "- Arch: $ARCH"

  if [[ "$OS" == "Darwin" ]]; then
    RAM_GB=$(( $(sysctl -n hw.memsize) / 1024 / 1024 / 1024 ))
    CPU_BRAND=$(sysctl -n machdep.cpu.brand_string 2>/dev/null || echo "unknown")
    CPU_CORES=$(sysctl -n hw.ncpu)
    echo "- CPU: $CPU_BRAND ($CPU_CORES cores)"
    echo "- RAM: ${RAM_GB} GB (unified memory — shared by CPU and GPU on Apple Silicon)"
    if command -v system_profiler >/dev/null 2>&1; then
      GPU_CHIP=$(system_profiler SPDisplaysDataType 2>/dev/null | grep "Chipset Model" | head -1 | sed 's/^ *//')
      echo "- GPU: ${GPU_CHIP:-unknown} (Metal; no discrete VRAM — see unified memory note above)"
    fi
    echo "- Metal available: yes (native builds only; Docker Desktop does NOT pass Metal through to Linux containers)"
  elif [[ "$OS" == "Linux" ]]; then
    RAM_GB=$(( $(grep MemTotal /proc/meminfo | awk '{print $2}') / 1024 / 1024 ))
    CPU_MODEL=$(grep -m1 "model name" /proc/cpuinfo | cut -d: -f2 | sed 's/^ *//')
    CPU_CORES=$(nproc)
    echo "- CPU: ${CPU_MODEL:-unknown} ($CPU_CORES cores)"
    echo "- RAM: ${RAM_GB} GB"
    if command -v nvidia-smi >/dev/null 2>&1; then
      echo "- NVIDIA GPU(s):"
      nvidia-smi --query-gpu=name,memory.total --format=csv,noheader | sed 's/^/  - /'
    else
      echo "- NVIDIA GPU: none detected (nvidia-smi not found)"
    fi
  fi

  if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    DOCKER_MEM_GB=$(docker info --format '{{.MemTotal}}' | awk '{printf "%.2f", $1/1024/1024/1024}')
    DOCKER_NCPU=$(docker info --format '{{.NCPU}}')
    DOCKER_OS=$(docker info --format '{{.OSType}}/{{.Architecture}}')
    echo
    echo "## Docker daemon"
    echo "- Allocated memory: ${DOCKER_MEM_GB} GB"
    echo "- CPUs: $DOCKER_NCPU"
    echo "- Container OS/Arch: $DOCKER_OS"
    if [[ "$OS" == "Darwin" ]]; then
      echo "- Note: this is a Linux VM's resource allocation, adjustable in Docker Desktop settings, not a hard cap."
    fi
  else
    echo
    echo "## Docker daemon: not running or not accessible"
  fi
} | tee "$OUT_FILE"

echo
echo "Written to $OUT_FILE"
