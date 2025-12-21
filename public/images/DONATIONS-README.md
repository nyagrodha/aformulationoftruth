# Donations Page Image Guide

This guide explains what images are needed for the donations page and where to place them.

## Required Images

### 1. Hero Image
- **Filename**: `donations-hero.jpg` or `donations-hero.webp`
- **Recommended Size**: 600x300px (or 1200x600px for retina displays)
- **Purpose**: A banner image that appears at the top of the donations page
- **Suggested Content**: Something that represents the site's philosophy or a thank you message
- **Location**: `/images/donations-hero.jpg`

### 2. Bitcoin QR Code
- **Filename**: `qr-btc.png`
- **Size**: 200x200px
- **Purpose**: QR code for Bitcoin donation address
- **How to Generate**: Use any Bitcoin QR code generator with your BTC address
- **Location**: `/images/qr-btc.png`

### 3. Monero QR Code
- **Filename**: `qr-xmr.png`
- **Size**: 200x200px
- **Purpose**: QR code for Monero donation address
- **How to Generate**: Use any Monero QR code generator with your XMR address
- **Location**: `/images/qr-xmr.png`

### 4. Ethereum QR Code
- **Filename**: `qr-eth.png`
- **Size**: 200x200px
- **Purpose**: QR code for Ethereum donation address
- **How to Generate**: Use any Ethereum QR code generator with your ETH address
- **Location**: `/images/qr-eth.png`

## How to Activate Images

Once you've added the images to the `/images/` directory, edit `/donations.html` and:

1. For the hero image, uncomment line ~181:
   ```html
   <!-- <img src="/images/donations-hero.jpg" alt="Support A Formulation of Truth" class="hero-image"> -->
   ```
   Remove the `<!-- -->` comment markers and delete the placeholder div below it.

2. For each QR code, uncomment the respective lines (around lines 223, 240, 257):
   ```html
   <!-- <img src="/images/qr-btc.png" alt="Bitcoin QR Code" class="qr-code"> -->
   ```
   Remove the `<!-- -->` comment markers and delete the placeholder div below it.

## Generating QR Codes

### Online Tools:
- **Bitcoin**: https://www.bitcoinqrcodemaker.com/
- **Ethereum**: https://etherscan.io/qrcode
- **Monero**: Use Monero GUI wallet or https://www.the-qrcode-generator.com/

### Command Line:
```bash
# Install qrencode
sudo apt-get install qrencode

# Generate QR codes
qrencode -o qr-btc.png "bitcoin:YOUR_BTC_ADDRESS"
qrencode -o qr-xmr.png "monero:YOUR_XMR_ADDRESS"
qrencode -o qr-eth.png "ethereum:YOUR_ETH_ADDRESS"
```

## Notes

- All images should be optimized for web (compressed but still readable)
- Consider using WebP format for better compression
- QR codes should have adequate white space around them
- Test QR codes with multiple scanning apps before deploying
- Remember to update the cryptocurrency addresses in `donations.html` as well!
