param(
    [int]$Port = 5173
)

$Directory = $PSScriptRoot
if (-not $Directory) { $Directory = (Get-Location).Path }

$listener = New-Object System.Net.HttpListener
$prefix = "http://localhost:$Port/"

try {
    $listener.Prefixes.Add($prefix)
    $listener.Start()
} catch {
    $Port = 8080
    $prefix = "http://localhost:$Port/"
    $listener = New-Object System.Net.HttpListener
    $listener.Prefixes.Add($prefix)
    $listener.Start()
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   UBIT ERP / GST Pro ERP - Local Engine Active" -ForegroundColor Green
Write-Host "   URL: $prefix" -ForegroundColor White
Write-Host "   Root Directory: $Directory" -ForegroundColor DarkGray
Write-Host "==========================================================" -ForegroundColor Cyan

Start-Process $prefix

while ($listener.IsListening) {
    try {
        $ctx = $listener.GetContext()
        $req = $ctx.Request
        $res = $ctx.Response

        $path = $req.Url.LocalPath.TrimStart('/')
        if ($path -eq '' -or $path -eq '/') { $path = 'index.html' }
        $path = $path -replace '\.\.', ''
        $file = Join-Path $Directory $path

        $res.AddHeader('Access-Control-Allow-Origin', '*')
        $res.AddHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        $res.AddHeader('Access-Control-Allow-Headers', 'Content-Type')
        $res.AddHeader('Cache-Control', 'no-cache')

        if ($req.HttpMethod -eq 'OPTIONS') {
            $res.StatusCode = 204
            $res.OutputStream.Close()
            continue
        }

        if (Test-Path $file -PathType Leaf) {
            $ext = [System.IO.Path]::GetExtension($file).ToLower()
            switch ($ext) {
                '.html' { $res.ContentType = 'text/html; charset=utf-8' }
                '.htm'  { $res.ContentType = 'text/html; charset=utf-8' }
                '.js'   { $res.ContentType = 'application/javascript; charset=utf-8' }
                '.mjs'  { $res.ContentType = 'application/javascript; charset=utf-8' }
                '.css'  { $res.ContentType = 'text/css; charset=utf-8' }
                '.json' { $res.ContentType = 'application/json; charset=utf-8' }
                '.svg'  { $res.ContentType = 'image/svg+xml' }
                '.png'  { $res.ContentType = 'image/png' }
                '.jpg'  { $res.ContentType = 'image/jpeg' }
                '.jpeg' { $res.ContentType = 'image/jpeg' }
                '.ico'  { $res.ContentType = 'image/x-icon' }
                '.webp' { $res.ContentType = 'image/webp' }
                '.woff2' { $res.ContentType = 'font/woff2' }
                '.woff' { $res.ContentType = 'font/woff' }
                default { $res.ContentType = 'application/octet-stream' }
            }
            $bytes = [System.IO.File]::ReadAllBytes($file)
            $res.ContentLength64 = $bytes.Length
            $res.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $spa = Join-Path $Directory 'index.html'
            if (Test-Path $spa) {
                $res.ContentType = 'text/html; charset=utf-8'
                $bytes = [System.IO.File]::ReadAllBytes($spa)
                $res.ContentLength64 = $bytes.Length
                $res.OutputStream.Write($bytes, 0, $bytes.Length)
            } else {
                $res.StatusCode = 404
            }
        }
        $res.OutputStream.Close()
    } catch {
        try { $ctx.Response.OutputStream.Close() } catch {}
    }
}
