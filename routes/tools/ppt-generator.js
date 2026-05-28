const express = require('express');
const router = express.Router();
const pptxgen = require('pptxgenjs');

const TEMPLATES = [
  {
    id: 'business-blue',
    name: '商务蓝',
    category: 'domestic',
    desc: '经典深蓝商务风，适合公司汇报、项目提案',
    bg: '1B3A5C', titleColor: 'FFFFFF', bodyColor: 'D4E4F7',
    accent: '3B82F6', accent2: '60A5FA',
    titleFont: 'Microsoft YaHei', bodyFont: 'Microsoft YaHei',
  },
  {
    id: 'gov-red',
    name: '党政红',
    category: 'domestic',
    desc: '庄重红色主题，适合党建汇报、思政演示',
    bg: 'FFF5F5', titleColor: 'C41E3A', bodyColor: '333333',
    accent: 'C41E3A', accent2: 'E8475F',
    titleFont: 'SimHei', bodyFont: 'SimSun',
  },
  {
    id: 'academic-gray',
    name: '学术灰',
    category: 'domestic',
    desc: '简洁灰白配色，适合学术报告、论文答辩',
    bg: 'FFFFFF', titleColor: '2C3E50', bodyColor: '555555',
    accent: '7F8C8D', accent2: 'BDC3C7',
    titleFont: 'SimHei', bodyFont: 'SimSun',
  },
  {
    id: 'tech-cyan',
    name: '科技深蓝',
    category: 'domestic',
    desc: '深蓝+青蓝渐变感，适合技术分享、产品发布',
    bg: '0F172A', titleColor: '38BDF8', bodyColor: 'CBD5E1',
    accent: '0EA5E9', accent2: '7DD3FC',
    titleFont: 'Microsoft YaHei', bodyFont: 'Microsoft YaHei',
  },
  {
    id: 'fresh-green',
    name: '清新绿',
    category: 'domestic',
    desc: '柔和绿色主题，适合教育培训、健康医疗',
    bg: 'F0FDF4', titleColor: '166534', bodyColor: '444444',
    accent: '22C55E', accent2: '86EFAC',
    titleFont: 'Microsoft YaHei', bodyFont: 'Microsoft YaHei',
  },
  {
    id: 'minimal-white',
    name: '极简白',
    category: 'domestic',
    desc: '纯白底色+细线装饰，适合创意提案、设计展示',
    bg: 'FFFFFF', titleColor: '18181B', bodyColor: '71717A',
    accent: '18181B', accent2: 'D4D4D8',
    titleFont: 'Microsoft YaHei', bodyFont: 'Microsoft YaHei',
  },
  {
    id: 'modern-dark',
    name: 'Modern Dark',
    category: 'international',
    desc: 'Dark background + gold accents, for keynotes & pitches',
    bg: '171717', titleColor: 'FACC15', bodyColor: 'D4D4D4',
    accent: 'EAB308', accent2: 'FDE047',
    titleFont: 'Arial', bodyFont: 'Arial',
  },
  {
    id: 'corporate-navy',
    name: 'Corporate Navy',
    category: 'international',
    desc: 'Navy + white McKinsey-style, for consulting & strategy decks',
    bg: 'FFFFFF', titleColor: '1E3A5F', bodyColor: '475569',
    accent: '2563EB', accent2: '93C5FD',
    titleFont: 'Arial', bodyFont: 'Arial',
  },
  {
    id: 'apple-minimal',
    name: 'Apple Minimal',
    category: 'international',
    desc: 'Black & white high contrast, keynote presentation style',
    bg: '000000', titleColor: 'FFFFFF', bodyColor: 'A1A1AA',
    accent: 'FFFFFF', accent2: '52525B',
    titleFont: 'Arial', bodyFont: 'Arial',
  },
  {
    id: 'creative-orange',
    name: 'Creative Pop',
    category: 'international',
    desc: 'Bold orange + charcoal, for startup pitches & creative decks',
    bg: '1C1917', titleColor: 'FB923C', bodyColor: 'D6D3D1',
    accent: 'F97316', accent2: 'FDBA74',
    titleFont: 'Arial', bodyFont: 'Arial',
  },
  {
    id: 'gradient-violet',
    name: 'Gradient Violet',
    category: 'international',
    desc: 'Rich purple tones, for brand & marketing presentations',
    bg: '2E1065', titleColor: 'E9D5FF', bodyColor: 'C4B5FD',
    accent: 'A855F7', accent2: 'D8B4FE',
    titleFont: 'Arial', bodyFont: 'Arial',
  },
  {
    id: 'warm-earth',
    name: 'Warm Earth',
    category: 'international',
    desc: 'Warm brown & beige, for storytelling & personal presentations',
    bg: 'FFFBEB', titleColor: '78350F', bodyColor: '57534E',
    accent: 'D97706', accent2: 'FCD34D',
    titleFont: 'Georgia', bodyFont: 'Georgia',
  },
  {
    id: 'china-chic',
    name: '国潮红金',
    category: 'domestic',
    desc: '朱砂红+烫金，传统与现代碰撞，适合文化展示、品牌国风',
    bg: 'FFF8F0', titleColor: 'B91C1C', bodyColor: '4A3030',
    accent: 'CA8A04', accent2: 'FDE68A',
    titleFont: 'SimHei', bodyFont: 'SimSun',
  },
  {
    id: 'campus-defense',
    name: '校园答辩',
    category: 'domestic',
    desc: '清新蓝白配色，简洁大方，适合毕业答辩、课题汇报',
    bg: 'F0F9FF', titleColor: '0369A1', bodyColor: '334155',
    accent: '0EA5E9', accent2: '7DD3FC',
    titleFont: 'Microsoft YaHei', bodyFont: 'Microsoft YaHei',
  },
  {
    id: 'morandi',
    name: '莫兰迪色',
    category: 'domestic',
    desc: '低饱和高级灰调，温柔克制，适合文艺汇报、生活美学',
    bg: 'F5F0EC', titleColor: '5C4B3E', bodyColor: '78716C',
    accent: 'A8957E', accent2: 'D6CCC0',
    titleFont: 'Microsoft YaHei', bodyFont: 'Microsoft YaHei',
  },
  {
    id: 'magazine',
    name: '杂志排版',
    category: 'domestic',
    desc: '大字+强对比，设计感十足，适合创意提案、品牌策划',
    bg: 'FAFAFA', titleColor: '18181B', bodyColor: '52525B',
    accent: '18181B', accent2: 'E4E4E7',
    titleFont: 'SimHei', bodyFont: 'Microsoft YaHei',
  },
  {
    id: 'black-gold',
    name: '黑金奢华',
    category: 'domestic',
    desc: '纯黑底色+金色点缀，高端大气，适合发布会、年度盛典',
    bg: '0C0A09', titleColor: 'F5B041', bodyColor: 'D4D4D4',
    accent: 'F5B041', accent2: 'F7DC6F',
    titleFont: 'Microsoft YaHei', bodyFont: 'Microsoft YaHei',
  },
  {
    id: 'cyberpunk',
    name: '赛博朋克',
    category: 'international',
    desc: '霓虹紫+赛博青，科幻感拉满，适合游戏/科技/Web3 pitch',
    bg: '0A0A1A', titleColor: 'C084FC', bodyColor: '94A3B8',
    accent: 'A855F7', accent2: '06B6D4',
    titleFont: 'Arial', bodyFont: 'Arial',
  },
  {
    id: 'japanese-zen',
    name: '日系侘寂',
    category: 'international',
    desc: '米白+樱花粉，侘寂美学，适合生活品牌、文艺分享',
    bg: 'FFFBF9', titleColor: '4A4A4A', bodyColor: '78716C',
    accent: 'F4A7B9', accent2: 'FCE4EC',
    titleFont: 'Arial', bodyFont: 'Arial',
  },
  {
    id: 'startup-pitch',
    name: '创业路演',
    category: 'international',
    desc: '白底+活力撞色，Y Combinator 风格，适合融资路演、创业大赛',
    bg: 'FFFFFF', titleColor: '18181B', bodyColor: '52525B',
    accent: 'FF6B35', accent2: 'FDC500',
    titleFont: 'Arial', bodyFont: 'Arial',
  },
  {
    id: 'deep-space',
    name: '深空科技',
    category: 'international',
    desc: '深邃太空黑+科技蓝光，未来感，适合 AI/航天/前沿科技',
    bg: '020617', titleColor: '38BDF8', bodyColor: '94A3B8',
    accent: '0EA5E9', accent2: '0284C7',
    titleFont: 'Arial', bodyFont: 'Arial',
  },
  {
    id: 'gradient-pop',
    name: '渐变流行',
    category: 'international',
    desc: '紫粉渐变色，年轻化潮流，适合 Z世代品牌、社交营销',
    bg: 'FFFFFF', titleColor: '6D28D9', bodyColor: '4B5563',
    accent: 'EC4899', accent2: '8B5CF6',
    titleFont: 'Arial', bodyFont: 'Arial',
  },
  {
    id: 'defense-white',
    name: '素白答辩',
    category: 'domestic',
    desc: '纯白极简，细灰线装饰，适合本科/硕士论文答辩',
    bg: 'FFFFFF', titleColor: '1E293B', bodyColor: '475569',
    accent: '64748B', accent2: 'CBD5E1',
    titleFont: 'SimHei', bodyFont: 'Microsoft YaHei',
  },
  {
    id: 'defense-blue',
    name: '浅蓝学术',
    category: 'domestic',
    desc: '淡蓝点缀+留白，知性冷静，适合理工科答辩',
    bg: 'F8FAFC', titleColor: '1E40AF', bodyColor: '334155',
    accent: '3B82F6', accent2: 'BFDBFE',
    titleFont: 'SimHei', bodyFont: 'Microsoft YaHei',
  },
  {
    id: 'defense-cream',
    name: '淡米简约',
    category: 'domestic',
    desc: '温暖米白底+深棕字，柔和舒适，适合文科/社科答辩',
    bg: 'FFFCF7', titleColor: '3E2723', bodyColor: '5D4037',
    accent: '8D6E63', accent2: 'D7CCC8',
    titleFont: 'SimHei', bodyFont: 'Microsoft YaHei',
  },
  {
    id: 'defense-purple',
    name: '紫韵学术',
    category: 'domestic',
    desc: '清华紫+简洁排版，典雅庄重，适合博士/博士后答辩',
    bg: 'FAFAFE', titleColor: '4C1D95', bodyColor: '374151',
    accent: '7C3AED', accent2: 'DDD6FE',
    titleFont: 'SimHei', bodyFont: 'Microsoft YaHei',
  },
  {
    id: 'defense-gray',
    name: '浅灰极简',
    category: 'domestic',
    desc: '微灰底+深灰字，零干扰设计，适合工程/建筑答辩',
    bg: 'F5F5F5', titleColor: '171717', bodyColor: '525252',
    accent: '737373', accent2: 'D4D4D4',
    titleFont: 'SimHei', bodyFont: 'Microsoft YaHei',
  },
  {
    id: 'defense-green',
    name: '墨绿学院',
    category: 'domestic',
    desc: '深绿+白底，学院派经典，适合医学/生物/农林答辩',
    bg: 'FFFFFF', titleColor: '14532D', bodyColor: '374151',
    accent: '16A34A', accent2: 'BBF7D0',
    titleFont: 'SimHei', bodyFont: 'Microsoft YaHei',
  },
];

