# Break popup: topmost dark window, button unlocks after 10 s.
param([int]$Index = 0, [string]$Sound = "")

Add-Type -AssemblyName System.Windows.Forms, System.Drawing

$lines = @(
  "Too much work, no play. Step away for a while.",
  "The hotel can wait. Stand up and stretch.",
  "Even the gunslinger rests by the fire. Drink some water.",
  "Go outside. The mist is lifting.",
  "Close the door. Rest your eyes. The story will keep.",
  "Ka can wait ten minutes. Take a walk."
)
$line = $lines[$Index % $lines.Count]

# Muted palette.
$rose = [System.Drawing.Color]::FromArgb(201, 130, 130)
$gold = [System.Drawing.Color]::FromArgb(201, 178, 122)
$soft = [System.Drawing.Color]::FromArgb(208, 208, 214)
$dim = [System.Drawing.Color]::FromArgb(130, 132, 140)
$form = New-Object System.Windows.Forms.Form
$form.Text = "Constant Reader"
$form.Size = New-Object System.Drawing.Size(560, 340)
$form.StartPosition = "CenterScreen"
$form.FormBorderStyle = "FixedDialog"
$form.ControlBox = $false
$form.TopMost = $true
$form.BackColor = [System.Drawing.Color]::FromArgb(34, 31, 29)

$drop = New-Object System.Windows.Forms.Label
$drop.Text = [char]0x25CF
$drop.Font = New-Object System.Drawing.Font("Segoe UI", 40)
$drop.ForeColor = $rose
$drop.AutoSize = $false
$drop.TextAlign = "MiddleCenter"
$drop.SetBounds(0, 10, 560, 80)
$form.Controls.Add($drop)

$title = New-Object System.Windows.Forms.Label
$title.Text = "ALL WORK AND NO PLAY"
$title.Font = New-Object System.Drawing.Font("Courier New", 20, [System.Drawing.FontStyle]::Bold)
$title.ForeColor = $gold
$title.AutoSize = $false
$title.TextAlign = "MiddleCenter"
$title.SetBounds(0, 90, 560, 45)
$form.Controls.Add($title)

$text = New-Object System.Windows.Forms.Label
$text.Text = $line
$text.Font = New-Object System.Drawing.Font("Segoe UI", 13)
$text.ForeColor = $soft
$text.AutoSize = $false
$text.TextAlign = "MiddleCenter"
$text.SetBounds(20, 140, 520, 70)
$form.Controls.Add($text)

$btn = New-Object System.Windows.Forms.Button
$btn.Font = New-Object System.Drawing.Font("Consolas", 12)
$btn.ForeColor = $dim
$btn.BackColor = [System.Drawing.Color]::FromArgb(44, 46, 53)
$btn.FlatStyle = "Flat"
$btn.FlatAppearance.BorderColor = [System.Drawing.Color]::FromArgb(70, 72, 80)
$btn.SetBounds(180, 230, 200, 44)
$script:ready = $false
$btn.Add_Click({ if ($script:ready) { $form.Close() } })
$form.Controls.Add($btn)

$left = 10
$btn.Text = "Wait $left s"
$tick = New-Object System.Windows.Forms.Timer
$tick.Interval = 1000
$tick.Add_Tick({
  $script:left--
  if ($script:left -le 0) {
    $tick.Stop(); $script:ready = $true; $btn.ForeColor = $soft; $btn.FlatAppearance.BorderColor = $rose; $btn.Text = "Back to work"; $btn.Focus()
  } else { $btn.Text = "Wait $($script:left) s" }
})
$form.Add_Shown({
  $form.Activate(); $tick.Start()
  if ($Sound -and (Test-Path $Sound)) { (New-Object Media.SoundPlayer $Sound).Play() }
})
[void]$form.ShowDialog()
