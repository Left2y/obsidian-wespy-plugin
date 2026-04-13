# WeChat Offline Importer

An Obsidian desktop plugin for importing WeChat articles into your vault and downloading article images locally for offline reading.

## What V1 does

- Imports a `mp.weixin.qq.com` article directly from a URL.
- Downloads article images into your vault instead of leaving them as remote URLs.
- Rewrites downloaded images to Obsidian embeds.
- Adds a command to localize external image links in the current note, which is useful after clipping with Obsidian Web Clipper.
- Can automatically localize newly created or newly modified Web Clipper notes when they are saved into watched folders.
- Can rebuild WeChat Web Clipper notes from the original `source` URL to recover images that Web Clipper skipped.

## Commands

- `Import article from link`
- `Import article from clipboard`
- `Download external images in current note`
- `Rebuild current note from source`

## Settings

- `Import folder`: vault folder where imported notes are created.
- `Prefix published date`: prepend the article date to the filename when available.
- `Open note after import`: open the created note immediately.
- `Auto-localize clipped notes`: watch new notes created by Web Clipper and download their images automatically.
- `Rebuild clips from source`: refetch the original WeChat article before downloading images so missing images can be recovered.
- `Watched folders`: one vault folder per line. V1 defaults to `📚 Sources` and `Clippings`.

## Install Without Building

Use the packaged build when you only want to install the plugin:

1. Download `release/obsidian-wechat-importer.zip`.
2. Extract it.
3. Copy the extracted `obsidian-wechat-importer` folder into:

```text
<YourVault>/.obsidian/plugins/obsidian-wechat-importer/
```

4. Open Obsidian and enable **WeChat Offline Importer** in **Settings → Community plugins**

The package already includes `main.js`, `manifest.json`, and `styles.css`; you do not need `npm install` or `npm run build`.

## Development Build

1. Run `npm install`
2. Run `npm run build`
3. Copy `main.js`, `manifest.json`, and `styles.css` into the plugin folder above.

## Current limitations

- V1 only imports direct `mp.weixin.qq.com` article URLs.
- It does not modify the Web Clipper browser extension; it watches the created note inside Obsidian instead.
- Some protected or login-bound WeChat articles may still fail if WeChat changes the page structure or blocks the request.

## Recommended workflow today

If you mainly use Obsidian Web Clipper:

1. Clip the page as usual.
2. Save the note into a watched folder such as `📚 Sources` or `Clippings`.
3. Let the plugin download the images automatically.

If you want to localize an older clipped note:

1. Open the note in Obsidian.
2. Run `Rebuild current note from source` if the note has a WeChat `source` URL.
3. Run `Download external images in current note` only when the note already contains remote image links.

If a WeChat article loses images during clipping:

1. Open the clipped note.
2. Run `Rebuild current note from source`.
3. The plugin will refetch the article and write local image embeds back into the same note.
