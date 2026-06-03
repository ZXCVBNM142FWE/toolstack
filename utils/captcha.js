// Zero-dependency SVG captcha generator
const crypto = require("crypto");

class SvgCaptcha {
  constructor(options = {}) {
    this.width = options.width || 140;
    this.height = options.height || 48;
    this.size = options.size || 4;
    this.fontSize = options.fontSize || 30;
    this.chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  }

  _randomChar() {
    return this.chars[Math.floor(Math.random() * this.chars.length)];
  }

  _randomColor(min, max) {
    const r = Math.floor(Math.random() * (max - min) + min);
    const g = Math.floor(Math.random() * (max - min) + min);
    const b = Math.floor(Math.random() * (max - min) + min);
    return `rgb(${r},${g},${b})`;
  }

  _noiseLines(count) {
    let s = "";
    for (let i = 0; i < count; i++) {
      s += `<line x1="${Math.random() * this.width}" y1="${Math.random() * this.height}" x2="${Math.random() * this.width}" y2="${Math.random() * this.height}" stroke="${this._randomColor(120, 200)}" stroke-width="${Math.random() + 0.5}"/>`;
    }
    return s;
  }

  _noiseDots(count) {
    let s = "";
    for (let i = 0; i < count; i++) {
      s += `<circle cx="${Math.random() * this.width}" cy="${Math.random() * this.height}" r="${Math.random() * 1.5 + 0.3}" fill="${this._randomColor(80, 180)}"/>`;
    }
    return s;
  }

  create() {
    let text = "";
    for (let i = 0; i < this.size; i++) text += this._randomChar();

    const charWidth = this.width / (this.size + 1);
    let textEls = "";
    for (let i = 0; i < text.length; i++) {
      const x = charWidth * (i + 0.5) + (Math.random() - 0.5) * 10;
      const y = this.height * 0.6 + (Math.random() - 0.5) * 8;
      const rotate = (Math.random() - 0.5) * 35;
      textEls += `<text x="${x}" y="${y}" font-size="${this.fontSize}" font-family="Arial,Helvetica,sans-serif" fill="${this._randomColor(20, 100)}" transform="rotate(${rotate},${x},${y})" font-weight="bold">${text[i]}</text>`;
    }

    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${this.width}" height="${this.height}" viewBox="0 0 ${this.width} ${this.height}">` +
      `<rect width="100%" height="100%" fill="#f8f9fa" rx="6"/>` +
      this._noiseLines(5) +
      this._noiseDots(40) +
      textEls +
      `</svg>`;

    return { svg, text: text.toLowerCase() };
  }
}

module.exports = new SvgCaptcha({ size: 4 });
