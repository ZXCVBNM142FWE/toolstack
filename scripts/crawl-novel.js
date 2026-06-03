const { crawl } = require('./novel-lib');

// CLI
if (require.main === module) {
  const [,, indexUrl, slug, concurrency] = process.argv;
  if (!indexUrl || !slug) {
    console.log('用法: node scripts/crawl-novel.js <index-url> <slug> [concurrency]');
    console.log('示例: node scripts/crawl-novel.js http://www.leshugu.info/html/0/626/ 蛊真人 3');
    process.exit(1);
  }
  const opts = {};
  if (concurrency) opts.concurrency = parseInt(concurrency, 10) || 3;
  crawl(indexUrl, slug, opts).catch(e => { console.error('\n❌ 错误:', e.message); process.exit(1); });
}

module.exports = { crawl };
