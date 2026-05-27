const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const mammoth = require('mammoth');
const { Document, Packer, Paragraph, TextRun, AlignmentType } = require('docx');

const uploadDir = (process.env.VERCEL || process.env.RAILWAY_SERVICE_ID || process.env.RENDER) ? '/tmp' : path.join(__dirname, '..', '..', 'tmp');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.docx' || ext === '.txt') {
      cb(null, true);
    } else {
      cb(new Error('仅支持 .docx 和 .txt 文件'));
    }
  }
});

const FONTS = {
  simsun: { label: '宋体', name: 'SimSun' },
  simhei: { label: '黑体', name: 'SimHei' },
  fangsong: { label: '仿宋', name: 'FangSong' },
  kaiti: { label: '楷体', name: 'KaiTi' },
};

const MARGINS = {
  standard: { top: 1134, bottom: 1134, left: 1600, right: 1600 },
  wide: { top: 1134, bottom: 1134, left: 2160, right: 2160 },
  narrow: { top: 720, bottom: 720, left: 720, right: 720 },
};

const LINE_SPACING = {
  '1.0': 240,
  '1.25': 300,
  '1.5': 360,
  '2.0': 480,
};

function buildDoc(text, options) {
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());

  const bodyFont = FONTS[options.bodyFont] || FONTS.simsun;
  const titleFont = FONTS[options.titleFont] || FONTS.simhei;
  const bodySize = parseInt(options.bodySize) || 24;
  const titleSize = parseInt(options.titleSize) || 44;
  const lineSpacing = LINE_SPACING[options.lineSpacing] || 360;
  const firstIndent = options.indent !== 'none' ? 480 : 0;
  const margin = MARGINS[options.margin] || MARGINS.standard;
  const titleAlign = options.titleAlign === 'left' ? AlignmentType.LEFT : AlignmentType.CENTER;

  const makeTitle = (text, size) =>
    new Paragraph({
      children: [new TextRun({ text, font: titleFont.name, size: size * 2, bold: true })],
      alignment: titleAlign,
      spacing: { after: 400 },
    });

  const makeBody = (text) =>
    new Paragraph({
      children: [new TextRun({ text, font: bodyFont.name, size: bodySize })],
      indent: firstIndent ? { firstLine: firstIndent } : undefined,
      spacing: { line: lineSpacing, after: 120 },
    });

  const children = [];

  if (options.title && options.title.trim()) {
    children.push(makeTitle(options.title.trim(), titleSize));
  }

  paragraphs.forEach(p => {
    const trimmed = p.trim();
    if (!trimmed) return;
    if (trimmed.length < 50 && !trimmed.includes('。') && !trimmed.includes('，')) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: trimmed, font: titleFont.name, size: titleSize - 4, bold: true })],
          spacing: { before: 300, after: 200 },
        })
      );
    } else {
      children.push(makeBody(trimmed));
    }
  });

  return new Document({
    styles: {
      default: {
        document: {
          run: { font: bodyFont.name, size: bodySize },
        },
      },
    },
    sections: [{
      properties: {
        page: { margin },
      },
      children,
    }],
  });
}

router.get('/', (req, res) => {
  res.render('tools/doc-formatter', { title: '文档格式整理 - 在线学术排版工具', error: null });
});

router.post('/', upload.single('doc'), async (req, res) => {
  try {
    if (!req.file) {
      return res.render('tools/doc-formatter', { title: '文档格式整理 - 在线学术排版工具', error: '请上传文件' });
    }

    const filePath = req.file.path;
    const ext = path.extname(req.file.originalname).toLowerCase();

    let text;
    if (ext === '.txt') {
      text = fs.readFileSync(filePath, 'utf-8');
    } else {
      const result = await mammoth.extractRawText({ path: filePath });
      text = result.value;
    }

    fs.unlinkSync(filePath);

    if (!text.trim()) {
      return res.render('tools/doc-formatter', { title: '文档格式整理 - 在线学术排版工具', error: '文件中没有检测到文字内容' });
    }

    const options = {
      bodyFont: req.body.bodyFont || 'simsun',
      titleFont: req.body.titleFont || 'simhei',
      bodySize: req.body.bodySize || '24',
      titleSize: req.body.titleSize || '44',
      lineSpacing: req.body.lineSpacing || '1.5',
      indent: req.body.indent || 'on',
      margin: req.body.margin || 'standard',
      titleAlign: req.body.titleAlign || 'center',
      title: req.body.title || '',
    };

    const doc = buildDoc(text, options);
    const buffer = await Packer.toBuffer(doc);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', 'attachment; filename="formatted.docx"');
    res.send(buffer);
  } catch (err) {
    console.error('doc-formatter error:', err.message);
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.render('tools/doc-formatter', { title: '文档格式整理 - 在线学术排版工具', error: '处理失败，请检查文件是否损坏或格式异常' });
  }
});

module.exports = router;
