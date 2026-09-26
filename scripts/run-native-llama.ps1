# Runs the chat/vision model natively on Windows with the NVIDIA GPU (CUDA).
#   powershell -ExecutionPolicy Bypass -File scripts\run-native-llama.ps1            # small tier
#   $env:LLM_TIER = "standard"; powershell -File scripts\run-native-llama.ps1
# Tiers: small = Qwen3-VL-4B (~3 GB VRAM, fits an RTX 3050 4 GB), standard = Qwen2.5-VL-7B (8 GB+ GPU).
# Untested on real Windows hardware by the authors: report problems.
$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$Tier = if ($env:LLM_TIER) { $env:LLM_TIER } else { "small" }
switch ($Tier) {
  "small"    { $Model = "Qwen3VL-4B-Instruct-Q4_K_M.gguf";    $Mmproj = "mmproj-Qwen3VL-4B-Instruct-Q8_0.gguf";    $Ctx = 8192 }
  "standard" { $Model = "Qwen2.5-VL-7B-Instruct-Q4_K_M.gguf"; $Mmproj = "mmproj-Qwen2.5-VL-7B-Instruct-Q8_0.gguf"; $Ctx = 16384 }
  default    { throw "LLM_TIER must be small or standard" }
}
$Port = if ($env:PORT) { $env:PORT } else { "8082" }

# Context size and KV-cache precision follow the GPU memory: a 4 GB card (e.g. RTX 3050 laptop) cannot hold
# the model plus a large context, so it gets a smaller, quantized cache.
$KvArgs = @()
if ($env:CTX) { $Ctx = [int]$env:CTX }
try {
  $vram = [int](& nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits | Select-Object -First 1).Trim()
  Write-Host "Detected NVIDIA GPU with $vram MB."
  if ($vram -lt 5500) {
    if (-not $env:CTX) { $Ctx = 4096 }
    $KvArgs = @("-fa", "on", "--cache-type-k", "q8_0", "--cache-type-v", "q8_0")
  }
} catch { Write-Host "nvidia-smi not found; using the default context size." }
$ModelPath = Join-Path $Root "models\$Model"
$MmprojPath = Join-Path $Root "models\$Mmproj"
if (-not (Test-Path $ModelPath)) {
  throw "Model file not found: $ModelPath. Run: docker compose --profile setup run --rm model-fetch"
}

# Find or download llama.cpp's CUDA build of llama-server.
$Bin = Join-Path $Root "tools\llama.cpp"
$Server = Get-ChildItem -Path $Bin -Recurse -Filter "llama-server.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $Server) {
  $cmd = Get-Command llama-server.exe -ErrorAction SilentlyContinue
  if ($cmd) { $Server = $cmd } else {
    Write-Host "Downloading llama.cpp (CUDA build) ..."
    $rel = Invoke-RestMethod "https://api.github.com/repos/ggml-org/llama.cpp/releases/latest"
    $zip = $rel.assets | Where-Object { $_.name -match "^llama-.*-bin-win-cuda-.*-x64\.zip$" } | Select-Object -First 1
    $rt  = $rel.assets | Where-Object { $_.name -match "^cudart-llama-bin-win-cuda-.*-x64\.zip$" } | Select-Object -First 1
    if (-not $zip) { throw "Could not find a Windows CUDA build in the latest llama.cpp release. Install llama-server manually." }
    New-Item -ItemType Directory -Force -Path $Bin | Out-Null
    foreach ($a in @($zip, $rt)) {
      if ($a) {
        $tmp = Join-Path $env:TEMP $a.name
        Invoke-WebRequest $a.browser_download_url -OutFile $tmp
        Expand-Archive -Path $tmp -DestinationPath $Bin -Force
      }
    }
    $Server = Get-ChildItem -Path $Bin -Recurse -Filter "llama-server.exe" | Select-Object -First 1
  }
}
$ServerPath = if ($Server.FullName) { $Server.FullName } else { $Server.Source }

Write-Host "Starting the '$Tier' model on port $Port with GPU offload."
Write-Host "Add these lines to .env, then run: docker compose stop llm-main; docker compose up -d api"
Write-Host "  LLM_TIER=$Tier"
Write-Host "  LLM_CTX_LEN=$Ctx"
Write-Host "  LLM_MAIN_URL=http://host.docker.internal:$Port"
Write-Host "  LLM_ROUTER_URL=http://host.docker.internal:$Port"
Write-Host "  LLM_VISION_URL=http://host.docker.internal:$Port"

$argsList = @("-m", $ModelPath, "--host", "0.0.0.0", "--port", $Port, "-c", $Ctx, "-np", "1", "--jinja", "-ngl", "99") + $KvArgs
if (Test-Path $MmprojPath) { $argsList += @("--mmproj", $MmprojPath) }
& $ServerPath @argsList
