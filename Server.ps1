# Server.ps1 v1.3 纯净无跨域
$port = 23333
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://127.0.0.1:$port/")

try { 
    $listener.Start() 
} catch { 
    Write-Host "Server failed to start. Port might be in use." -ForegroundColor Red
    exit 
}

$workerPath = Join-Path $PSScriptRoot "Worker.ps1"

Write-Host "MediaHunter Server is listening on port $port..." -ForegroundColor Green

while ($listener.IsListening) {
    try {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        # 只放行 POST 请求
        if ($request.HttpMethod -eq 'POST') {
            try {
                $reader = New-Object System.IO.StreamReader($request.InputStream, [System.Text.Encoding]::UTF8)
                $json = $reader.ReadToEnd()
                
                $base64Payload = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($json))
                
                $ArgumentList = @(
                    "-ExecutionPolicy", "Bypass",
                    "-WindowStyle", "Hidden",
                    "-File", $workerPath,
                    $base64Payload
                )
                
                # 静默唤起 Worker，脱离主进程阻塞
                Start-Process powershell.exe -ArgumentList $ArgumentList -WindowStyle Hidden
                
                $responseString = '{"status":"ok"}'
                $buffer = [System.Text.Encoding]::UTF8.GetBytes($responseString)
                
                $response.StatusCode = 200
                $response.ContentType = "application/json; charset=utf-8"
                $response.ContentLength64 = $buffer.Length
                $response.OutputStream.Write($buffer, 0, $buffer.Length)
            } catch {
                # 如果内部处理出错，返回 500
                $response.StatusCode = 500
            }
        } else {
            # 对于 OPTIONS 预检请求、GET 探测等恶意行为，直接返回 405 方法不允许
            $response.StatusCode = 405
        }
        
        $response.Close()
        
    } catch {
        # 捕捉极其罕见的客户端强行断开连接导致的底层流异常，防止主监听循环崩溃
    }
}