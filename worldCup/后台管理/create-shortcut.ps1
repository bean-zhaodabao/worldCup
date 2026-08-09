<#
.SYNOPSIS
  在桌面创建"世界杯彩票管理系统"快捷方式
.DESCRIPTION
  一键双击启动 Web 服务器并打开页面
.USAGE
  右键 → "使用 PowerShell 运行"
  或在 PowerShell 中: .\create-shortcut.ps1
#>

$ErrorActionPreference = "Stop"

# 脚本所在目录
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# 选择启动模式
Write-Host ""
Write-Host "  ╔══════════════════════════════════════════╗"
Write-Host "  ║   📌 创建桌面快捷方式                     ║"
Write-Host "  ╚══════════════════════════════════════════╝"
Write-Host ""
Write-Host "  选择启动模式:"
Write-Host "    [1] 生产模式 (start.bat) - 轻量，无需安装依赖"
Write-Host "    [2] 开发模式 (start-dev.bat) - 热更新 + API 代理 (推荐)"
Write-Host ""

$choice = Read-Host "  请输入 1 或 2 (默认 1)"

if ($choice -eq "2") {
    $BatFile = Join-Path $ScriptDir "start-dev.bat"
    $ModeName = "开发模式"
} else {
    $BatFile = Join-Path $ScriptDir "start.bat"
    $ModeName = "生产模式"
}

if (-not (Test-Path $BatFile)) {
    Write-Host ""
    Write-Host "  ❌ 找不到启动脚本: $BatFile"
    Read-Host "  按回车退出"
    exit 1
}

# 桌面路径
$DesktopPath = [Environment]::GetFolderPath("Desktop")
$ShortcutPath = Join-Path $DesktopPath "世界杯彩票管理系统.lnk"

# 创建快捷方式
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut($ShortcutPath)

$Shortcut.TargetPath = $BatFile
$Shortcut.WorkingDirectory = $ScriptDir
$Shortcut.Description = "世界杯彩票管理系统 - $ModeName"
$Shortcut.IconLocation = "shell32.dll,14"
$Shortcut.WindowStyle = 7  # 最小化窗口

$Shortcut.Save()

Write-Host ""
Write-Host "  ✅ 快捷方式已创建!"
Write-Host "  📍 位置: $ShortcutPath"
Write-Host "  🚀 双击桌面上的 ""世界杯彩票管理系统"" 即可启动"
Write-Host ""
Read-Host "  按回车退出"
