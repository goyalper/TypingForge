# TypingForge

TypingForge is a client-side React typing practice studio for multilingual practice, timed tests, Hindi government-exam typing, result sharing, and quick games.

## Run locally

1. Open this folder in a terminal.
2. Run npm install once.
3. Run npm run dev and open the local address Vite prints.

## Automated checks and deployment

GitHub Actions runs `npm ci`, the share-link tests, and a production build for pushes and pull requests targeting `main`. A successful push to `main` is deployed to GitHub Pages at `https://goyalper.github.io/TypingForge/`.

To enable the first deployment, open the repository's **Settings → Pages** and choose **GitHub Actions** as the build and deployment source.

## What’s included

- Timed typing tests with five passage difficulty levels.
- Hindi Unicode input and Kruti Dev 010 legacy key-sequence practice with a live Unicode preview.
- English, Spanish, French, German, Hindi, Tamil, and Japanese passages.
- Fresh Wikipedia passages fetched on demand and saved in the browser for later shuffled practice. Passage sources link to their article and include CC BY-SA attribution.
- Results history, downloadable CSV and JSON results, and analytics CSV exports.
- A saved learner profile requested on first launch; its name appears in the header and is used automatically on result posters.
- Shareable result posters with a QR code, WhatsApp and LinkedIn links, and device sharing for Instagram where supported.
- Word Sprint and Key Meteor mini games.
- Mechanical keyboard sound enabled by default, plus soft tap, typewriter, bubble pop, and silent options.
- A Settings action to clear test results, quiz and game bests, and saved passages while keeping the learner profile and preferences.

## Hindi input

Kruti Dev 010 is a legacy font encoding that uses Latin key codes. For exam-style practice, enable an installed Kruti Dev 010 Remington input method on your device and choose **Kruti Dev 010 · Remington** in the test workspace. The target paragraph remains readable Unicode Hindi, and the entered key sequence is converted to a Unicode preview.

Choose **Hindi Unicode · system input** to type Unicode with your device’s Hindi keyboard or IME, such as InScript. This mode checks the Unicode text directly. Kruti Dev 010 is distinct from other exam layouts such as Remington GAIL or CBI.

## Browser storage and passage sources

Preferences, results, game bests, and fetched passages stay in local browser storage. When you request a fresh passage, TypingForge contacts the matching Wikipedia API; the app does not upload your typing or test history. The saved passage library is limited by the browser’s local storage capacity.
