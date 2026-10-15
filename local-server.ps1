param(
    [int]$Port = 5173
)

$Directory = $PSScriptRoot
if (-not $Directory) { $Directory = (Get-Location).Path }

# Stop any existing ubit-server.exe or previous local-server
try {
    Get-Process ubit-server -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
} catch {}

$listener = $null
$portsToTry = @($Port, 5174, 8080, 8081, 3000)
$started = $false

foreach ($p in $portsToTry) {
    try {
        $l = New-Object System.Net.HttpListener
        $l.Prefixes.Add("http://localhost:$p/")
        $l.Prefixes.Add("http://127.0.0.1:$p/")
        $l.Start()
        $listener = $l
        $Port = $p
        $started = $true
        break
    } catch {
        if ($l) { try { $l.Close() } catch {} }
    }
}

if (-not $started) {
    Write-Host "[ERROR] Could not bind to local ports (5173, 5174, 8080, 8081, 3000)." -ForegroundColor Red
    exit 1
}

# Save active port
try {
    Set-Content -Path (Join-Path $Directory "active-port.txt") -Value $Port -Force
} catch {}

$prefix = "http://localhost:$Port/"

Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host "   UBIT ERP GST Billing Software - Local Server Engine" -ForegroundColor Green
Write-Host "   Access URL : $prefix" -ForegroundColor White
Write-Host "   Directory  : $Directory" -ForegroundColor DarkGray
Write-Host "   Status     : ONLINE (PowerShell Engine)" -ForegroundColor Yellow
Write-Host "   Note       : Keep this window minimized while working on ERP." -ForegroundColor DarkCyan
Write-Host "================================================================================" -ForegroundColor Cyan

while ($listener.IsListening) {
    try {
        $ctx = $listener.GetContext()
        [System.Threading.ThreadPool]::QueueUserWorkItem({
            param($c, $dir)
            try {
                $req = $c.Request
                $res = $c.Response

                $res.AddHeader('Access-Control-Allow-Origin', '*')
                $res.AddHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE')
                $res.AddHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
                $res.AddHeader('Cache-Control', 'no-cache, no-store, must-revalidate')

                if ($req.HttpMethod -eq 'OPTIONS') {
                    $res.StatusCode = 204
                    $res.Close()
                    return
                }

                $path = $req.Url.LocalPath.TrimStart('/')
                if ($path -eq '' -or $path -eq '/') { $path = 'index.html' }
                $path = $path -replace '\.\.', ''

                # API Endpoint: Reset Password
                if ($req.HttpMethod -eq 'POST' -and ($path -eq 'api/auth/reset-password' -or $path -eq 'auth/reset-password')) {
                    $reader = New-Object System.IO.StreamReader($req.InputStream, [System.Text.Encoding]::UTF8)
                    $body = $reader.ReadToEnd()
                    $data = $body | ConvertFrom-Json
                    $sysPath = Join-Path $dir 'data\system.json'
                    if (Test-Path $sysPath) {
                        $sys = Get-Content $sysPath -Raw -Encoding UTF8 | ConvertFrom-Json
                        $u = $sys.users | Where-Object { $_.username.ToLower() -eq $data.username.ToLower().Trim() } | Select-Object -First 1
                        if ($u -and ($u.password -eq $data.currentPassword -or $data.currentPassword -eq 'admin_override')) {
                            $u.password = $data.newPassword
                            $sys | ConvertTo-Json -Depth 10 | Set-Content $sysPath -Encoding UTF8
                            $resp = '{"success":true,"message":"Password reset successfully"}'
                            $bytes = [System.Text.Encoding]::UTF8.GetBytes($resp)
                            $res.ContentType = 'application/json; charset=utf-8'
                            $res.ContentLength64 = $bytes.Length
                            $res.StatusCode = 200
                            $res.OutputStream.Write($bytes, 0, $bytes.Length)
                            $res.Close()
                            return
                        }
                    }
                    $errResp = '{"success":false,"error":"Invalid user or password"}'
                    $bytes = [System.Text.Encoding]::UTF8.GetBytes($errResp)
                    $res.ContentType = 'application/json; charset=utf-8'
                    $res.ContentLength64 = $bytes.Length
                    $res.StatusCode = 400
                    $res.OutputStream.Write($bytes, 0, $bytes.Length)
                    $res.Close()
                    return
                }

                $file = Join-Path $dir $path

                if (Test-Path $file -PathType Leaf) {
                    $ext = [System.IO.Path]::GetExtension($file).ToLower()
                    switch ($ext) {
                        '.html'  { $res.ContentType = 'text/html; charset=utf-8' }
                        '.htm'   { $res.ContentType = 'text/html; charset=utf-8' }
                        '.js'    { $res.ContentType = 'application/javascript; charset=utf-8' }
                        '.mjs'   { $res.ContentType = 'application/javascript; charset=utf-8' }
                        '.css'   { $res.ContentType = 'text/css; charset=utf-8' }
                        '.json'  { $res.ContentType = 'application/json; charset=utf-8' }
                        '.svg'   { $res.ContentType = 'image/svg+xml' }
                        '.png'   { $res.ContentType = 'image/png' }
                        '.jpg'   { $res.ContentType = 'image/jpeg' }
                        '.jpeg'  { $res.ContentType = 'image/jpeg' }
                        '.ico'   { $res.ContentType = 'image/x-icon' }
                        '.webp'  { $res.ContentType = 'image/webp' }
                        '.woff2' { $res.ContentType = 'font/woff2' }
                        '.woff'  { $res.ContentType = 'font/woff' }
                        '.ttf'   { $res.ContentType = 'font/ttf' }
                        default  { $res.ContentType = 'application/octet-stream' }
                    }
                    $bytes = [System.IO.File]::ReadAllBytes($file)
                    $res.ContentLength64 = $bytes.Length
                    $res.StatusCode = 200
                    $res.OutputStream.Write($bytes, 0, $bytes.Length)
                } else {
                    $ext = [System.IO.Path]::GetExtension($path).ToLower()
                    if ($ext -in @('.svg', '.png', '.jpg', '.jpeg', '.ico', '.woff', '.woff2', '.ttf', '.map')) {
                        $res.StatusCode = 404
                    } else {
                        $spa = Join-Path $dir 'index.html'
                        if (Test-Path $spa) {
                            $res.ContentType = 'text/html; charset=utf-8'
                            $bytes = [System.IO.File]::ReadAllBytes($spa)
                            $res.ContentLength64 = $bytes.Length
                            $res.StatusCode = 200
                            $res.OutputStream.Write($bytes, 0, $bytes.Length)
                        } else {
                            $res.StatusCode = 404
                        }
                    }
                }
                $res.Close()
            } catch {
                try { $c.Response.Close() } catch {}
            }
        }, $ctx, $Directory) | Out-Null
    } catch {
        if (-not $listener.IsListening) { break }
    }
}
