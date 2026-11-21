$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$vaultRoot = 'E:\Projects\Saagar Control Centre Workspace\Saagar Architecture Vault'
$crg = 'E:\ClaudeDev\uv\bin\code-review-graph.exe'
$graphifyPython = (Get-Content (Join-Path $repoRoot 'graphify-out\.graphify_python') -Raw).Trim()
if (-not (Test-Path $graphifyPython)) { $graphifyPython = (Get-Command python).Source }

& $crg update --repo $repoRoot
& $graphifyPython -m graphify update $repoRoot

Copy-Item -LiteralPath (Join-Path $repoRoot 'graphify-out\GRAPH_REPORT.md') -Destination (Join-Path $vaultRoot 'Architecture\Graphify\Architecture Report.md') -Force

$status = & $crg status --repo $repoRoot 2>&1 | Out-String
$statusNote = @"
# CRG Index Status

Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz')

``````text
$($status.Trim())
``````

Back to [[Architecture/Index|Architecture Index]].
"@
Set-Content -LiteralPath (Join-Path $vaultRoot 'Architecture\CRG\Index Status.md') -Value $statusNote -Encoding utf8

Write-Host "Architecture vault refreshed: $vaultRoot"
