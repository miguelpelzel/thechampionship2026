# deploy.ps1 - The Championship 2026
# Incrementa la version, la inyecta en index.html, commitea y pushea.
#
# Uso:
#   .\deploy.ps1              -> incrementa la version automaticamente
#   .\deploy.ps1 -Version 210 -> fuerza una version especifica
#   .\deploy.ps1 -DryRun      -> solo muestra que haria, sin commitear

param(
    [int]$Version = 0,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$indexPath   = Join-Path $PSScriptRoot "index.html"
$versionPath = Join-Path $PSScriptRoot "VERSION"

if (-not (Test-Path $indexPath)) {
    throw "No se encontro index.html en $PSScriptRoot"
}

# --- 1. Determinar el numero de version ---
if ($Version -gt 0) {
    $num = $Version
} elseif (Test-Path $versionPath) {
    $actual = (Get-Content $versionPath -Raw).Trim()
    if ($actual -notmatch '^\d+$') {
        throw "El archivo VERSION contiene '$actual', que no es un numero."
    }
    $num = [int]$actual + 1
} else {
    throw "No existe el archivo VERSION. Crealo con el numero actual, por ejemplo:`n  Set-Content VERSION 203"
}

$marca = "v$num"

# --- 2. Inyectar la marca en index.html (UTF-8 sin BOM) ---
$txt = [System.IO.File]::ReadAllText($indexPath)
$rx  = [regex]'<!--\s*v\d+\s*-->'
$hits = $rx.Matches($txt).Count

if ($hits -eq 1) {
    $txt = $rx.Replace($txt, "<!-- $marca -->")
} elseif ($hits -eq 0) {
    # No hay marcador: lo insertamos justo despues del DOCTYPE
    if ($txt -match '^<!DOCTYPE html>\r?\n') {
        $txt = $txt -replace '^(<!DOCTYPE html>\r?\n)', "`$1<!-- $marca -->`r`n"
        Write-Host "Marcador ausente: se inserto despues del DOCTYPE." -ForegroundColor Yellow
    } else {
        throw "No hay marcador de version y tampoco un <!DOCTYPE html> al inicio. Revisalo a mano."
    }
} else {
    throw "Se encontraron $hits marcadores de version en index.html. Dejalo en uno solo y volve a correr."
}

if ($DryRun) {
    Write-Host "[DryRun] Version que se aplicaria: $marca" -ForegroundColor Cyan
    Write-Host "[DryRun] No se escribio ningun archivo ni se hizo commit."
    exit 0
}

$utf8SinBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($indexPath, $txt, $utf8SinBom)
[System.IO.File]::WriteAllText($versionPath, "$num`n", $utf8SinBom)

# --- 3. Verificar que quedo bien ---
$check = (Get-Content $indexPath -TotalCount 3) -join " "
if ($check -notmatch [regex]::Escape("<!-- $marca -->")) {
    throw "La marca $marca no aparece en las primeras lineas de index.html. Abortado antes de commitear."
}

$hash = (Get-FileHash $indexPath -Algorithm SHA256).Hash
Write-Host "Version aplicada: $marca"
Write-Host "SHA256: $hash"

# --- 4. Commit y push ---
git add -A
git commit -m $marca
if ($LASTEXITCODE -ne 0) {
    throw "El commit fallo. Revisa 'git status'."
}

git push origin main
if ($LASTEXITCODE -ne 0) {
    throw "El push fallo. Revisa la conexion o las credenciales."
}

Write-Host ""
Write-Host "Publicado $marca correctamente." -ForegroundColor Green
Write-Host "Verificalo en 2-3 minutos:"
Write-Host "  https://miguelpelzel.github.io/thechampionship2026/?v=$num"
