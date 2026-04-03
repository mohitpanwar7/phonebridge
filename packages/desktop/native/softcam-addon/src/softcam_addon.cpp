#include <napi.h>
#include <vector>
#include <cstdint>

#ifdef _WIN32
#include <windows.h>
#endif

// ─────────────────────────────────────────────────────────────────────────────
// Softcam sender API
// After cloning the submodule:
//   cd packages/desktop/native/softcam-addon
//   git submodule add https://github.com/tshino/softcam deps/softcam
// Then build: node-gyp rebuild
// ─────────────────────────────────────────────────────────────────────────────
#if __has_include("../deps/softcam/src/softcam.h")
  #include "../deps/softcam/src/softcam.h"
  #define SOFTCAM_AVAILABLE 1
#else
  // Stub types when submodule not yet present
  typedef void* scCamera;
  inline scCamera scCreateCamera(int, int, float) { return nullptr; }
  inline void     scDeleteCamera(scCamera) {}
  inline void     scSendFrame(scCamera, const void*) {}
  #define SOFTCAM_AVAILABLE 0
#endif

// ─────────────────────────────────────────────────────────────────────────────
// Globals
// ─────────────────────────────────────────────────────────────────────────────
static scCamera g_camera = nullptr;
static int      g_width  = 0;
static int      g_height = 0;
static float    g_fps    = 0.0f;

// Reuse a single BGR conversion buffer to avoid per-frame allocation
static std::vector<uint8_t> g_bgrBuf;

// ─────────────────────────────────────────────────────────────────────────────
// Frame conversion: RGBA top-down → BGR bottom-up (Windows DIB format)
// Softcam expects 24-bit BGR pixels in bottom-up row order.
// ─────────────────────────────────────────────────────────────────────────────
static const uint8_t* ConvertRGBAtoBottomUpBGR(
    const uint8_t* rgba, int width, int height)
{
  const size_t needed = static_cast<size_t>(width) * height * 3;
  if (g_bgrBuf.size() != needed) g_bgrBuf.resize(needed);

  for (int y = 0; y < height; ++y) {
    // Flip vertically: DIB row 0 is the bottom of the image
    const int srcRow = y;
    const int dstRow = height - 1 - y;
    const uint8_t* src = rgba + static_cast<ptrdiff_t>(srcRow) * width * 4;
    uint8_t*       dst = g_bgrBuf.data() + static_cast<ptrdiff_t>(dstRow) * width * 3;

    for (int x = 0; x < width; ++x) {
      dst[0] = src[2]; // B ← source B
      dst[1] = src[1]; // G ← source G
      dst[2] = src[0]; // R ← source R
      src += 4;
      dst += 3;
    }
  }
  return g_bgrBuf.data();
}

// ─────────────────────────────────────────────────────────────────────────────
// isAvailable(): boolean
// Checks the Windows registry for the Softcam DirectShow filter CLSID.
// The CLSID is written by "regsvr32 softcam.dll".
// ─────────────────────────────────────────────────────────────────────────────
Napi::Boolean IsAvailable(const Napi::CallbackInfo& info) {
  bool found = false;

#if SOFTCAM_AVAILABLE && defined(_WIN32)
  // Softcam filter CLSID as registered by regsvr32
  // CLSID_SoftcamFilter = {ED3640E5-0F28-4152-8D0F-1893BCF4AD78}
  const wchar_t* key =
    L"CLSID\\{ED3640E5-0F28-4152-8D0F-1893BCF4AD78}\\InprocServer32";

  HKEY hKey = nullptr;
  if (RegOpenKeyExW(HKEY_CLASSES_ROOT, key, 0, KEY_READ, &hKey) == ERROR_SUCCESS) {
    found = true;
    RegCloseKey(hKey);
  }
#endif

  return Napi::Boolean::New(info.Env(), found);
}

// ─────────────────────────────────────────────────────────────────────────────
// createCamera(width, height, fps): boolean
// ─────────────────────────────────────────────────────────────────────────────
Napi::Boolean CreateCamera(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 3) {
    Napi::TypeError::New(env, "createCamera(width, height, fps) requires 3 arguments")
      .ThrowAsJavaScriptException();
    return Napi::Boolean::New(env, false);
  }

  const int   w   = info[0].As<Napi::Number>().Int32Value();
  const int   h   = info[1].As<Napi::Number>().Int32Value();
  const float fps = static_cast<float>(info[2].As<Napi::Number>().DoubleValue());

  // Destroy any existing camera first
  if (g_camera) {
    scDeleteCamera(g_camera);
    g_camera = nullptr;
  }

  g_camera = scCreateCamera(w, h, fps);
  if (g_camera) {
    g_width  = w;
    g_height = h;
    g_fps    = fps;
    g_bgrBuf.resize(static_cast<size_t>(w) * h * 3);
  }

  return Napi::Boolean::New(env, g_camera != nullptr);
}

// ─────────────────────────────────────────────────────────────────────────────
// sendFrame(rgbaBuffer: Buffer): void
// rgbaBuffer must be exactly width × height × 4 bytes (RGBA).
// ─────────────────────────────────────────────────────────────────────────────
void SendFrame(const Napi::CallbackInfo& info) {
  if (!g_camera) return;

  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsBuffer()) {
    Napi::TypeError::New(env, "sendFrame(rgbaBuffer: Buffer) requires a Buffer argument")
      .ThrowAsJavaScriptException();
    return;
  }

  Napi::Buffer<uint8_t> buf = info[0].As<Napi::Buffer<uint8_t>>();
  const size_t expected = static_cast<size_t>(g_width) * g_height * 4;

  if (buf.ByteLength() < expected) return; // skip malformed frames silently

  const uint8_t* bgr = ConvertRGBAtoBottomUpBGR(buf.Data(), g_width, g_height);
  scSendFrame(g_camera, bgr);
}

// ─────────────────────────────────────────────────────────────────────────────
// destroyCamera(): void
// ─────────────────────────────────────────────────────────────────────────────
void DestroyCamera(const Napi::CallbackInfo&) {
  if (!g_camera) return;
  scDeleteCamera(g_camera);
  g_camera = nullptr;
  g_width  = 0;
  g_height = 0;
  g_fps    = 0.0f;
  g_bgrBuf.clear();
}

// ─────────────────────────────────────────────────────────────────────────────
// Module init
// ─────────────────────────────────────────────────────────────────────────────
Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("createCamera",  Napi::Function::New(env, CreateCamera));
  exports.Set("sendFrame",     Napi::Function::New(env, SendFrame));
  exports.Set("destroyCamera", Napi::Function::New(env, DestroyCamera));
  exports.Set("isAvailable",   Napi::Function::New(env, IsAvailable));
  return exports;
}

NODE_API_MODULE(softcam_addon, Init)
