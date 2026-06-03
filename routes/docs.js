const express = require("express");
const router = express.Router();

router.get("/", (req, res) => {
  res.render("docs", {
    title: "API 文档 — API 中转站",
    user: req.session?.user || null,
  });
});

module.exports = router;
