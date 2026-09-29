#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const css = fs.readFileSync(path.join(root, "css/app.css"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const js = fs.readFileSync(path.join(root, "js/app.js"), "utf8");

function functionBody(source, name) {
  const start = source.indexOf("function " + name + "(");
  if (start < 0) return "";
  const open = source.indexOf("{", start);
  if (open < 0) return "";
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  return "";
}

const fails = [];

if (!css.includes("[hidden]") || !css.includes("display: none !important")) {
  fails.push('css/app.css must contain [hidden] and display: none !important');
}

if (!html.includes('id="listenVoice"')) {
  fails.push('index.html must have id="listenVoice"');
}
if (html.includes('id="replyVoice"')) {
  fails.push('index.html must not have id="replyVoice"');
}
if (!html.includes('id="replyVoices"')) {
  fails.push('index.html must still have id="replyVoices"');
}

const showPair = functionBody(js, "showPair");
if (!showPair || !/\$\("replyText"\)\.textContent\s*=\s*""/.test(showPair)) {
  fails.push('showPair must set replyText textContent to ""');
}

if (js.includes('getElementById("replyVoice")') || js.includes('$("replyVoice")')) {
  fails.push('js/app.js must not reference getElementById("replyVoice") or $("replyVoice")');
}

if (fails.length) {
  fails.forEach((msg) => console.error("FAIL: " + msg));
  process.exit(1);
}

console.log("check_reply_clear: ok");
process.exit(0);
