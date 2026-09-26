# Starts the image-generation server natively on Windows with the NVIDIA GPU (CUDA), using stable-diffusion.cpp.
#   docker compose --profile setup run --rm -e OPEX_FETCH_IMAGE=1 model-fetch     # once (~2.1 GB)
#   powershell -ExecutionPolicy Bypass -File scripts\run-native-imagegen.ps1
# Then add LLM_IMAGE_URL=http://host.docker.internal:8090 to .env and restart the API.
# On a 4 GB GPU the chat model and this model cannot both stay in GPU memory: --offload-to-cpu keeps weights in RAM
# and loads them to the GPU only while drawing (slower, but works). Untested on real Windows hardware by the authors.
$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$Model = if ($env:IMAGE_MODEL) { $env:IMAGE_MODEL } else { Join-Path $Root "models\DreamShaper8_LCM.safetensors" }
$Port = if ($env:IMAGE_PORT) { $env:IMAGE_PORT } else { "8090" }
if (-not (Test-Path $Model)) { throw "Image model not found: $Model. Run: docker compose --profile setup run --rm -e OPEX_FETCH_IMAGE=1 model-fetch" }

$Bin = Join-Path $Root "tools\sd"
$Server = Get-ChildItem -Path $Bin -Recurse -Filter "sd-server.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $Server) {
  Write-Host "Downloading stable-diffusion.cpp (CUDA build) ..."
  $rel = Invoke-RestMethod "https://api.github.com/repos/leejet/stable-diffusion.cpp/releases/latest"
  $zip = $rel.assets | Where-Object { $_.name -match "bin-win-cuda12-x64\.zip$" } | Select-Object -First 1
  $rt  = $rel.assets | Where-Object { $_.name -match "^cudart-sd-bin-win-cu12-x64\.zip$" } | Select-Object -First 1
  if (-not $zip) { throw "No Windows CUDA build found in the latest release." }
  New-Item -ItemType Directory -Force -Path $Bin | Out-Null
  foreach ($a in @($zip, $rt)) {
    if ($a) {
      $tmp = Join-Path $env:TEMP $a.name
      Invoke-WebRequest $a.browser_download_url -OutFile $tmp
      Expand-Archive -Path $tmp -DestinationPath $Bin -Force
    }
  }
  $Server = Get-ChildItem -Path $Bin -Recurse -Filter "sd-server.exe" | Select-Object -First 1
}

$offload = @()
try {
  $vram = [int](& nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits | Select-Object -First 1).Trim()
  if ($vram -lt 6000) { $offload = @("--offload-to-cpu") }
} catch {}

Write-Host "Starting the image server on port $Port. Add LLM_IMAGE_URL=http://host.docker.internal:$Port to .env and restart the API."
& $Server.FullName -m $Model --listen-ip $(if ($env:HOST) { $env:HOST } else { "127.0.0.1" }) --listen-port $Port --steps 4 --cfg-scale 1.5 --sampling-method lcm --diffusion-fa @offload
