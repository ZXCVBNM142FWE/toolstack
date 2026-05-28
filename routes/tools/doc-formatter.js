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
    if (ext === '.docx' || ext === '.doc' || ext === '.wps' || ext === '.txt') {
      cb(null, true);
    } else {
      cb(new Error('仅支持 .docx / .doc / .wps / .txt 文件'));
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

// Natural language parser for Chinese formatting requirements
function parseRequirements(input) {
  if (!input || !input.trim()) return {};
  const s = input.trim();
  const result = {};

  // Font detection
  if (/宋体/.test(s)) result.bodyFont = 'simsun';
  if (/黑体/.test(s)) result.titleFont = 'simhei';
  if (/仿宋/.test(s)) result.bodyFont = 'fangsong';
  if (/楷体/.test(s)) result.bodyFont = 'kaiti';
  // Title-specific font
  if (/标题.*黑体|黑体.*标题/.test(s)) result.titleFont = 'simhei';
  if (/标题.*宋体|宋体.*标题/.test(s)) result.titleFont = 'simsun';
  // Combined: "正文宋体标题黑体"
  if (/正文.*仿宋|仿宋.*正文/.test(s)) result.bodyFont = 'fangsong';
  if (/正文.*楷体|楷体.*正文/.test(s)) result.bodyFont = 'kaiti';
  if (/正文.*宋体|宋体.*正文/.test(s)) result.bodyFont = 'simsun';
  if (/标题.*黑体|黑体.*标题/.test(s)) result.titleFont = 'simhei';

  // Body font size
  if (/五号|5号/.test(s) && !/小五|小5/.test(s)) result.bodySize = '21';
  if (/小四|小4/.test(s)) result.bodySize = '24';
  if (/四号|4号/.test(s) && !/小四|小4/.test(s)) result.bodySize = '28';

  // Title font size
  if (/三号|3号/.test(s) && !/小三|小3/.test(s)) result.titleSize = '32';
  if (/小二|小2/.test(s)) result.titleSize = '36';
  if (/二号|2号/.test(s) && !/小二|小2/.test(s)) result.titleSize = '44';

  // Line spacing
  if (/双倍|2倍|2\.0/.test(s)) result.lineSpacing = '2.0';
  else if (/1\.25/.test(s) || /1\.25倍/.test(s)) result.lineSpacing = '1.25';
  else if (/1\.5/.test(s) || /1\.5倍/.test(s)) result.lineSpacing = '1.5';
  else if (/单倍|1倍|1\.0/.test(s)) result.lineSpacing = '1.0';

  // Indent
  if (/不缩进|无缩进|顶格/.test(s)) result.indent = 'none';
  else if (/缩进|空两格|空2格/.test(s)) result.indent = 'on';

  // Margin
  if (/加宽/.test(s)) result.margin = 'wide';
  else if (/较窄|窄/.test(s)) result.margin = 'narrow';
  else if (/标准/.test(s)) result.margin = 'standard';

  // Title align
  if (/左对齐|靠左/.test(s)) result.titleAlign = 'left';
  else if (/居中/.test(s)) result.titleAlign = 'center';

  return result;
}

function extractText(filePath, ext) {
  if (ext === '.txt') {
    return fs.readFileSync(filePath, 'utf-8');
  }

  if (ext === '.docx') {
    return mammoth.extractRawText({ path: filePath }).then(r => r.value);
  }

  try {
    return mammoth.extractRawText({ path: filePath }).then(r => r.value);
  } catch (_) {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const cleaned = raw.replace(/[^\x20-\x7E一-鿿　-〿＀-￯\n\r]/g, '');
    if (cleaned.trim().length > 100) return Promise.resolve(cleaned);
    return Promise.resolve('');
  }
}

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
  res.render('tools/doc-formatter', { title: '文档格式整理 - 在线学术排版工具', error: null, parsed: null });
});

router.post('/', upload.single('doc'), async (req, res) => {
  try {
    if (!req.file) {
      return res.render('tools/doc-formatter', { title: '文档格式整理 - 在线学术排版工具', error: '请上传文件', parsed: null });
    }

    const filePath = req.file.path;
    const ext = path.extname(req.file.originalname).toLowerCase();

    let text = await extractText(filePath, ext);

    fs.unlinkSync(filePath);

    if (!text.trim()) {
      return res.render('tools/doc-formatter', { title: '文档格式整理 - 在线学术排版工具', error: '文件中没有检测到文字内容。WPS 文件请尝试在 WPS 中另存为 .docx 格式后重新上传。', parsed: null });
    }

    // Parse natural language requirements, then let explicit fields override
    const parsed = parseRequirements(req.body.requirements || '');

    const options = {
      bodyFont: req.body.bodyFont || parsed.bodyFont || 'simsun',
      titleFont: req.body.titleFont || parsed.titleFont || 'simhei',
      bodySize: req.body.bodySize || parsed.bodySize || '24',
      titleSize: req.body.titleSize || parsed.titleSize || '44',
      lineSpacing: req.body.lineSpacing || parsed.lineSpacing || '1.5',
      indent: req.body.indent || parsed.indent || 'on',
      margin: req.body.margin || parsed.margin || 'standard',
      titleAlign: req.body.titleAlign || parsed.titleAlign || 'center',
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
    res.render('tools/doc-formatter', { title: '文档格式整理 - 在线学术排版工具', error: '处理失败，请检查文件是否损坏或格式异常', parsed: null });
  }
});

module.exports = router;
