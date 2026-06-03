const express = require('express');
const multer = require('multer');
const { PDFDocument } = require('pdf-lib');
const fs = require('fs');
const path = require('path');
const router = express.Router();

const tmpDir = (process.env.VERCEL || process.env.RAILWAY_ENVIRONMENT) ? '/tmp' : path.join(__dirname, '../../tmp');
const upload = multer({
  dest: tmpDir,
  limits: { fileSize: 50 * 1024 * 1024 },
});

router.get('/', (req, res) => {
  res.render('tools/pdf-merge', { title: '在线 PDF 合并 - 免费 PDF 合并工具' });
});

router.post('/', upload.array('pdfs', 20), async (req, res) => {
  try {
    if (!req.files || req.files.length < 2) {
      return res.status(400).json({ error: '请至少选择 2 个 PDF 文件' });
    }

    req.files.sort((a, b) => a.originalname.localeCompare(b.originalname));

    const mergedPdf = await PDFDocument.create();

    for (const file of req.files) {
      const pdfBytes = fs.readFileSync(file.path);
      const pdf = await PDFDocument.load(pdfBytes);
      const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
      copiedPages.forEach(page => mergedPdf.addPage(page));
    }

    const mergedBytes = await mergedPdf.save();

    for (const file of req.files) {
      fs.unlink(file.path, () => {});
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="merged.pdf"');
    res.send(Buffer.from(mergedBytes));
  } catch (err) {
    if (req.files) {
      req.files.forEach(f => fs.unlink(f.path, () => {}));
    }
    res.status(500).json({ error: 'PDF 合并失败: ' + err.message });
  }
});

module.exports = router;
