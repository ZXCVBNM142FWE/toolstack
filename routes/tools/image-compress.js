const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const router = express.Router();

const tmpDir = process.env.VERCEL ? '/tmp' : path.join(__dirname, '../../tmp');
const upload = multer({ dest: tmpDir });

router.get('/', (req, res) => {
  res.render('tools/image-compress', { title: '在线图片压缩 - 免费图片压缩工具' });
});

router.post('/', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请选择一张图片' });
    }

    const inputPath = req.file.path;
    const ext = path.extname(req.file.originalname).toLowerCase();
    const isPng = ext === '.png';
    const quality = parseInt(req.body.quality) || 80;

    let compressed;
    if (isPng) {
      compressed = await sharp(inputPath).png({ palette: true }).toBuffer();
    } else {
      compressed = await sharp(inputPath).jpeg({ quality }).toBuffer();
    }

    const stats = {
      original: req.file.size,
      compressed: compressed.length,
      data: compressed.toString('base64'),
      type: isPng ? 'image/png' : 'image/jpeg',
    };

    fs.unlink(inputPath, () => {});

    res.json(stats);
  } catch (err) {
    if (req.file) fs.unlink(req.file.path, () => {});
    res.status(500).json({ error: '压缩失败: ' + err.message });
  }
});

module.exports = router;
