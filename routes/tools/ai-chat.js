const express = require("express");
const router = express.Router();

router.get("/", (req, res) => {
  res.render("tools/ai-chat", { title: "AI 对话 — API 中转站" });
});

module.exports = router;
