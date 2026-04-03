#include <napi.h>

// Softcam header — included after cloning the submodule
// #include "softcam/src/softcam.h"

// ──────────────────────────────────────────────────────────────────
// Stub implementation until Softcam submodule is available.
// Replace the stub body with real Softcam calls after:
//   git submodule add https://github.com/tshino/softcam packages/desktop/native/softcam-addon/deps/softcam
// ──────────────────────────────────────────────────────────────────

static void* g_camera = nullptr;
static int   g_width  = 0;
static int   g_height = 0;
static float g_fps    = 0.0f;

// createCamera(width: number, height: number, fps: number): boolean
Napi::Boolean CreateCamera(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 3) {
    Napi::TypeError::New(env, "Expected (width, height, fps)").ThrowAsJavaScriptException();
    return Napi::Boolean::New(env, false);
  }

  g_width  = info[0].As<Napi::Number>().Int32Value();
  g_height = info[1].As<Napi::Number>().Int32Value();
  g_fps    = static_cast<float>(info[2].As<Napi::Number>().DoubleValue());

  // TODO: replace stub with real Softcam call:
  // g_camera = scCreateCamera(g_width, g_height, g_fps);
  g_camera = reinterpret_cast<void*>(1); // non-null stub

  return Napi::Boolean::New(env, g_camera != nullptr);
}

// sendFrame(rgbaBuffer: Buffer): void
void SendFrame(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (!g_camera || info.Length() < 1 || !info[0].IsBuffer()) return;

  // Napi::Buffer<uint8_t> buf = info[0].As<Napi::Buffer<uint8_t>>();
  // const uint8_t* data = buf.Data();
  // size_t size = buf.Length();

  // TODO: replace stub with real Softcam call:
  // scSendFrame(g_camera, data);

  (void)env;
}

// destroyCamera(): void
void DestroyCamera(const Napi::CallbackInfo&) {
  if (!g_camera) return;

  // TODO: replace stub with real Softcam call:
  // scDeleteCamera(g_camera);

  g_camera = nullptr;
  g_width  = 0;
  g_height = 0;
  g_fps    = 0.0f;
}

// isAvailable(): boolean — true when Softcam DLL is registered
Napi::Boolean IsAvailable(const Napi::CallbackInfo& info) {
  // TODO: check if Softcam DirectShow filter is registered via
  //       CoCreateInstance or registry key check
  return Napi::Boolean::New(info.Env(), false); // stub always returns false
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("createCamera",  Napi::Function::New(env, CreateCamera));
  exports.Set("sendFrame",     Napi::Function::New(env, SendFrame));
  exports.Set("destroyCamera", Napi::Function::New(env, DestroyCamera));
  exports.Set("isAvailable",   Napi::Function::New(env, IsAvailable));
  return exports;
}

NODE_API_MODULE(softcam_addon, Init)
