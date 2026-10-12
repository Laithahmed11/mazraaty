# Mazraaty approved mark — 12 October 2026

The user selected the first palm, gateway, sun and fields concept, without the Arabic wordmark inside the artwork. The separate product name in the website header remains accessible text.

`mazraaty-icon-master.png` is the opaque square master. Website derivatives are in `website/app/public/assets/`: a 256px header mark, 64px favicon and 192px touch icon. Both Android apps use a 512px bitmap with an adaptive launcher resource on API 26+, and a bitmap fallback on API 24–25. Foreground padding keeps the symbol away from launcher masks. Native icon updates require installing the rebuilt APK; website updates load from the server.

Built-in image generation was used with the approved first image as reference. Final brief: preserve the original gateway, palm, sunset and fields; remove all wording; place the mark centrally on an opaque forest green square suitable for launcher masks. PNG derivatives only change export dimensions.

Android reference: https://developer.android.com/develop/ui/compose/system/icon_design_adaptive

Preview builds: Android version 0.6.1, versionCode 6. No iOS icon or store release has been built here.
