<#
.SYNOPSIS
  Send text to Lens AI from PowerShell and (optionally) wait for the answer.

.EXAMPLE
  Get-Content notes.txt | .\lens-ask.ps1 -Do summarize -Variant key_points -Wait 120
.EXAMPLE
  "Ceci n'est pas une pipe" | .\lens-ask.ps1 -Do translate -Lang English -Wait 60
.EXAMPLE
  git diff | .\lens-ask.ps1 -Prompt "Write a commit message for this diff" -Local -Wait 90

.NOTES
  Lens must be running with Settings › Connections › bridge enabled (on by default).
  The request shows up in Lens; unless a local model is allowed to answer directly, you confirm
  it there first, then the answer prints here. Nothing is sent anywhere until you confirm.
  Exit codes: 0 ok, 1 refused/failed, 2 Lens isn't running.
#>
[CmdletBinding()]
param(
  [Parameter(ValueFromPipeline = $true)] [string[]] $InputText,
  [ValidateSet("ask", "summarize", "explain", "translate", "rewrite", "fix_grammar", "extract")]
  [string] $Do = "ask",
  [string] $Prompt,
  [string] $Variant,
  [string] $Lang,
  [int] $Wait = 0,
  [switch] $Local,
  [string] $LensExe
)
begin { $lines = New-Object System.Collections.Generic.List[string] }
process { foreach ($l in $InputText) { $lines.Add($l) } }
end {
  if (-not $LensExe) {
    $candidates = @(
      "$env:LOCALAPPDATA\Lens UI\lens-ui.exe",
      "$env:ProgramFiles\Lens UI\lens-ui.exe",
      (Get-Command lens-ui.exe -ErrorAction SilentlyContinue).Source
    ) | Where-Object { $_ -and (Test-Path $_) }
    $LensExe = $candidates | Select-Object -First 1
  }
  if (-not $LensExe) { Write-Error "Couldn't find lens-ui.exe; pass -LensExe."; exit 1 }

  $argsList = @("--ask", "-", "--do", $Do)
  if ($Prompt)  { $argsList += @("--prompt", $Prompt) }
  if ($Variant) { $argsList += @("--variant", $Variant) }
  if ($Lang)    { $argsList += @("--lang", $Lang) }
  if ($Wait -gt 0) { $argsList += @("--wait", "$Wait") }
  if ($Local)   { $argsList += "--local" }

  # Pass text through a temp file + stdin redirect so nothing lands in the command line or history.
  $tmp = [System.IO.Path]::GetTempFileName()
  try {
    [System.IO.File]::WriteAllText($tmp, ($lines -join "`n"), (New-Object System.Text.UTF8Encoding($false)))
    $p = Start-Process -FilePath $LensExe -ArgumentList $argsList -RedirectStandardInput $tmp `
      -RedirectStandardOutput "$tmp.out" -RedirectStandardError "$tmp.err" -NoNewWindow -Wait -PassThru
    if (Test-Path "$tmp.out") { Get-Content "$tmp.out" -Encoding UTF8 }
    if ($p.ExitCode -ne 0 -and (Test-Path "$tmp.err")) { Get-Content "$tmp.err" -Encoding UTF8 | Write-Warning }
    exit $p.ExitCode
  } finally {
    Remove-Item $tmp, "$tmp.out", "$tmp.err" -ErrorAction SilentlyContinue
  }
}