function parseOutline(text) {
  const lines = text.split('\n').filter(l => l.trim());
  const slides = [];
  let current = null;

  lines.forEach(line => {
    const isSub = line.startsWith('  ') || line.startsWith('\t');
    const content = line.trim();
    if (!content) return;

    if (!isSub) {
      current = { title: content, bullets: [] };
      slides.push(current);
    } else if (current) {
      current.bullets.push(content);
    }
  });

  return slides;
}

function generatePptx(slides, tpl) {
  const pres = new pptxgen();
  pres.layout = 'LAYOUT_WIDE';

  slides.forEach(slide => {
    const s = pres.addSlide();
    s.background = { color: tpl.bg };

    s.addText(slide.title, {
      x: 0.8, y: 0.5, w: 11.4, h: 1.0,
      fontSize: 32, fontFace: tpl.titleFont, color: tpl.titleColor, bold: true,
    });

    s.addShape(pres.ShapeType.rect, {
      x: 0.8, y: 1.55, w: 1.2, h: 0.06,
      fill: { color: tpl.accent },
    });

    if (slide.bullets.length > 0) {
      const items = slide.bullets.map(b => ({
        text: b, options: {
          fontSize: 18, fontFace: tpl.bodyFont, color: tpl.bodyColor,
          bullet: { color: tpl.accent2, type: 'bullet' },
          paragraphSpacing: 8,
        }
      }));
      s.addText(items, { x: 0.8, y: 2.0, w: 11.4, h: 4.5, valign: 'top' });
    }
  });

  return pres;
}

