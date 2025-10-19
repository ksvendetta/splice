# Building Fiber Splice Manager as Windows .exe

## ✅ What's Already Done

Your app now has:
1. **SQLite persistent storage** - Data saves to `fiber-splice.db` file
2. **Electron wrapper** - Desktop app framework configured
3. **Build configuration** - Ready to package as .exe

## 📦 How to Build the Windows Installer

### Step 1: Add Electron Scripts to package.json

Manually add these scripts to your `package.json`:

```json
"scripts": {
  "dev": "NODE_ENV=development tsx server/index.ts",
  "build": "vite build && esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist",
  "start": "NODE_ENV=production node dist/index.js",
  "check": "tsc",
  "db:push": "drizzle-kit push",
  "electron:dev": "electron .",
  "electron:build": "npm run build && electron-builder",
  "electron:build:win": "npm run build && electron-builder --win"
}
```

Also add:
```json
"main": "electron-main.cjs",
"description": "Fiber Optic Cable Splicing Management Application",
```

### Step 2: Build the Frontend and Backend

```bash
npm run build
```

This creates:
- `client/dist/` - Built React app
- `dist/index.js` - Bundled Express server

### Step 3: Test Electron Locally

```bash
npm run electron:dev
```

This opens your app in an Electron window. Data persists in `fiber-splice.db`.

### Step 4: Build Windows Installer

```bash
npm run electron:build:win
```

This creates in the `release/` folder:
- **Installer**: `Fiber Splice Manager Setup X.X.X.exe` (full installer with uninstaller)
- **Portable**: `FiberSpliceManager-Portable.exe` (single .exe, no installation)

## 📁 What Gets Packaged

The .exe includes:
- ✅ React frontend (built)
- ✅ Express backend server
- ✅ SQLite database storage
- ✅ All dependencies
- ✅ Node.js runtime (embedded)

Users don't need Node.js installed!

## 🎯 Distribution Options

### Option 1: Full Installer (Recommended)
- Professional Windows installer
- Start menu shortcuts
- Desktop icon
- Clean uninstall
- File: `Fiber Splice Manager Setup 1.0.0.exe`

### Option 2: Portable Executable
- Single .exe file
- No installation required
- Run from USB drive
- File: `FiberSpliceManager-Portable.exe`

## 💾 Data Storage

The SQLite database file (`fiber-splice.db`) will be created in:
- **Development**: Project folder
- **Installed app**: User's AppData folder
- **Portable**: Same folder as the .exe

All fiber cable data persists between app launches!

## 🔧 Troubleshooting

**Build fails?**
- Make sure `npm run build` works first
- Check that Electron and electron-builder are installed
- Try deleting `node_modules` and running `npm install`

**App won't start?**
- Check firewall settings (port 5000)
- Look in `release/` folder for error logs

**Database not persisting?**
- Check file permissions
- Database file is created automatically on first run

## ⚙️ Build Configuration

The build is configured in `electron-builder.json`:
- Target platform: Windows x64
- Output formats: NSIS installer + Portable
- Icon: Your app logo
- File size: ~150-200MB (includes Node.js runtime)

## 🚀 Next Steps

After building:
1. Test the installer on a clean Windows machine
2. Distribute `Fiber Splice Manager Setup X.X.X.exe` to users
3. Users double-click to install
4. App appears in Start Menu and Desktop

No technical knowledge required from users!
