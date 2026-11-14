$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Join-Path $PSScriptRoot '..')
Write-Host 'Optional: only prompt bots need an LLM key. Rules and Python bots do not.'
Write-Host 'Create a key at https://cloud.near.ai (API Keys). Do not paste it into chat.'
$catalog = Invoke-RestMethod 'https://cloud-api.near.ai/v1/models'
$catalog.data | Where-Object { $_.architecture.outputModalities -contains 'text' } | Sort-Object { [decimal]$_.pricing.input + [decimal]$_.pricing.output } | Select-Object -First 12 id, @{Name='Input_USD_per_M';Expression={$_.pricing.input}}, @{Name='Output_USD_per_M';Expression={$_.pricing.output}} | Format-Table
$modelId = Read-Host 'Exact model ID from catalog'
$model = $catalog.data | Where-Object { $_.id -eq $modelId } | Select-Object -First 1
if (-not $model) { throw 'Model ID is not in the current official catalog' }
$key = Read-Host 'NEAR AI API key (hidden input)' -AsSecureString
$budgetText = Read-Host 'Approve maximum daily research budget in USD (for example 1.00)'
if ($budgetText -notmatch '^\d{1,2}(\.\d{1,6})?$') { throw 'Invalid budget' }
$budgetMicros = [long]([decimal]$budgetText * 1000000)
if ($budgetMicros -le 0 -or $budgetMicros -gt 10000000) { throw 'Choose more than 0 and at most 10 USD' }
Write-Host 'Provider token limits are not a verified hard billing cap. Timed-out calls keep their reservations.'
if ((Read-Host 'Type ENABLE to allow estimated-cap LLM requests from your local app') -cne 'ENABLE') { throw 'Not enabled' }
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($key)
try {
  $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  $settings = @{ NEAR_AI_API_KEY=$plain; NEAR_AI_MODEL=$model.id; LIVE_APPROVED_DAILY_MICROS=[string]$budgetMicros; LIVE_ALLOW_ESTIMATED_CAP='true'; LIVE_INPUT_MICROS_PER_MILLION=[string][long][math]::Ceiling([decimal]$model.pricing.input*1000000); LIVE_OUTPUT_MICROS_PER_MILLION=[string][long][math]::Ceiling([decimal]$model.pricing.output*1000000); LIVE_INPUT_TOKEN_BOUND='8192'; LIVE_MAX_OUTPUT_TOKENS='512'; LIVE_SUPPORTS_TEMPERATURE=[string]($model.supported_sampling_parameters -contains 'temperature') }
  $json = $settings | ConvertTo-Json -Compress
  New-Item -ItemType Directory -Force data | Out-Null
  ConvertFrom-SecureString (ConvertTo-SecureString $json -AsPlainText -Force) | Set-Content -LiteralPath data/ai-settings.dpapi -Encoding ascii
} finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer); $plain=$null; $json=$null; $settings=$null }
Write-Host 'Saved encrypted settings for this Windows account. No inference request was sent. Run .\start.ps1.'
