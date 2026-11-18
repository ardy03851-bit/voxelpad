# Voxelpad

Voxelpad is a static, touch-first launcher for the signed EaglercraftX 1.8 u53 JavaScript offline client. The public site contains original launcher code, fonts and artwork, but no Minecraft or Eaglercraft binaries, assets, server plugin, or gameplay source code. A compatible client must be supplied from the device; the site neither downloads nor uploads it.

## Play on iPad

1. Open [Voxelpad on GitHub Pages](https://ardy03851-bit.github.io/voxelpad/) in Safari.
2. Choose **Import client**, then select `EaglercraftX_1.8_u53_Offline_Signed.zip` or its unmodified HTML from Files. If Safari cannot unzip the file, tap the ZIP in Files to extract the HTML first.
3. Choose **Launch game** and tap inside the game. Rotate to landscape for more room. In **Settings**, use Battery Saver on older hardware or Balanced to start.
4. In a world, use **Save and Quit** before closing the game. Export your worlds before clearing site data or switching browser profiles.

To install the launcher, use **Share → Add to Home Screen** in Safari, then import the game from inside the Home Screen app. Browser and Home Screen storage may be separate. Offline reload works after the shell has cached on the public site; the game must also be retained locally or reimported. Removing the imported file does not remove saved worlds. Voxelpad does not connect to multiplayer servers.

## Development

There is no build step and no browser framework. Serve `docs/` over HTTPS or localhost. For example:

```sh
npx serve docs
node --test tests/client.test.mjs
```

To exercise the real file without putting it in the repository:

```sh
VOXELPAD_FIXTURE=/absolute/path/to/EaglercraftX_1.8_u53_Offline_Signed.zip \
  node --test tests/client.test.mjs
```

GitHub Pages publishes `main:/docs`. Bump the cache identifier in `docs/sw.js` when changing shell assets. Fonts are self-hosted under the bundled SIL OFL notices.

## How the client tuning works

- **Verified import:** The launcher accepts a narrow one-entry ZIP format or raw HTML, bounds decompression, and verifies the exact HTML's SHA-256 before caching it and again before execution. A public user cannot make the launcher run arbitrary imported HTML. The game runs in a restricted iframe, with its own namespaced settings and world storage.
- **Game options:** A local adapter passes a merged gzip options record through EaglercraftX’s `localStorageLoaded` hook. It sets render distance, particles, graphics, cloud rendering, VSync, shaders, dynamic lights, FXAA, and touch opacity in the running game. Lower profiles cap the device pixel ratio read by the game's canvas runtime. Existing non-profile settings are carried forward when readable.
- **Boot and touch:** The adapter skips the optional countdown after the client loads, without changing the compressed signed executable or its embedded assets. Touch input uses the game’s native controls. The launcher provides the container, safe-area layout, install instructions, and game-session UI, not a cloned control overlay.
- **Limitations:** This is runtime tuning, not a rebuilt Java engine or a benchmark. The supported u53 build is deliberately pinned. The attached `EaglerXServer.jar` is a JVM plugin and isn't needed for singleplayer or served by GitHub Pages.

## Upstream research

The [EaglercraftX 1.8 patch-and-source workspace](https://github.com/Git-Eaglercraft-rip/eaglercraft-1.8) documents its Java/TeaVM build process and touch renderer. Its [GameSettings patch](https://github.com/Git-Eaglercraft-rip/eaglercraft-1.8/blob/main/patches/minecraft/net/minecraft/client/settings/GameSettings.edit.java) and [TeaVM PlatformInput code](https://github.com/Git-Eaglercraft-rip/eaglercraft-1.8/blob/main/sources/teavm/java/net/lax1dude/eaglercraft/v1_8/internal/PlatformInput.java) describe the relevant configuration and pixel-ratio behavior. The [launch hooks documentation](https://github.com/3kh0/eaglercraft-1.8/blob/main/README.md#using-hooks) describes the gzip settings callback. The public workspace was used as a reference, not bundled as a dependency.

Minecraft is a trademark of Mojang/Microsoft. Voxelpad is an independent, unofficial launcher. See the [Minecraft EULA](https://www.minecraft.net/en-us/eula) for restrictions on game distribution and the [App Store](https://apps.apple.com/ie/app/minecraft/id479516143) for the official iPad edition.
