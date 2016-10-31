@IF EXIST "%~dp0\node.exe" (
    "%~dp0\node.exe" "..\bin\index" %*
) ELSE (
    node "..\bin\index" %*
)
