# Pure helper functions for scripts/release-owner.ps1. Dot-sourced; nothing here runs on load, reads a password or touches a key.
# They take plain strings so tests can exercise them without any key material.

function ConvertTo-SlashFreePath {
  param([Parameter(Mandatory = $true)][string]$Path)
  return [IO.Path]::GetFullPath($Path).TrimEnd('\', '/')
}

# True when $Path equals $Parent or sits below it (case-insensitive, whole path segments only).
function Test-PathInside {
  param([Parameter(Mandatory = $true)][string]$Path, [Parameter(Mandatory = $true)][string]$Parent)
  $full = ConvertTo-SlashFreePath -Path $Path
  $base = ConvertTo-SlashFreePath -Path $Parent
  if ($full.Equals($base, [StringComparison]::OrdinalIgnoreCase)) { return $true }
  return $full.StartsWith($base + '\', [StringComparison]::OrdinalIgnoreCase)
}

# Returns $null when the keystore location is acceptable, otherwise the reason it is refused. It never opens the file.
# A keystore must sit outside the source repository, the build clone, the output folder and ANY git work tree.
function Get-KeystoreLocationProblem {
  param(
    [Parameter(Mandatory = $true)][string]$KeystorePath,
    [Parameter(Mandatory = $true)][string]$RepositoryRoot,
    [string]$BuildDirectory = '',
    [string]$OutputDirectory = '',
    [string]$GitPath = 'git'
  )
  if (-not [IO.Path]::IsPathRooted($KeystorePath)) { return 'the keystore path must be absolute' }
  $candidates = @([IO.Path]::GetFullPath($KeystorePath))
  if (Test-Path -LiteralPath $KeystorePath) {
    $item = Get-Item -LiteralPath $KeystorePath -Force
    if ($item.LinkTarget) {
      $target = $item.ResolveLinkTarget($true)
      if ($target) { $candidates += $target.FullName }
    }
  }
  foreach ($candidate in $candidates) {
    foreach ($forbidden in @($RepositoryRoot, $BuildDirectory, $OutputDirectory)) {
      if ($forbidden -and (Test-PathInside -Path $candidate -Parent $forbidden)) {
        return 'Release blocked: the keystore must be outside the repository, the build folder and the output folder'
      }
    }
  }
  # Any git work tree (another clone, a worktree, a parent folder that was turned into a repository) is refused too.
  $directory = Split-Path -Parent $candidates[0]
  if (-not (Test-Path -LiteralPath $directory -PathType Container)) { return 'the keystore folder does not exist' }
  $answer = & $GitPath -C $directory rev-parse --is-inside-work-tree 2>&1
  $code = $LASTEXITCODE
  $text = (@($answer) | ForEach-Object { "$_" }) -join ' '
  if ($code -eq 0) { return 'Release blocked: the keystore folder is inside a git repository; keep keys outside any repository' }
  if ($text -notmatch 'not a git repository') { return 'Release blocked: could not confirm that the keystore folder is outside every git repository' }
  return $null
}

function ConvertTo-FingerprintHex {
  param([Parameter(Mandatory = $true)][string]$Value)
  return ($Value -replace '[^0-9A-Fa-f]', '').ToUpperInvariant()
}

# Reads the first certificate of `keytool -list -v` output (English locale is forced by the caller).
function ConvertFrom-KeytoolListing {
  param([Parameter(Mandatory = $true)][string]$Text)
  $first = ($Text -split '(?m)^Certificate\[2\]:')[0]
  $alias = [regex]::Match($first, '(?m)^Alias name:\s*(.+?)\s*$')
  $owner = [regex]::Match($first, '(?m)^Owner:\s*(.+?)\s*$')
  $until = [regex]::Match($first, '(?m)until:\s.*?\b(\d{4})\s*$')
  $sha256 = [regex]::Match($first, '(?m)^\s*SHA256:\s*([0-9A-Fa-f:]+)\s*$')
  $sha1 = [regex]::Match($first, '(?m)^\s*SHA1:\s*([0-9A-Fa-f:]+)\s*$')
  $keyInfo = [regex]::Match($first, '(?m)^Subject Public Key Algorithm:\s*(\d+)-bit\s+([A-Za-z0-9]+)')
  return [pscustomobject]@{
    Alias = if ($alias.Success) { $alias.Groups[1].Value } else { $null }
    Owner = if ($owner.Success) { $owner.Groups[1].Value } else { $null }
    ValidUntilYear = if ($until.Success) { [int]$until.Groups[1].Value } else { $null }
    Sha256 = if ($sha256.Success) { ConvertTo-FingerprintHex -Value $sha256.Groups[1].Value } else { $null }
    Sha1 = if ($sha1.Success) { ConvertTo-FingerprintHex -Value $sha1.Groups[1].Value } else { $null }
    KeyBits = if ($keyInfo.Success) { [int]$keyInfo.Groups[1].Value } else { $null }
    KeyAlgorithm = if ($keyInfo.Success) { $keyInfo.Groups[2].Value.ToUpperInvariant() } else { $null }
  }
}

# Returns @{ Errors = @(...); Warnings = @(...) } for a parsed certificate. Floors are the maintainer's recommendation:
# RSA at least 2048 bits (EC at least 256), validity of at least 10 years (a warning below 25 years). The year is the only date compared.
function Get-CertificateProblems {
  param([Parameter(Mandatory = $true)]$Certificate, [Parameter(Mandatory = $true)][int]$CurrentYear)
  $errors = New-Object System.Collections.Generic.List[string]
  $warnings = New-Object System.Collections.Generic.List[string]
  if (-not $Certificate.Sha256 -or $Certificate.Sha256.Length -ne 64) { $errors.Add('the certificate SHA-256 fingerprint could not be read') }
  if ($null -eq $Certificate.KeyBits) {
    $errors.Add('the key algorithm and size could not be read')
  } elseif ($Certificate.KeyAlgorithm -eq 'RSA') {
    if ($Certificate.KeyBits -lt 2048) { $errors.Add("the RSA key is only $($Certificate.KeyBits) bits; at least 2048 is required") }
  } elseif ($Certificate.KeyAlgorithm -eq 'EC') {
    if ($Certificate.KeyBits -lt 256) { $errors.Add("the EC key is only $($Certificate.KeyBits) bits; at least 256 is required") }
  } else {
    $errors.Add("the key algorithm $($Certificate.KeyAlgorithm) is not accepted")
  }
  if ($null -eq $Certificate.ValidUntilYear) {
    $errors.Add('the certificate end of validity could not be read')
  } elseif ($Certificate.ValidUntilYear -lt ($CurrentYear + 10)) {
    $errors.Add("the certificate is valid only until $($Certificate.ValidUntilYear); at least 10 years are required")
  } elseif ($Certificate.ValidUntilYear -lt ($CurrentYear + 25)) {
    $warnings.Add("the certificate is valid only until $($Certificate.ValidUntilYear); 25 years or more is recommended")
  }
  return [pscustomobject]@{ Errors = $errors.ToArray(); Warnings = $warnings.ToArray() }
}
