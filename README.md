# Snap Translate

A Chrome extension (also Arc, Edge, Brave) that translates the text in pictures right where they are on the page. No more screenshot, save, upload to an AI, read, come back.

Plain JavaScript, no build step, no dependencies.

## Use it

- **Right-click a picture → Translate picture.**
- **Or drag over any part of the page:** press <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>T</kbd> (<kbd>⌥</kbd><kbd>⇧</kbd><kbd>T</kbd> on a Mac), right-click → *Translate an area…*, or use the button in the popup. This also works on video frames, backgrounds and canvases.

The translation appears in a card next to the picture. *On picture* lays each translation over the text it replaces. Click a line to copy it.

## Translators

| Choice | Cost | Notes |
| --- | --- | --- |
| Quick (default) | Free, no key | Reads Vietnamese and English text on your computer (Tesseract.js), then Google Translate's free web endpoint translates it. Best on clean text; weak on memes, handwriting and stylised fonts. |
| Gemini | Free key from Google AI Studio, with daily limits | On the free tier Google may use what you send to improve its models. |
| Claude | Paid per use from API credits | Needs a Claude Console API key. A Claude Pro or Max subscription doesn't cover API use. |
| Local | Free, offline | Ollama or LM Studio with a vision model. |
| Other API | Depends | Any OpenAI-compatible API, for example OpenRouter. |

## Privacy: what leaves your browser

Nothing, until you ask for a translation. With Quick the picture stays on your computer and only the text found in it goes to `translate.googleapis.com`. With an AI translator, a screenshot of only the area you chose goes to that provider, with your API key. Keys are stored in `chrome.storage.local` on this device. No analytics, no accounts.

The page script is added only to the tab where you start a translation (`activeTab`), never to every site.

## Install while developing

1. Open `chrome://extensions` and turn on **Developer mode** (top right).
2. Click **Load unpacked** and choose this folder.
3. Pin the extension and try it: Quick works straight away. For better reading of tricky pictures, add a Gemini key in the popup.

## Third-party code

`vendor/tesseract/` holds [Tesseract.js](https://github.com/naptha/tesseract.js) 7.0.0 and its engine and Vietnamese and English language data, unmodified from npm, under the Apache 2.0 licence. See `vendor/tesseract/VERSIONS.txt`.
