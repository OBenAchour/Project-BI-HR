param(
    [Parameter(Mandatory)] [int] $Port,
    [string] $Query,
    [string] $QueryFile,
    [switch] $NonQuery,
    [string] $Roles
)
# Connexion au moteur Analysis Services local de Power BI Desktop via MSOLAP.
if ($QueryFile) { $Query = [IO.File]::ReadAllText($QueryFile, [Text.Encoding]::UTF8) }
$cs = "Provider=MSOLAP;Data Source=localhost:$Port;"
if ($Roles) { $cs += "Roles=$Roles;" }
$cn = New-Object System.Data.OleDb.OleDbConnection $cs
$cn.Open()
try {
    if (-not $NonQuery) {
        $db = $cn.GetOleDbSchemaTable([System.Data.OleDb.OleDbSchemaGuid]::Catalogs, $null) | Select-Object -First 1
        $cn.ChangeDatabase($db.CATALOG_NAME)
    }
    $cmd = $cn.CreateCommand()
    $cmd.CommandText = $Query
    if ($NonQuery) {
        [void] $cmd.ExecuteNonQuery()
        'OK'
    } else {
        $da = New-Object System.Data.OleDb.OleDbDataAdapter $cmd
        $dt = New-Object System.Data.DataTable
        [void] $da.Fill($dt)
        $dt
    }
} finally { $cn.Close() }
