param(
  [string]$Environment = "staging"
)

Write-Host "Starting deployment to $Environment"

if ($Environment -notin @("staging", "production")) {
  throw "Unsupported environment: $Environment"
}

$requiredFiles = @(
  "manifest.json",
  "docs/ARCHITECTURE.md",
  "src/main.ts"
)

foreach ($file in $requiredFiles) {
  if (-not (Test-Path $file)) {
    throw "Missing required file: $file"
  }
}

Write-Host "Validation complete. Deploy steps would run here."
# TODO: Add artifact upload and release tagging.
