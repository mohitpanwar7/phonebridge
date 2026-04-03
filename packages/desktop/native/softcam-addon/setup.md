# Softcam Native Addon — Setup

## 1. Clone the Softcam submodule

```sh
cd packages/desktop/native/softcam-addon
git submodule add https://github.com/tshino/softcam deps/softcam
```

## 2. Build Softcam DLL (first time only)

```sh
cd deps/softcam
cmake -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build --config Release
```

This produces `build/src/softcam.dll`.

## 3. Register the DLL (admin PowerShell, first time only)

```powershell
regsvr32 "path\to\softcam.dll"
```

Or let `SoftcamInstaller.ts` handle this automatically when the desktop app starts.

## 4. Build the Node.js addon

```sh
cd packages/desktop/native/softcam-addon
npm run build
# or
node-gyp rebuild --target=<electron-version> --arch=x64 --dist-url=https://electronjs.org/headers
```

## Notes

- The addon uses `__has_include` to detect whether the Softcam submodule is present.
  Without it, all API calls are stubs (virtual camera disabled but app still runs).
- RGBA→BGR bottom-up conversion is done in C++ for performance (~120 fps at 1080p).
- Softcam CLSID: `{ED3640E5-0F28-4152-8D0F-1893BCF4AD78}`
