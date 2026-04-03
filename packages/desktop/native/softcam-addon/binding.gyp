{
  "targets": [
    {
      "target_name": "softcam_addon",
      "sources": [
        "src/softcam_addon.cpp"
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")",
        "deps/softcam/src"
      ],
      "dependencies": [
        "<!(node -p \"require('node-addon-api').gyp\")"
      ],
      "defines": [
        "NAPI_DISABLE_CPP_EXCEPTIONS"
      ],
      "conditions": [
        ["OS=='win'", {
          "msvs_settings": {
            "VCCLCompilerTool": {
              "ExceptionHandling": 1,
              "AdditionalOptions": ["/std:c++17"]
            }
          },
          "libraries": [
            "-lole32",
            "-loleaut32",
            "-lstrmiids",
            "-lAdvapi32"
          ],
          "sources": [
            "src/softcam_addon.cpp"
          ],
          "conditions": [
            ["'<!(node -p \"require('fs').existsSync('deps/softcam/src/softcam.cpp') ? 1 : 0\")'=='1'", {
              "sources": [
                "src/softcam_addon.cpp",
                "deps/softcam/src/softcam.cpp"
              ]
            }]
          ]
        }]
      ]
    }
  ]
}
