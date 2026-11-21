#requires -Version 7.0
<#
.SYNOPSIS
  Owner-run front end for a signed Saagar Control Centre release build. Start it yourself, in a normal PowerShell 7 console:
    pwsh -NoProfile -ExecutionPolicy Bypass -File scripts\release-owner.ps1 -KeystorePath <file> -KeyAlias <alias>
.DESCRIPTION
  Release set (default):
    - needs a real console (it asks for the keystore and key passwords with hidden input; no password is ever a parameter, a file or a log line);
    - refuses a keystore that is inside the repository, the build folder, the output folder or any git work tree;
    - builds only from a fresh clone of one committed, clean commit that you confirm by typing its first 8 characters;
    - checks the key certificate against config/production-signing-policy.json BEFORE the long build;
    - calls scripts/build-production-release.ps1 (the audited recipe) and then scripts/verify-release-apk.mjs, which writes release-record.json.
  -ShowCertificateOnly prints the certificate fingerprints of your key and stops (use it once after you create the key).
  DryRun set: no key, no passwords. With -ExistingApk it only verifies a finished debug APK. Without it, it rehearses the whole pipeline
  (clean clone, npm ci, debug build, verification) with the automatic debug signing. A dry run never runs a release build.
#>
[CmdletBinding(DefaultParameterSetName = 'Release')]
param(
  [Parameter(ParameterSetName = 'Release', Mandatory = $true)][string]$KeystorePath,
  [Parameter(ParameterSetName = 'Release', Mandatory = $true)][ValidatePattern('^[A-Za-z0-9._-]{1,64}$')][string]$KeyAlias,
  [Parameter(ParameterSetName = 'Release')][switch]$ShowCertificateOnly,
  [Parameter(ParameterSetName = 'Release')][Parameter(ParameterSetName = 'DryRun')][switch]$TrustCeremonyCompleted,
  [Parameter(ParameterSetName = 'DryRun', Mandatory = $true)][switch]$DryRun,
  [Parameter(ParameterSetName = 'DryRun')][string]$ExistingApk,
  [ValidatePattern('^[0-9a-fA-F]{40}$')][string]$ExpectedCommit,
  [string]$OutputDirectory,
  [string]$BuildDirectory,
  [string]$JdkHome = 'E:\Tools\jdk-17',
  [string]$AndroidSdk = 'E:\Android\Sdk'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$isRelease = $PSCmdlet.ParameterSetName -eq 'Release'
$credentialVariables = @('SAAGAR_KEYSTORE_FILE', 'SAAGAR_KEYSTORE_PASSWORD', 'SAAGAR_KEY_ALIAS', 'SAAGAR_KEY_PASSWORD')

# A hidden password prompt needs a real console. This also keeps scripted or agent-driven runs out of the signing path. Release set only.
if ($isRelease) {
  if ([Console]::IsInputRedirected -or -not [Environment]::UserInteractive) {
    throw 'Release blocked: the signing path needs an interactive console; start this script yourself in a normal PowerShell window.'
  }
}

. (Join-Path $PSScriptRoot 'lib\release-owner-guards.ps1')

function Invoke-Checked {
  param([string]$FilePath, [string[]]$ArgumentList, [string]$Label)
  & $FilePath @ArgumentList
  if ($LASTEXITCODE -ne 0) { throw "$Label failed with exit code $LASTEXITCODE" }
}

function Read-SecretToEnvironment {
  param([string]$Prompt, [string]$Name, [switch]$BlankMeansReuse, [string]$ReuseFrom)
  $secure = Read-Host -Prompt $Prompt -AsSecureString
  $bstr = [IntPtr]::Zero
  $plain = $null
  try {
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    if ([string]::IsNullOrEmpty($plain)) {
      if (-not $BlankMeansReuse) { throw 'Release blocked: an empty password was entered.' }
      $plain = [Environment]::GetEnvironmentVariable($ReuseFrom, 'Process')
    }
    [Environment]::SetEnvironmentVariable($Name, $plain, 'Process')
  } finally {
    if ($bstr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
    $plain = $null
    $secure.Dispose()
  }
}

function Clear-SigningEnvironment {
  foreach ($name in $credentialVariables) {
    [Environment]::SetEnvironmentVariable($name, $null, [EnvironmentVariableTarget]::Process)
    Remove-Item -LiteralPath ('Env:' + $name) -ErrorAction SilentlyContinue
  }
}

try {
  $git = (Get-Command git -ErrorAction Stop).Source
  $npm = (Get-Command npm.cmd -ErrorAction Stop).Source
  $node = (Get-Command node.exe -ErrorAction Stop).Source

  # ---- source repository and the commit to build ----
  $sourceRepo = ((& $git -C $PSScriptRoot rev-parse --show-toplevel) | Select-Object -First 1).Trim() -replace '/', '\'
  if ($LASTEXITCODE -ne 0 -or -not $sourceRepo) { throw 'This script must run from inside the Saagar Control Centre repository.' }
  $sourceRepo = [IO.Path]::GetFullPath($sourceRepo)
  $requested = if ($ExpectedCommit) { $ExpectedCommit } else { 'HEAD' }
  $sha = ((& $git -C $sourceRepo rev-parse --verify "$requested^{commit}") | Select-Object -First 1).Trim().ToLowerInvariant()
  if ($LASTEXITCODE -ne 0 -or $sha -notmatch '^[0-9a-f]{40}$') { throw "Commit $requested was not found in the repository." }
  $short = $sha.Substring(0, 12)

  # ---- folders ----
  $stamp = (Get-Date).ToString('yyyy-MM-dd')
  $projects = Split-Path -Parent $sourceRepo
  if (-not $OutputDirectory) { $OutputDirectory = Join-Path $projects ("scc-release-artifacts\$stamp-$short" + $(if ($isRelease) { '' } else { '-dryrun' })) }
  if (-not $BuildDirectory) { $BuildDirectory = Join-Path $projects ("scc-release-build\$short-" + (Get-Date).ToString('HHmmss')) }
  foreach ($pair in @(@('OutputDirectory', $OutputDirectory), @('BuildDirectory', $BuildDirectory))) {
    if (-not [IO.Path]::IsPathRooted($pair[1])) { throw "$($pair[0]) must be an absolute path." }
  }
  $OutputDirectory = [IO.Path]::GetFullPath($OutputDirectory).TrimEnd('\')
  $BuildDirectory = [IO.Path]::GetFullPath($BuildDirectory).TrimEnd('\')
  foreach ($pair in @(@('OutputDirectory', $OutputDirectory), @('BuildDirectory', $BuildDirectory))) {
    if (Test-PathInside -Path $pair[1] -Parent $sourceRepo) { throw "$($pair[0]) must be outside the repository." }
    if (Test-Path -LiteralPath $pair[1]) { throw "$($pair[0]) must be a new path; release evidence is append-only." }
  }
  if ((Test-PathInside -Path $OutputDirectory -Parent $BuildDirectory) -or (Test-PathInside -Path $BuildDirectory -Parent $OutputDirectory)) {
    throw 'OutputDirectory and BuildDirectory must not contain each other.'
  }

  # ---- toolchain (this process only) ----
  foreach ($required in @((Join-Path $JdkHome 'bin\java.exe'), (Join-Path $JdkHome 'bin\keytool.exe'), (Join-Path $AndroidSdk 'build-tools'))) {
    if (-not (Test-Path -LiteralPath $required)) { throw "Toolchain item not found: $required" }
  }
  $env:JAVA_HOME = $JdkHome
  $env:ANDROID_HOME = $AndroidSdk
  $env:ANDROID_SDK_ROOT = $AndroidSdk
  $env:JAVA_OPTS = '-Djava.net.preferIPv4Stack=true'
  $env:GRADLE_OPTS = '-Djava.net.preferIPv4Stack=true'
  $env:PATH = (Join-Path $JdkHome 'bin') + ';' + $env:PATH
  if ($TrustCeremonyCompleted) { $env:SAAGAR_TRUST_CEREMONY_DONE = '1' } else { Remove-Item -LiteralPath 'Env:SAAGAR_TRUST_CEREMONY_DONE' -ErrorAction SilentlyContinue }

  function Show-FinalNotes {
    Write-Output ''
    Write-Output 'Reminder: an APK signed with a NEW key cannot update an app that was signed with the old key on the tablet.'
    Write-Output 'The old app must be uninstalled first, which deletes its data. Export the in-app backup BEFORE you uninstall it.'
  }

  # ---- build clone helper (used by both sets) ----
  function New-CleanClone {
    Invoke-Checked -FilePath $git -ArgumentList @('-c', 'core.autocrlf=false', 'clone', '--no-checkout', '--local', $sourceRepo, $BuildDirectory) -Label 'Clone of the source repository'
    Invoke-Checked -FilePath $git -ArgumentList @('-C', $BuildDirectory, 'config', 'core.autocrlf', 'false') -Label 'Clone line-ending setting'
    Invoke-Checked -FilePath $git -ArgumentList @('-C', $BuildDirectory, 'checkout', '--detach', $sha) -Label 'Checkout of the approved commit'
    $head = ((& $git -C $BuildDirectory rev-parse HEAD) | Select-Object -First 1).Trim().ToLowerInvariant()
    if ($head -ne $sha) { throw 'The build clone is not at the approved commit.' }
    $dirty = @(& $git -C $BuildDirectory status --porcelain --untracked-files=all)
    if ($dirty.Count -ne 0) { throw 'The build clone is not clean.' }
  }

  if ($isRelease) {
    # ---- keystore guards run BEFORE any prompt ----
    if (-not [IO.Path]::IsPathRooted($KeystorePath)) { throw 'Release blocked: KeystorePath must be an absolute path.' }
    $keystoreFull = [IO.Path]::GetFullPath($KeystorePath)
    if (-not (Test-Path -LiteralPath $keystoreFull -PathType Leaf)) { throw 'Release blocked: the keystore file does not exist.' }
    if (@('.jks', '.keystore', '.p12', '.pfx') -notcontains [IO.Path]::GetExtension($keystoreFull).ToLowerInvariant()) {
      throw 'Release blocked: the keystore must be a .jks, .keystore, .p12 or .pfx file.'
    }
    $problem = Get-KeystoreLocationProblem -KeystorePath $keystoreFull -RepositoryRoot $sourceRepo -BuildDirectory $BuildDirectory -OutputDirectory $OutputDirectory -GitPath $git
    if ($problem) { throw $problem }

    # ---- the owner confirms the commit by typing it (certificate-only runs build nothing and skip this) ----
    if (-not $ShowCertificateOnly) {
      Write-Output ''
      Write-Output 'You are about to build and sign this commit:'
      Invoke-Checked -FilePath $git -ArgumentList @('-C', $sourceRepo, 'log', '-1', '--format=  %h  %ci  %s', $sha) -Label 'Commit summary'
      $remote = @(& $git -C $sourceRepo branch -r --contains $sha 2>$null)
      if ($remote.Count -eq 0) { Write-Warning 'This commit is not on any remote branch (it has not been pushed).' }
      $typed = Read-Host -Prompt 'Type the first 8 characters of the commit to continue'
      if ($typed.Trim().ToLowerInvariant() -ne $sha.Substring(0, 8)) { throw 'Release blocked: the commit was not confirmed.' }
    }

    # ---- passwords: hidden input, process environment only ----
    [Environment]::SetEnvironmentVariable('SAAGAR_KEYSTORE_FILE', $keystoreFull, 'Process')
    [Environment]::SetEnvironmentVariable('SAAGAR_KEY_ALIAS', $KeyAlias, 'Process')
    Read-SecretToEnvironment -Prompt 'Keystore password (typing is hidden)' -Name 'SAAGAR_KEYSTORE_PASSWORD'
    if (-not $ShowCertificateOnly) {
      Read-SecretToEnvironment -Prompt 'Key password (typing is hidden; press Enter if it is the same as the keystore password)' -Name 'SAAGAR_KEY_PASSWORD' -BlankMeansReuse -ReuseFrom 'SAAGAR_KEYSTORE_PASSWORD'
    }

    # ---- certificate preflight, before the long build ----
    $keytool = Join-Path $JdkHome 'bin\keytool.exe'
    $listing = & $keytool -J-Duser.language=en -J-Duser.country=US -list -v -keystore $keystoreFull -alias $KeyAlias -storepass:env SAAGAR_KEYSTORE_PASSWORD 2>&1
    if ($LASTEXITCODE -ne 0) {
      throw 'Release blocked: keytool could not read the key (wrong password, wrong alias, or this keytool does not accept -storepass:env). Nothing was built.'
    }
    $certificate = ConvertFrom-KeytoolListing -Text ((@($listing) | ForEach-Object { "$_" }) -join "`n")
    $policyText = (& $git -C $sourceRepo show "${sha}:config/production-signing-policy.json") -join "`n"
    if ($LASTEXITCODE -ne 0) { throw 'The signing policy is not present in the approved commit.' }
    $policy = $policyText | ConvertFrom-Json
    Write-Output ''
    Write-Output 'Key certificate (write these down):'
    Write-Output "  Alias:       $($certificate.Alias)"
    Write-Output "  Owner:       $($certificate.Owner)"
    Write-Output "  SHA-256:     $($certificate.Sha256)"
    Write-Output "  SHA-1:       $($certificate.Sha1)"
    Write-Output "  Valid until: year $($certificate.ValidUntilYear)"
    Write-Output "  Key:         $($certificate.KeyBits)-bit $($certificate.KeyAlgorithm)"
    $found = Get-CertificateProblems -Certificate $certificate -CurrentYear (Get-Date).Year
    foreach ($warning in $found.Warnings) { Write-Warning $warning }
    $matchesPolicy = $certificate.Sha256 -eq ([string]$policy.signerCertificateSha256).ToUpperInvariant()
    if ($ShowCertificateOnly) {
      foreach ($errorText in $found.Errors) { Write-Warning "This key would be refused: $errorText" }
      if ($matchesPolicy) { Write-Output 'This certificate matches config/production-signing-policy.json.' }
      else { Write-Output "This certificate does NOT match config/production-signing-policy.json yet (the policy pins $($policy.signerCertificateSha256)). Give the SHA-256 above to the maintainer so the policy can be updated in a committed change; releases stay blocked until then." }
      return
    }
    if ($found.Errors.Count -gt 0) { throw ('Release blocked: ' + ($found.Errors -join '; ')) }
    if (-not $matchesPolicy) {
      throw "Release blocked: config/production-signing-policy.json pins $($policy.signerCertificateSha256) but the keystore has $($certificate.Sha256). Update the policy in a committed change first."
    }

    # ---- clean clone, dependencies, the audited recipe, verification ----
    New-CleanClone
    Push-Location -LiteralPath $BuildDirectory
    try { Invoke-Checked -FilePath $npm -ArgumentList @('ci') -Label 'npm ci' } finally { Pop-Location }
    $recipe = Join-Path $BuildDirectory 'scripts\build-production-release.ps1'
    & $recipe -ExpectedCommit $sha -OutputDirectory $OutputDirectory
    $apk = Join-Path $OutputDirectory ('SaagarCC-production-' + $short + '.apk')
    $register = Join-Path $OutputDirectory ('SaagarCC-production-' + $short + '.release.json')
    $receipt = Join-Path $OutputDirectory 'production-build-receipt.json'
    $verifierArguments = @((Join-Path $BuildDirectory 'scripts\verify-release-apk.mjs'), '--mode', 'release', '--apk', $apk, '--commit', $sha, '--out', $OutputDirectory,
      '--receipt', $receipt, '--register', $register, '--alias', $KeyAlias, '--keystore-file-name', ([IO.Path]::GetFileName($keystoreFull)))
    if ($TrustCeremonyCompleted) { $verifierArguments += '--trust-ceremony-done' }
    Invoke-Checked -FilePath $node -ArgumentList $verifierArguments -Label 'Release verification'
    Write-Output ''
    Write-Output "Signed APK:     $apk"
    Write-Output "Release record: $(Join-Path $OutputDirectory 'release-record.json')"
    Write-Output "Build folder kept for diagnostics: $BuildDirectory"
    Show-FinalNotes
  } else {
    # --- DRYRUN BRANCH ---
    # No key may reach a dry run, even by accident from an earlier shell.
    foreach ($name in $credentialVariables) {
      if (-not [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name, 'Process'))) {
        throw "Dry run blocked: $name is set in this shell. Open a fresh PowerShell window; a dry run never uses signing credentials."
      }
    }
    $dryArguments = @('--mode', 'dry-run', '--out', $OutputDirectory)
    if ($TrustCeremonyCompleted) { $dryArguments += '--trust-ceremony-done' }
    if ($ExistingApk) {
      if (-not [IO.Path]::IsPathRooted($ExistingApk) -or -not (Test-Path -LiteralPath $ExistingApk -PathType Leaf) -or [IO.Path]::GetExtension($ExistingApk).ToLowerInvariant() -ne '.apk') {
        throw 'ExistingApk must be an absolute path to an existing .apk file.'
      }
      Invoke-Checked -FilePath $node -ArgumentList (@((Join-Path $sourceRepo 'scripts\verify-release-apk.mjs'), '--apk', $ExistingApk) + $dryArguments) -Label 'Dry-run verification'
    } else {
      New-CleanClone
      Push-Location -LiteralPath $BuildDirectory
      try {
        Invoke-Checked -FilePath $npm -ArgumentList @('ci') -Label 'npm ci'
        if (-not (Test-Path -LiteralPath 'android\gradlew.bat' -PathType Leaf)) { Invoke-Checked -FilePath $npm -ArgumentList @('run', 'add:android') -Label 'Capacitor Android platform generation' }
        Invoke-Checked -FilePath $npm -ArgumentList @('run', 'sync') -Label 'Capacitor sync'
        Invoke-Checked -FilePath $node -ArgumentList @('build-overrides\apply-overrides.js') -Label 'Android override application'
        Invoke-Checked -FilePath $node -ArgumentList @('scripts\verify-generated-android-release.mjs') -Label 'Generated Android release verification'
        Invoke-Checked -FilePath $npm -ArgumentList @('run', 'prepare:api23') -Label 'API-23 asset preparation'
        Push-Location -LiteralPath 'android'
        try { Invoke-Checked -FilePath (Join-Path (Get-Location) 'gradlew.bat') -ArgumentList @('assembleDebug', '--no-daemon', '--stacktrace') -Label 'Debug build (automatic debug signing)' } finally { Pop-Location }
      } finally { Pop-Location }
      $builtApk = Join-Path $BuildDirectory 'android\app\build\outputs\apk\debug\app-debug.apk'
      if (-not (Test-Path -LiteralPath $builtApk -PathType Leaf)) { throw 'The debug APK was not produced.' }
      New-Item -ItemType Directory -Path $OutputDirectory | Out-Null
      $rehearsalApk = Join-Path $OutputDirectory ('SaagarCC-dryrun-' + $short + '-debug.apk')
      Copy-Item -LiteralPath $builtApk -Destination $rehearsalApk
      Invoke-Checked -FilePath $node -ArgumentList (@((Join-Path $BuildDirectory 'scripts\verify-release-apk.mjs'), '--apk', $rehearsalApk) + $dryArguments) -Label 'Dry-run verification'
    }
    Write-Output ''
    Write-Output "Dry run finished. Record: $(Join-Path $OutputDirectory 'dry-run-record.json')"
  }
} finally {
  Clear-SigningEnvironment
  Remove-Item -LiteralPath 'Env:SAAGAR_TRUST_CEREMONY_DONE' -ErrorAction SilentlyContinue
}
