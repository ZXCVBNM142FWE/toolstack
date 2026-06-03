const express = require('express');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const { spawn } = require('child_process');
const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
    ];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('只支持 PDF / Word 文件'));
  },
});

function basicAnalysis(text, pages) {
  const words = text.replace(/\s+/g, '').length;
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 50);
  const readTime = Math.max(1, Math.round(words / 500));

  const keySentences = [];
  paragraphs.slice(0, 12).forEach(p => {
    const sentences = p.split(/[。！？.!?]/).filter(s => s.trim().length > 10);
    sentences.slice(0, 2).forEach(s => {
      const clean = s.trim();
      if (clean && clean.length > 10 && clean.length < 200) {
        keySentences.push(clean);
      }
    });
  });

  const kwMap = {};
  const segments = text.replace(/[\r\n\s\d\p{P}]/gu, '').match(/.{2,4}/g) || [];
  segments.forEach(seg => {
    if (/^[一-鿿]+$/.test(seg)) {
      kwMap[seg] = (kwMap[seg] || 0) + 1;
    }
  });
  const keywords = Object.entries(kwMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([word]) => word);

  const questions = keySentences.slice(0, 5).map((s, i) => {
    return s.length > 60 ? s.slice(0, 60) + '...（请简述此观点）' : s + '（请简述此观点）';
  });

  return {
    summary: keySentences.slice(0, 5).join('；'),
    keyPoints: keySentences.slice(0, 8),
    keywords,
    questions,
    pages,
    stats: { wordCount: words, paragraphCount: paragraphs.length, readTime },
  };
}

async function aiAnalysis(text, pages) {
  const prompt = `你是一个学术论文分析助手。请分析以下论文内容，用中文返回 JSON（不要其他文字）：

{
  "summary": "用3-5句话总结论文核心内容",
  "keyPoints": ["关键发现1", "关键发现2", ...最多6条],
  "questions": ["基于论文内容的思考题1", "思考题2", ...最多5条],
  "keywords": ["关键词1", "关键词2", ...最多8个]
}

论文正文（前 12000 字）：
${text.slice(0, 12000)}`;

  return new Promise((resolve, reject) => {
    if (process.env.ANTHROPIC_API_KEY) {
      const https = require('https');
      const body = JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }],
      });
      const req = https.request({
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
      }, res => {
        let data = '';
        res.on('data', d => data += d);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            const content = parsed.content?.[0]?.text || '';
            const json = JSON.parse(content.match(/\{[\s\S]*\}/)?.[0] || '{}');
            resolve({ ...json, pages, stats: basicAnalysis(text, pages).stats });
          } catch {
            resolve(basicAnalysis(text, pages));
          }
        });
      });
      req.on('error', () => resolve(basicAnalysis(text, pages)));
      req.write(body);
      req.end();
      return;
    }

    const proc = spawn('claude', [
      '-p', prompt,
      '--output-format', 'json',
      '--permission-mode', 'bypassPermissions',
    ], {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 60000,
    });

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', d => stdout += d);
    proc.stderr.on('data', d => stderr += d);

    proc.on('close', code => {
      if (code !== 0) {
        console.error('Claude CLI failed:', stderr);
        return resolve(basicAnalysis(text, pages));
      }
      try {
        const result = JSON.parse(stdout);
        const content = result.result || stdout;
        const json = JSON.parse(content.match(/\{[\s\S]*\}/)?.[0] || '{}');
        resolve({ ...json, pages, stats: basicAnalysis(text, pages).stats });
      } catch {
        resolve(basicAnalysis(text, pages));
      }
    });
    proc.on('error', () => resolve(basicAnalysis(text, pages)));
  });
}

function isWord(mimetype) {
  return mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      || mimetype === 'application/msword';
}

async function extractText(file) {
  if (isWord(file.mimetype)) {
    const result = await mammoth.extractRawText({ buffer: file.buffer });
    return result.value;
  }
  // PDF
  const pdfData = await pdfParse(file.buffer);
  return pdfData.text;
}

router.post('/analyze', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '请上传 PDF 或 Word 文件' });

    const text = await extractText(req.file);

    if (!text || text.trim().length < 50) {
      const label = isWord(req.file.mimetype) ? 'Word 文档' : 'PDF';
      return res.json({ error: `未能从${label}提取文字，请确认文件包含可读内容` });
    }

    const result = await aiAnalysis(text, 1);
    res.json(result);
  } catch (err) {
    console.error('File analysis error:', err);
    res.status(500).json({ error: '分析失败: ' + err.message });
  }
});

module.exports = router;
