# deploy.ps1 - The Championship 2026  (v2)
#
# Uso tipico:
#   .\deploy.ps1 -Zip "C:\Users\Miguel\Downloads\championship_v206.zip"
#
# Otras opciones:
#   .\deploy.ps1                       -> solo versiona y publica lo que ya esta en la carpeta
#   .\deploy.ps1 -Zip ... -DryRun      -> muestra que haria, sin tocar nada
#   .\deploy.ps1 -Zip ... -Version 210 -> fuerza un numero de version

param(
    [string]$Zip = "",
    [int]$Version = 0,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$repo        = $PSScriptRoot
$indexPath   = Join-Path $repo "index.html"
$versionPath = Join-Path $repo "VERSION"

function Say($msg, $color = "Gray") { Write-Host $msg -ForegroundColor $color }

# ── 1. Descomprimir e instalar el ZIP (si se paso uno) ────────────────────
if ($Zip -ne "") {
    if (-not (Test-Path $Zip)) { throw "No existe el ZIP: $Zip" }

    $tmp = Join-Path $env:TEMP ("champ_" + [Guid]::NewGuid().ToString("N").Substring(0,8))
    New-Item -ItemType Directory -Path $tmp | Out-Null

    try {
        Say "Descomprimiendo $(Split-Path $Zip -Leaf)..."
        Expand-Archive -Path $Zip -DestinationPath $tmp -Force

        # El ZIP puede traer los archivos sueltos o dentro de una carpeta.
        # Buscamos donde esta el index.html y usamos esa carpeta como origen.
        $found = Get-ChildItem -Path $tmp -Filter "index.html" -Recurse -File | Select-Object -First 1
        if (-not $found) { throw "El ZIP no contiene ningun index.html." }
        $src = $found.Directory.FullName
        Say "  Origen detectado: $($found.Directory.Name)"

        $archivos = Get-ChildItem -Path $src -Force |
                    Where-Object { $_.Name -ne ".git" }

        if ($DryRun) {
            Say "[DryRun] Se copiarian $($archivos.Count) elementos a $repo" "Cyan"
            $archivos | ForEach-Object { Say "    $($_.Name)" }
        } else {
            foreach ($a in $archivos) {
                Copy-Item -Path $a.FullName -Destination $repo -Recurse -Force
            }
            Say "  Copiados $($archivos.Count) elementos a la raiz del repo." "Green"
        }
    }
    finally {
        Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
    }
}

if (-not (Test-Path $indexPath)) { throw "No se encontro index.html en $repo" }

# ── 2. Determinar el numero de version ────────────────────────────────────
if ($Version -gt 0) {
    $num = $Version
} elseif (Test-Path $versionPath) {
    $actual = (Get-Content $versionPath -Raw).Trim()
    if ($actual -notmatch '^\d+$') { throw "VERSION contiene '$actual', que no es un numero." }
    $num = [int]$actual + 1
} else {
    throw "No existe el archivo VERSION. Crealo con:  Set-Content VERSION 205"
}
$marca = "v$num"

# ── 3. Inyectar la marca en index.html (UTF-8 sin BOM) ────────────────────
$txt  = [System.IO.File]::ReadAllText($indexPath)
$rx   = [regex]'<!--\s*v\d+\s*-->'
$hits = $rx.Matches($txt).Count

if ($hits -eq 1) {
    $txt = $rx.Replace($txt, "<!-- $marca -->")
} elseif ($hits -eq 0) {
    if ($txt -match '^<!DOCTYPE html>\r?\n') {
        $txt = $txt -replace '^(<!DOCTYPE html>\r?\n)', "`$1<!-- $marca -->`r`n"
        Say "  Marcador ausente: se inserto despues del DOCTYPE." "Yellow"
    } else {
        throw "No hay marcador de version ni <!DOCTYPE html> al inicio. Revisalo a mano."
    }
} else {
    throw "Hay $hits marcadores de version en index.html. Dejalo en uno solo."
}

if ($DryRun) {
    Say "[DryRun] Version que se aplicaria: $marca" "Cyan"
    Say "[DryRun] No se escribio nada ni se hizo commit."
    exit 0
}

$utf8 = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($indexPath, $txt, $utf8)
[System.IO.File]::WriteAllText($versionPath, "$num`n", $utf8)

# ── 4. Verificar antes de commitear ───────────────────────────────────────
$check = (Get-Content $indexPath -TotalCount 3) -join " "
if ($check -notmatch [regex]::Escape("<!-- $marca -->")) {
    throw "La marca $marca no quedo escrita. Abortado antes de commitear."
}
Say ""
Say "Version:  $marca"
Say "SHA256:   $((Get-FileHash $indexPath -Algorithm SHA256).Hash)"
Say "Tamano:   $((Get-Item $indexPath).Length) bytes"
Say ""

# ── 5. Commit y push ──────────────────────────────────────────────────────
git add -A
git commit -m $marca
if ($LASTEXITCODE -ne 0) { throw "El commit fallo. Revisa 'git status'." }

git push origin main
if ($LASTEXITCODE -ne 0) {
    Say ""
    Say "El commit se creo bien, pero el push fallo (suele ser autenticacion)." "Yellow"
    Say "Abri GitHub Desktop y hace clic en 'Push origin'. NO vuelvas a correr este script." "Yellow"
    exit 1
}

Say ""
Say "Publicado $marca correctamente." "Green"
Say "En 2-3 minutos, verificalo con Ctrl+U en:"
Say "  https://miguelpelzel.github.io/thechampionship2026/?v=$num"
