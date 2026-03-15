# Worker.ps1
# Version: 1.9.17 纯PS反射 + OOM防溢出 + 参数防注入 + 独立并发日志 + logs子目录归档清理

$logPath = Join-Path $PSScriptRoot "worker_debug.log"

# 函数：解码 Base64 为纯中文
function Decode-B64String($b64) {
    return [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b64))
}

# 函数：系统原生通知发送引擎
function Send-NativeToast {
    param(
        [string]$Id,
        [string[]]$Texts,
        [string]$Icon,
        [string]$ProgressStatus,
        [double]$ProgressValue = -1.0,
        [switch]$Silent,
        [switch]$SuppressPopup,
        [datetime]$Timestamp,
        [int]$ExpireHours = 0
    )

    try {
        [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
        [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom, ContentType = WindowsRuntime] | Out-Null

        $xmlString = "<toast"
        if ($Timestamp.Ticks -gt 0) {
            $isoTime = $Timestamp.ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
            $xmlString += " displayTimestamp=`"$isoTime`""
        }
        $xmlString += "><visual><binding template=`"ToastGeneric`">"

        foreach ($text in $Texts) {
            if ($Texts.Count -ge 2) {
                $statusText = [System.Security.SecurityElement]::Escape($Texts[0])
                $titleText = [System.Security.SecurityElement]::Escape($Texts[1])

                $xmlString += "<text hint-maxLines=`"1`" hint-wrap=`"false`">$statusText</text>"
                $xmlString += "<text hint-maxLines=`"1`" hint-wrap=`"true`">$titleText</text>"
            } elseif ($Texts.Count -eq 1) {
                $safeText = [System.Security.SecurityElement]::Escape($Texts[0])
                $xmlString += "<text hint-maxLines=`"1`" hint-wrap=`"false`">$safeText</text>"
            }
        }

        if ([System.IO.File]::Exists($Icon)) {
            $safeIcon = [System.Security.SecurityElement]::Escape("file:///" + $Icon.Replace('\', '/'))
            $xmlString += "<image placement=`"appLogoOverride`" src=`"$safeIcon`" />"
        }

        if ($ProgressValue -ge 0) {
            $xmlString += "<progress status=`"{progressStatus}`" value=`"{progressValue}`" />"
        }

        $xmlString += "</binding></visual>"

        if ($Silent) {
            $xmlString += "<audio silent=`"true`"/>"
        }
        $xmlString += "</toast>"

        $xmlDoc = New-Object Windows.Data.Xml.Dom.XmlDocument
        $xmlDoc.LoadXml($xmlString)

        $toast = [Windows.UI.Notifications.ToastNotification]::new($xmlDoc)
        
        if ($ExpireHours -gt 0) {
            $toast.ExpirationTime = [System.DateTimeOffset]::Now.AddHours($ExpireHours)
        }
        
        if ($ProgressValue -ge 0) {
            $toastData = [Windows.UI.Notifications.NotificationData]::new()
            $valStr = $ProgressValue.ToString("0.00", [System.Globalization.CultureInfo]::InvariantCulture)
            
            $dictType = [System.Collections.Generic.IDictionary[string, string]]
            $indexer = $dictType.GetProperty("Item")
            
            $indexer.SetValue($toastData.Values, $valStr, [object[]]@("progressValue"))
            $indexer.SetValue($toastData.Values, $ProgressStatus, [object[]]@("progressStatus"))
            
            $toastData.SequenceNumber = 0
            $toast.Data = $toastData
        }

        if (![string]::IsNullOrEmpty($Id)) {
            $toast.Tag = $Id.Substring(0, [math]::Min($Id.Length, 64))
            $toast.Group = "MediaHunter"
        }
        if ($SuppressPopup) {
            $toast.SuppressPopup = $true
        }

        $appId = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe'
        $notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($appId)
        $notifier.Show($toast)
    } catch {}
}

function Update-NativeToastProgress {
    param([string]$Id, [string]$Status, [double]$Percent)
    try {
        [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
        $data = [Windows.UI.Notifications.NotificationData]::new()
        
        $valStr = $Percent.ToString("0.00", [System.Globalization.CultureInfo]::InvariantCulture)
        
        $dictType = [System.Collections.Generic.IDictionary[string, string]]
        $indexer = $dictType.GetProperty("Item")
        
        $indexer.SetValue($data.Values, $valStr, [object[]]@("progressValue"))
        $indexer.SetValue($data.Values, $Status, [object[]]@("progressStatus"))
        
        $data.SequenceNumber = 0
        
        $appId = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe'
        $notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($appId)
        $safeTag = if (![string]::IsNullOrEmpty($Id)) { $Id.Substring(0, [math]::Min($Id.Length, 64)) } else { "" }
        
        [void]$notifier.Update($data, $safeTag, "MediaHunter")
    } catch {}
}

$strSuccess = Decode-B64String "5LiL6L295a6M5oiQ" # 下载完成
$strFail    = Decode-B64String "5LiL6L295aSx6LSl" # 下载失败
$strStatus  = Decode-B64String "5LiL6L295LitLi4u" # 下载中

$strLogHeader = Decode-B64String "PT09IHl0LWRscCDltKnmuoPml6Xlv5cgWw=="
$strLogCmd    = Decode-B64String "5omn6KGM5ZG95LukOiA="
$strLogCode   = Decode-B64String "6YCA5Ye65Luj56CBOiA="
$strLogOut    = Decode-B64String "LS0tIOagh+WHhui+k+WHuiAoc3Rkb3V0KSAtLS0="
$strLogErr    = Decode-B64String "LS0tIOmUmeivr+i+k+WHuiAoc3RkZXJyKSAtLS0="

$iconPath = Join-Path $PSScriptRoot "icon.png"

try {
    $base64Payload = $args[0]
    if ([string]::IsNullOrWhiteSpace($base64Payload)) { exit }

    $jsonString = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($base64Payload))
    $task = $jsonString | ConvertFrom-Json
    
    $dangerousArgs = @("--exec", "--postprocessor-args", "--config-location", "--cookies-from-browser", "--netrc")
    foreach ($badArg in $dangerousArgs) {
        if ($task.cmdArgs -match "(?i)\s$badArg\b") {
            exit 
        }
    }

    $title = $task.title
    $cmdArgs = $task.cmdArgs + " --newline --no-colors"
    
    $displayTitle = $title

    $global:toastId = "mh_dl_$([guid]::NewGuid().ToString().Substring(0,8))"
    $global:startTime = Get-Date
    
    try {
        Send-NativeToast -Id $global:toastId -Texts @($strStatus, $displayTitle) -Icon $iconPath -ProgressStatus "$strStatus 0%" -ProgressValue 0.0 -Timestamp $global:startTime -Silent -SuppressPopup
    } catch {}

    $pinfo = New-Object System.Diagnostics.ProcessStartInfo
    $pinfo.FileName = "yt-dlp"
    $pinfo.Arguments = $cmdArgs
    $pinfo.UseShellExecute = $false
    $pinfo.CreateNoWindow = $true
    
    $pinfo.EnvironmentVariables["PYTHONIOENCODING"] = "utf-8"
    $pinfo.EnvironmentVariables["PYTHONUTF8"] = "1"
    
    $pinfo.RedirectStandardOutput = $true
    $pinfo.RedirectStandardError = $true
    
    $pinfo.StandardOutputEncoding = [System.Text.Encoding]::Default
    $pinfo.StandardErrorEncoding = [System.Text.Encoding]::Default

    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $pinfo

    try {
        [System.Console]::OutputEncoding = [System.Text.Encoding]::UTF8
        [System.Console]::InputEncoding = [System.Text.Encoding]::UTF8
    } catch {}

    $global:stdoutQueue = New-Object System.Collections.Generic.Queue[string]
    $global:stderrQueue = New-Object System.Collections.Generic.Queue[string]
    $global:MAX_LOG_LINES = 500
    
    $global:currentProgress = -1.0 

    $ActionOut = {
        $line = $EventArgs.Data
        if (![string]::IsNullOrEmpty($line)) {
            $global:stdoutQueue.Enqueue($line)
            if ($global:stdoutQueue.Count -gt $global:MAX_LOG_LINES) {
                [void]$global:stdoutQueue.Dequeue()
            }
            
            if ($line.StartsWith("[download]") -and $line.Contains("%")) {
                if ($line -match '\[download\]\s+([\d\.]+)%') {
                    $global:currentProgress = [float]$matches[1]
                }
            }
        }
    }
    
    $ActionErr = {
        $line = $EventArgs.Data
        if (![string]::IsNullOrEmpty($line)) {
            $global:stderrQueue.Enqueue($line)
            if ($global:stderrQueue.Count -gt $global:MAX_LOG_LINES) {
                [void]$global:stderrQueue.Dequeue()
            }
            
            if ($line.StartsWith("[download]") -and $line.Contains("%")) {
                if ($line -match '\[download\]\s+([\d\.]+)%') {
                    $global:currentProgress = [float]$matches[1]
                }
            }
        }
    }

    $outEvent = Register-ObjectEvent -InputObject $process -EventName 'OutputDataReceived' -Action $ActionOut
    $errEvent = Register-ObjectEvent -InputObject $process -EventName 'ErrorDataReceived' -Action $ActionErr

    $process.Start() | Out-Null
    $process.BeginOutputReadLine()
    $process.BeginErrorReadLine()
    
    $lastUpdate = (Get-Date).AddSeconds(-2)
    $lastPercent = -1.0

    while (-not $process.HasExited) {
        Start-Sleep -Milliseconds 200
        $p = $global:currentProgress
        $now = Get-Date
        
        if ($p -ge 0 -and $p -ne $lastPercent -and ($now - $lastUpdate).TotalSeconds -ge 1) {
            $lastPercent = $p
            $lastUpdate = $now
            $percent = [math]::Round($p / 100, 2)
            
            try {
                Update-NativeToastProgress -Id $global:toastId -Status "$strStatus $p%" -Percent $percent
            } catch {}
        }
    }
    
    $exitCode = $process.ExitCode

    Unregister-Event -SourceIdentifier $outEvent.Name
    Unregister-Event -SourceIdentifier $errEvent.Name
    
    $stdout = $global:stdoutQueue -join "`r`n"
    $stderr = $global:stderrQueue -join "`r`n"

    if ($exitCode -eq 0) {
        try { 
            Send-NativeToast -Id $global:toastId -Texts @($strSuccess, $displayTitle) -Icon $iconPath -ExpireHours 6
        } catch {}
    } else {
        # 【V1.9.17 核心优化】：将日志统一放进独立的 logs 子文件夹，并自动清理
        $logDir = Join-Path $PSScriptRoot "logs"
        
        # 如果 logs 文件夹不存在，则静默创建
        if (-not (Test-Path -Path $logDir)) {
            New-Item -ItemType Directory -Path $logDir -Force -ErrorAction SilentlyContinue | Out-Null
        }

        $timestampStr = (Get-Date).ToString('yyyyMMdd_HHmmss')
        # 路径指向 logs 子目录
        $errorLogPath = Join-Path $logDir "yt-dlp_error_${timestampStr}_$($global:toastId).log"
        
        $logContent = "$strLogHeader$((Get-Date).ToString('yyyy-MM-dd HH:mm:ss'))] ===`r`n"
        $logContent += "$strLogCmd yt-dlp $cmdArgs`r`n"
        $logContent += "$strLogCode $exitCode`r`n`r`n"
        $logContent += "$strLogOut`r`n$stdout`r`n"
        $logContent += "$strLogErr`r`n$stderr`r`n"
        
        try {
            # 写入独立日志到 logs 文件夹
            [System.IO.File]::WriteAllText($errorLogPath, $logContent, [System.Text.Encoding]::UTF8)
            
            # 扫描 logs 文件夹，静默清理多余旧日志（只保留最近 9 个）
            $logFiles = Get-ChildItem -Path $logDir -Filter "yt-dlp_error_*.log" | Sort-Object LastWriteTime -Descending
            if ($logFiles.Count -gt 9) {
                $logFiles | Select-Object -Skip 9 | Remove-Item -Force -ErrorAction SilentlyContinue
            }
        } catch {}
        
        try { 
            Send-NativeToast -Id $global:toastId -Texts @($strFail, $displayTitle) -Icon $iconPath -ExpireHours 6
        } catch {}
    }

} catch {}