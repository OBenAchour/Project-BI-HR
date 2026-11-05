param(
    [Parameter(Mandatory)] [int] $Port,
    [Parameter(Mandatory)] [string] $TestsFile,   # JSON : [{ "id": "...", "roles": "DRH" ou "", "query": "EVALUATE ..." }]
    [Parameter(Mandatory)] [string] $OutFile      # JSON : [{ "id", "roles", "ok", "error", "ms", "rowCount", "columns", "rows" (50 premières) }]
)
# Exécute des requêtes DAX sur le modèle ouvert dans Power BI Desktop, une connexion par rôle (MSOLAP).
$ErrorActionPreference = 'Stop'
$tests = [IO.File]::ReadAllText($TestsFile, [Text.Encoding]::UTF8) | ConvertFrom-Json
$results = New-Object System.Collections.ArrayList
$cache = @{}
function Open-Cn([string] $roles) {
    $cs = "Provider=MSOLAP;Data Source=localhost:$Port;"
    if ($roles) { $cs += "Roles=$roles;" }
    $cn = New-Object System.Data.OleDb.OleDbConnection $cs
    $cn.Open()
    $db = $cn.GetOleDbSchemaTable([System.Data.OleDb.OleDbSchemaGuid]::Catalogs, $null) | Select-Object -First 1
    $cn.ChangeDatabase($db.CATALOG_NAME)
    return $cn
}
try {
    foreach ($t in $tests) {
        $key = [string]$t.roles
        if (-not $cache.ContainsKey($key)) { $cache[$key] = Open-Cn $key }
        $r = [ordered]@{ id = $t.id; roles = $key; ok = $true; error = $null; ms = 0; rowCount = 0; columns = @(); rows = @() }
        $sw = [Diagnostics.Stopwatch]::StartNew()
        try {
            $cmd = $cache[$key].CreateCommand()
            $cmd.CommandText = $t.query
            $da = New-Object System.Data.OleDb.OleDbDataAdapter $cmd
            $dt = New-Object System.Data.DataTable
            [void] $da.Fill($dt)
            $r.columns = @($dt.Columns | ForEach-Object { $_.ColumnName })
            $r.rowCount = $dt.Rows.Count
            $r.rows = @($dt.Rows | Select-Object -First 50 | ForEach-Object { $row = $_; ,@($dt.Columns | ForEach-Object { $v = $row[$_]; if ($v -is [DBNull]) { $null } else { [string]$v } }) })
        } catch {
            $r.ok = $false
            $r.error = $_.Exception.Message
        }
        $r.ms = $sw.ElapsedMilliseconds
        [void] $results.Add($r)
    }
} finally {
    foreach ($cn in $cache.Values) { $cn.Close() }
}
[IO.File]::WriteAllText($OutFile, (ConvertTo-Json -InputObject @($results) -Depth 6), (New-Object Text.UTF8Encoding $false))
"$($results.Count) requêtes, $(@($results | Where-Object { -not $_.ok }).Count) en erreur"
