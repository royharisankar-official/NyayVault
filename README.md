# Portable prototype

This prototype can be packaged with a self-contained Windows Python runtime,
so it does not rely on the drive letter or the developer's machine paths.

## Live website

**Open NyayVault:** [https://nyayvault.onrender.com](https://nyayvault.onrender.com)

### Quick start

1. Open the live website link above.
2. Register a new account on the first screen.
3. Sign in and open the dashboard.
4. Use **Document Vault** to upload records, **Ask NyAI** for source-based
   assistance, and **Audit & Integrity** to review the audit trail.
5. Use the **Verify chain** button to check the available audit history.

If you forget your password, choose **Forgot password?** on the sign-in screen.
This prototype generates a one-time reset token in the same browser because no
email provider is configured; complete the reset within 15 minutes.

API health check: [https://nyayvault.onrender.com/health](https://nyayvault.onrender.com/health)  
Interactive API documentation: [https://nyayvault.onrender.com/docs](https://nyayvault.onrender.com/docs)

> This is a demonstration deployment. Do not upload real confidential legal
> records. Render's default filesystem is ephemeral, so uploaded data may not
> persist across service replacement or redeployment.

## Recommended way to run on Windows

1. Copy the complete `Prototype 2` folder to the USB drive (do not copy only
   the `.bat` file).
2. Double-click **Launch Prototype.lnk**. It uses the Nyay Vault logo and requests administrator privileges so it can launch the local services correctly on Windows. If the shortcut is missing, run `scripts\create-launcher-shortcut.ps1` once, then use the shortcut.
3. Register a new account on the first screen, then sign in with that account.
4. Open `http://127.0.0.1:8000` if the browser does not open automatically.
5. Keep the command window open while demonstrating the prototype.

The launcher uses `portable-runtime\python.exe` first. If that package has not
been created yet, it tries the local `.venv`, then system Python, and finally
Docker. The application data is stored locally in the project folder or in
Docker volumes, so it does not depend on a database server on the host.

## Requirements on the demonstration computer

The recommended USB package requires:

- 64-bit Windows.
- No Python installation is required after building the portable package.

The browser only needs to support modern JavaScript. This package is for
Windows x64; macOS, Linux, ARM Windows, and 32-bit Windows require separate
runtimes.

## Build the self-contained Windows package

Run this once on your development computer from the project folder:

```powershell
PowerShell -ExecutionPolicy Bypass -File scripts\build-windows-portable.ps1
```

The script downloads portable CPython, installs everything in
`backend\requirements.txt`, and rebuilds the frontend when npm is available.
Copy the complete project folder, including `portable-runtime`, to the USB
drive. Do not copy only the `.bat` file or the shortcut.

## Requirements on the demonstration computer

1. Copy the complete project folder to the USB drive.
2. Double-click **Launch Prototype.lnk**.
3. Open `http://127.0.0.1:8000` if the browser does not open automatically.
4. Keep the command window open while demonstrating the prototype.

The demonstration computer does not need Python, Node.js, npm, or a database
server. The first package build needs internet access; the finished USB
package does not need internet access for the local prototype.

## Docker fallback

```powershell
docker compose up --build
```

Then browse to `http://127.0.0.1:8000`. Stop it with `Ctrl+C`, or run
`docker compose down` later.

## Deploy on Render

This repository includes a `render.yaml` Blueprint and a production Dockerfile.
In Render, choose **New > Blueprint**, connect the GitHub repository, and apply
the Blueprint. The image builds the Vite frontend inside Docker, so a local
`frontend\dist` folder is not required in Git. The service listens on Render's
`PORT` environment variable and uses `/health` for health checks.

The default SQLite database and uploaded files use the container filesystem.
They are suitable for a demo, but Render's filesystem is ephemeral; configure a
persistent disk or an external database/object store before production use.

This is a demonstration prototype. Replace default secrets and review data
protection before using it with real confidential documents.
