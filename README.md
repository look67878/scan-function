# Scan Function

A simple React + TypeScript + Vite barcode / QR scanner prototype.

## Features

- Start scanning with one button
- Open camera with `getUserMedia`
- Use `BarcodeDetector` when supported
- Fall back to `zxing` when `BarcodeDetector` is unavailable
- Show a success page after scanning
- Support mobile testing over local HTTPS

## Run

```bash
npm install
npm run dev
```

## Mobile Testing

Open the local HTTPS address from your phone on the same Wi-Fi network.

Example:

```text
https://10.133.90.93:5173
```