router.get('/', (req, res) => {
  res.render('tools/ppt-generator', { title: 'PPT 生成器 - 免费在线 PPT 制作工具', templates: TEMPLATES, error: null });
});

router.post('/', async (req, res) => {
  try {
    const { outline, templateId } = req.body;
    if (!outline || !outline.trim()) {
      return res.render('tools/ppt-generator', { title: 'PPT 生成器 - 免费在线 PPT 制作工具', templates: TEMPLATES, error: '请输入 PPT 大纲内容' });
    }

    const slides = parseOutline(outline.trim());
    if (slides.length === 0) {
      return res.render('tools/ppt-generator', { title: 'PPT 生成器 - 免费在线 PPT 制作工具', templates: TEMPLATES, error: '未识别到有效幻灯片，请检查格式' });
    }

    const tpl = TEMPLATES.find(t => t.id === templateId) || TEMPLATES[0];
    const pres = generatePptx(slides, tpl);

    const buffer = await pres.write({ outputType: 'nodebuffer' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
    res.setHeader('Content-Disposition', 'attachment; filename="presentation.pptx"');
    res.send(buffer);
  } catch (err) {
    console.error('ppt-generator error:', err.message);
    res.render('tools/ppt-generator', { title: 'PPT 生成器 - 免费在线 PPT 制作工具', templates: TEMPLATES, error: '生成失败：' + err.message });
  }
});

module.exports = router;
