@IF EXIST "%~dp0\node.exe" (
    "%~dp0\node.exe" "%~dp0\..\bin\biddle" %*
) ELSE (
    node "%~dp0\..\bin\biddle" %*
)
