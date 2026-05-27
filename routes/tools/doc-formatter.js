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

const FONT = {
  title: 'SimHei',
  body: 'SimSun',
};

function buildDoc(text, template, titleText) {
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());

  const headingStyle = (text, size) =>
    new Paragraph({
      children: [new TextRun({ text, font: FONT.title, size: size * 2, bold: true })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
    });

  const bodyPara = (text) =>
    new Paragraph({
      children: [new TextRun({ text, font: FONT.body, size: 24 })],
      indent: { firstLine: 480 },
      spacing: { line: 360, after: 120 },
    });

  const children = [];

  const titleSize = template === 'lab' ? 36 : 44;

  if (titleText && titleText.trim()) {
    children.push(headingStyle(titleText.trim(), titleSize));
  }

  paragraphs.forEach(p => {
    const trimmed = p.trim();
    if (!trimmed) return;
    if (trimmed.length < 50 && !trimmed.includes('。') && !trimmed.includes('，')) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: trimmed, font: FONT.title, size: 32, bold: true })],
          spacing: { before: 300, after: 200 },
        })
      );
    } else {
      children.push(bodyPara(trimmed));
    }
  });

  return new Document({
    styles: {
      default: {
        document: {
          run: { font: FONT.body, size: 24 },
        },
      },
    },
    sections: [{
      properties: {
        page: {
          margin: {
            top: template === 'lab' ? 1270 : 1134,
            bottom: template === 'lab' ? 1270 : 1134,
            left: template === 'lab' ? 1440 : 1600,
            right: template === 'lab' ? 1440 : 1600,
          },
        },
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

    const template = req.body.template || 'course';
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

    const titleText = req.body.title || '';

    const doc = buildDoc(text, template, titleText);
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
