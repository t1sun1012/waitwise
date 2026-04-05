# WaitWise

WaitWise is a Chrome extension prototype that shows a quick quiz while ChatGPT is thinking.

## Quick Setup For Teammates

### 1. Clone the repo

```bash
git clone git@github.com:t1sun1012/waitwise.git
cd waitwise
```

If someone on the team prefers HTTPS instead of SSH:

```bash
git clone https://github.com/t1sun1012/waitwise.git
cd waitwise
```

### 2. Install dependencies

```bash
npm install
```

### 3. Build the extension

```bash
npm run build
```

This generates the unpacked Chrome extension in:

```text
output/chrome-mv3
```

### 4. Load it in Chrome

1. Open `chrome://extensions`
2. Turn on `Developer mode`
3. Click `Load unpacked`
4. Select the folder [`output/chrome-mv3`](/Users/t1sun-mac/waitwise/output/chrome-mv3)

### 5. Test it on ChatGPT

1. Open [ChatGPT](https://chatgpt.com/)
2. Submit a prompt
3. Wait for ChatGPT to enter its thinking/generating state
4. The WaitWise widget should appear on the page

## Useful Commands

```bash
npm install
npm run build
```

If you change the code, run `npm run build` again and then click the refresh icon for the extension on `chrome://extensions`.
