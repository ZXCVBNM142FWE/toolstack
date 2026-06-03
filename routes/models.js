const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");

const DATA = path.join(__dirname, "..", "data");

router.get("/", (req, res) => {
  let providers = [];
  try {
    providers = JSON.parse(fs.readFileSync(path.join(DATA, "providers.json"), "utf8"));
  } catch {}
  res.render("models", {
    title: "模型目录 — API 中转站",
    user: req.session?.user || null,
    providers,
  });
});

module.exports = router;
