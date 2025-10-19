# Building Windows Executable for Fiber Splice Manager

## Prerequisites
- Windows computer
- Node.js installed (v18 or higher recommended)

## Steps to Build

### 1. Download the Project
Download all project files to your Windows computer and extract to a folder (e.g., `C:\FiberMapConnect`).

### 2. Install Dependencies
Open Command Prompt or PowerShell in the project folder and run:
```powershell
npm install
```

Wait for all packages to install (this may take several minutes).

### 3. Rebuild Native Modules for Windows
The SQLite database module needs to be rebuilt for your Windows system:
```powershell
npm rebuild better-sqlite3
```

### 4. Modify package.json
You need to make these changes to `package.json`:

**Add these fields after the "license" line:**
```json
"main": "electron-main.cjs",
"description": "Fiber Optic Cable Splicing Management Application",
"author": "Your Name",
```

**Move electron packages:**
In package.json, move `"electron"` and `"electron-builder"` from `"dependencies"` to `"devDependencies"`.

**Add scripts:** Add these to the "scripts" section:
```json
"electron": "electron .",
"electron:build": "npm run build && electron-builder --win --x64"
```

### 5. Build the Frontend and Backend
**IMPORTANT:** You MUST build the application before packaging with Electron:
```powershell
npm run build
```

This creates the `dist` folder with:
- `dist/public/` - Built frontend (HTML, CSS, JS)
- `dist/index.js` - Built backend server

Verify the build succeeded by checking that both exist.

### 6. Test Locally (Optional but Recommended)
Before packaging, test the built app:
```powershell
node dist/index.js
```

Then open your browser to `http://localhost:5000`

Press `Ctrl+C` to stop the server when done testing.

### 7. Package as Windows Executable
Now build the Electron app:
```powershell
npm run electron:build
```

This will:
- Package the app with Electron
- Include the built `dist` folder
- Create a Windows installer in the `release` folder

### 8. Find Your Executable
The Windows executable will be created in the `release` folder:
- **Installer**: `release/Fiber Splice Manager Setup 1.0.0.exe`
- **Unpacked**: `release/win-unpacked/Fiber Splice Manager.exe`

You can run the unpacked version directly or install using the setup file.

## Running the Application

### As Desktop App (.exe)
Double-click the executable. The app will:
1. Start the backend server automatically (in background)
2. Open the application window
3. All data saved to local SQLite database (`fiber-splice.db`)

### As Web Server (Alternative)
If you prefer to run it as a web server:
```powershell
node dist/index.js
```
Then open browser to `http://localhost:5000`

## Troubleshooting

### Error: "vite is not recognized"
You forgot to run `npm install`. Go back to Step 2.

### Error: "NODE_ENV is not recognized"
Use this command instead:
```powershell
$env:NODE_ENV="production"; node dist/index.js
```

Or just run:
```powershell
node dist/index.js
```

### Error: "better-sqlite3 module version mismatch"
Run:
```powershell
npm rebuild better-sqlite3
```

### Error: "electron is only allowed in devDependencies"
Make sure you moved electron and electron-builder to devDependencies as described in step 4.

### Error: "Pre-transform error" or "Failed to load url"
The `dist/public` folder is missing. Run `npm run build` again and verify it succeeds.

### Build takes a long time
The first build downloads Electron (~125 MB) and rebuilds native modules. Subsequent builds are faster.

### App window opens but shows error
Make sure you ran `npm run build` BEFORE `npm run electron:build`. The Electron package needs the built files in `dist/`.
