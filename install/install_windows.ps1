# One-time, per-user installer. No global execution-policy changes, no admin,
# no startup task, and no antivirus exclusions are created.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
$Root = Split-Path -Parent $PSScriptRoot
$Version = (Get-Content -LiteralPath (Join-Path $PSScriptRoot 'electron-version.txt') -Raw).Trim()
if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw 'Invalid Electron version.' }
$Arch = if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } else { $env:PROCESSOR_ARCHITECTURE }
if ($Arch -ne 'AMD64') { throw 'This Windows package supports x64 PCs only. ARM64 and 32-bit Windows are not packaged.' }
if ([Environment]::OSVersion.Version.Major -lt 10) { throw 'Windows 10 or later is required.' }
$Target = Join-Path $env:LOCALAPPDATA 'Programs\TubeSave'
$Logs = Join-Path $env:LOCALAPPDATA 'TubeSave\logs'
New-Item -ItemType Directory -Force -Path $Logs | Out-Null
$Stage = Join-Path $env:TEMP ('TubeSave-install-' + [guid]::NewGuid().ToString('N'))
$Backup = $null
$Mutex = New-Object System.Threading.Mutex($false, 'Local\TubeSaveDesktopInstaller')
if (-not $Mutex.WaitOne(0)) { throw 'Another TubeSave installer is already running.' }
Start-Transcript -Path (Join-Path $Logs 'install.log') -Append | Out-Null
try {
  $Message = "Install the TubeSave desktop app?`n`nElectron, yt-dlp and FFmpeg will be downloaded, SHA-256 checked and installed together.`nNo Python, Node.js, npm, or administrator permissions are required.`n`nLocation: $Target`nAfter setup, use the TubeSave desktop shortcut."
  $Answer = [System.Windows.Forms.MessageBox]::Show($Message, 'TubeSave Desktop', 'OKCancel', 'Information')
  if ($Answer -ne 'OK') { return }
  if (Test-Path -LiteralPath $Target) {
    $Manifest = Join-Path $Target 'resources\app\package.json'
    if (-not (Test-Path -LiteralPath $Manifest)) { throw 'An unrelated folder already exists at the target; it was not changed.' }
    $Old = Get-Content -LiteralPath $Manifest -Raw | ConvertFrom-Json
    if ($Old.name -ne 'tubesave-desktop') { throw 'An unrelated application already exists at the target.' }
    $Answer = [System.Windows.Forms.MessageBox]::Show('Close TubeSave before updating. The old app will be kept as a backup. Video files and app data will not be deleted.', 'Update TubeSave', 'OKCancel', 'Information')
    if ($Answer -ne 'OK') { return }
  }
  New-Item -ItemType Directory -Path $Stage | Out-Null
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
  $Asset = "electron-v$Version-win32-x64.zip"
  $Base = "https://github.com/electron/electron/releases/download/v$Version"
  Write-Host '[1/5] Downloading the official Electron runtime...'
  Invoke-WebRequest -UseBasicParsing -Uri "$Base/SHASUMS256.txt" -OutFile (Join-Path $Stage 'SHASUMS256.txt') -TimeoutSec 120
  Invoke-WebRequest -UseBasicParsing -Uri "$Base/$Asset" -OutFile (Join-Path $Stage $Asset) -TimeoutSec 1200
  $Expected = $null
  foreach ($Line in Get-Content -LiteralPath (Join-Path $Stage 'SHASUMS256.txt')) {
    if ($Line -match '^([0-9a-fA-F]{64})\s+\*?(.+)$') { if ($Matches[2] -eq $Asset) { $Expected = $Matches[1].ToLowerInvariant(); break } }
  }
  if (-not $Expected) { throw 'No matching SHA-256 checksum was found.' }
  $Actual = (Get-FileHash -LiteralPath (Join-Path $Stage $Asset) -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($Expected -ne $Actual) { throw 'SHA-256 verification failed; no files were installed.' }
  Write-Host '[2/5] Preparing the desktop application...'
  $Unpacked = Join-Path $Stage 'unpacked'
  Expand-Archive -LiteralPath (Join-Path $Stage $Asset) -DestinationPath $Unpacked
  if (-not (Test-Path -LiteralPath (Join-Path $Unpacked 'electron.exe'))) { throw 'The Electron executable is missing.' }
  $AppPath = Join-Path $Unpacked 'resources\app'
  New-Item -ItemType Directory -Force -Path $AppPath | Out-Null
  Copy-Item -Path (Join-Path $Root 'app\*') -Destination $AppPath -Recurse -Force
  Rename-Item -LiteralPath (Join-Path $Unpacked 'electron.exe') -NewName 'TubeSave.exe'
  Write-Host '[3/5] Installing and verifying the download engines...'
  $PreviousNodeMode = $env:ELECTRON_RUN_AS_NODE
  try {
    $env:ELECTRON_RUN_AS_NODE = '1'
    $EngineArgs = '"' + (Join-Path $Root 'scripts\prepare-engines.cjs') + '" "' + (Join-Path $Unpacked 'resources\engines') + '"'
    $EngineProcess = Start-Process -FilePath (Join-Path $Unpacked 'TubeSave.exe') -ArgumentList $EngineArgs -NoNewWindow -Wait -PassThru
    if ($EngineProcess.ExitCode -ne 0) { throw 'Download engine setup failed. The old application has not been changed.' }
  } finally {
    $env:ELECTRON_RUN_AS_NODE = $PreviousNodeMode
  }
  Write-Host '[4/5] Installing per-user files...'
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Target) | Out-Null
  if (Test-Path -LiteralPath $Target) { $Backup = "$Target.previous.$(Get-Date -Format yyyyMMddHHmmss)"; Move-Item -LiteralPath $Target -Destination $Backup }
  try { Move-Item -LiteralPath $Unpacked -Destination $Target }
  catch { if ($Backup -and -not (Test-Path -LiteralPath $Target)) { Move-Item -LiteralPath $Backup -Destination $Target }; throw }
  Write-Host '[5/5] Creating application shortcuts...'
  $Wsh = New-Object -ComObject WScript.Shell
  foreach ($Dir in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))) {
    $Shortcut = $Wsh.CreateShortcut((Join-Path $Dir 'TubeSave.lnk'))
    $Shortcut.TargetPath = Join-Path $Target 'TubeSave.exe'
    $Shortcut.WorkingDirectory = $Target
    $Icon = Join-Path $Target 'resources\app\tubesave.ico'
    if (Test-Path -LiteralPath $Icon) { $Shortcut.IconLocation = $Icon }
    $Shortcut.Save()
  }
  Write-Host "Installed: $Target\TubeSave.exe"
  Start-Process -FilePath (Join-Path $Target 'TubeSave.exe') -WorkingDirectory $Target
} catch {
  [System.Windows.Forms.MessageBox]::Show($_.Exception.Message + "`n`nInstall log: $Logs\install.log", 'TubeSave setup failed', 'OK', 'Error') | Out-Null
  throw
} finally {
  if (Test-Path -LiteralPath $Stage) { Remove-Item -LiteralPath $Stage -Recurse -Force }
  Stop-Transcript | Out-Null
  $Mutex.ReleaseMutex(); $Mutex.Dispose()
}
