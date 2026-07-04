var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => MemoriaTracker
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var fs = __toESM(require("fs"));
var os = __toESM(require("os"));
var path = __toESM(require("path"));
var MemoriaTracker = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    this.debounceTimer = null;
    this.pendingChanges = /* @__PURE__ */ new Map();
    this.pendingIABlocks = [];
    this.activeFocus = null;
  }
  async onload() {
    console.log("Cargando Memoria Tracker plugin (CRUD + Cursor)...");
    const home = os.homedir();
    this.vaultDiffPath = path.join(home, ".config", "academico-it", "vault_diff.json");
    this.registerEvent(
      this.app.workspace.on("editor-change", (editor, view) => {
        if (view && view.file) {
          const pos = editor.getCursor();
          this.activeFocus = { file: view.file.path, line: pos.line + 1, ch: pos.ch };
          this.scheduleUpdate();
        }
      })
    );
    this.registerEvent(
      this.app.workspace.on("file-open", (file) => {
        if (file) {
          const view = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
          if (view && view.editor) {
            const pos = view.editor.getCursor();
            this.activeFocus = { file: file.path, line: pos.line + 1, ch: pos.ch };
          } else {
            this.activeFocus = { file: file.path, line: 1, ch: 0 };
          }
          this.scheduleUpdate();
        }
      })
    );
    this.registerEvent(this.app.vault.on("create", (file) => this.handleCrud("created", file)));
    this.registerEvent(this.app.vault.on("modify", (file) => this.handleCrud("modified", file)));
    this.registerEvent(this.app.vault.on("delete", (file) => this.handleCrud("deleted", file)));
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
      this.pendingChanges.set(oldPath, { op: "deleted", path: oldPath });
      this.handleCrud("created", file);
    }));
  }
  onunload() {
    console.log("Descargando Memoria Tracker plugin...");
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
  }
  async handleCrud(op, abstractFile) {
    if (this.shouldIgnore(abstractFile.path)) return;
    if (!(abstractFile instanceof import_obsidian.TFile)) return;
    const file = abstractFile;
    let excerpt = "";
    if (op === "created" || op === "modified") {
      try {
        const content = await this.app.vault.cachedRead(file);
        excerpt = content.length > 300 ? content.substring(0, 300) + "..." : content;
        if (op === "modified") {
          this.extractIABlocks(file.path, content);
        }
      } catch (e) {
      }
    }
    this.pendingChanges.set(file.path, { op, path: file.path, excerpt });
    this.scheduleUpdate();
  }
  extractIABlocks(filePath, content) {
    const lines = content.split("\n");
    const regex = /\/ia\(['"]([^'"]+)['"]\)/;
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(regex);
      if (m && m.length > 1) {
        this.pendingIABlocks.push({ file: filePath, line: i + 1, prompt: m[1] });
      }
    }
  }
  shouldIgnore(filePath) {
    const parts = filePath.split("/");
    if (parts.includes(".obsidian") || parts.includes(".git") || parts.includes(".trash")) return true;
    const base = path.basename(filePath);
    if (base.startsWith(".") || base.endsWith("~") || base.endsWith(".tmp")) return true;
    if (!base.endsWith(".md")) return true;
    return false;
  }
  scheduleUpdate() {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.flushToMailbox(), 500);
  }
  flushToMailbox() {
    try {
      let data = { ts: (/* @__PURE__ */ new Date()).toISOString(), vault: "", changes: [], ia_blocks: [], activeFocus: null };
      if (fs.existsSync(this.vaultDiffPath)) {
        try {
          data = JSON.parse(fs.readFileSync(this.vaultDiffPath, "utf8"));
        } catch (e) {
        }
      }
      const mergedChanges = [...data.changes || []];
      for (const change of this.pendingChanges.values()) {
        mergedChanges.push(change);
      }
      const mergedBlocks = [...data.ia_blocks || [], ...this.pendingIABlocks];
      const payload = {
        ts: (/* @__PURE__ */ new Date()).toISOString(),
        vault: this.app.vault.adapter.basePath || "",
        changes: mergedChanges,
        ia_blocks: mergedBlocks,
        activeFocus: this.activeFocus || data.activeFocus
      };
      fs.mkdirSync(path.dirname(this.vaultDiffPath), { recursive: true });
      fs.writeFileSync(this.vaultDiffPath, JSON.stringify(payload, null, 2), "utf8");
      this.pendingChanges.clear();
      this.pendingIABlocks = [];
    } catch (err) {
      console.error("Error escribiendo al buz\xF3n:", err);
    }
  }
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsibWFpbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0IHsgUGx1Z2luLCBFZGl0b3IsIE1hcmtkb3duVmlldywgVEZpbGUsIFRBYnN0cmFjdEZpbGUgfSBmcm9tICdvYnNpZGlhbic7XG5pbXBvcnQgKiBhcyBmcyBmcm9tICdmcyc7XG5pbXBvcnQgKiBhcyBvcyBmcm9tICdvcyc7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBNZW1vcmlhVHJhY2tlciBleHRlbmRzIFBsdWdpbiB7XG5cdHByaXZhdGUgZGVib3VuY2VUaW1lcjogTm9kZUpTLlRpbWVvdXQgfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSB2YXVsdERpZmZQYXRoOiBzdHJpbmc7XG5cdHByaXZhdGUgcGVuZGluZ0NoYW5nZXM6IE1hcDxzdHJpbmcsIGFueT4gPSBuZXcgTWFwKCk7XG5cdHByaXZhdGUgcGVuZGluZ0lBQmxvY2tzOiBhbnlbXSA9IFtdO1xuXHRwcml2YXRlIGFjdGl2ZUZvY3VzOiBhbnkgPSBudWxsO1xuXG5cdGFzeW5jIG9ubG9hZCgpIHtcblx0XHRjb25zb2xlLmxvZygnQ2FyZ2FuZG8gTWVtb3JpYSBUcmFja2VyIHBsdWdpbiAoQ1JVRCArIEN1cnNvcikuLi4nKTtcblx0XHRcblx0XHRjb25zdCBob21lID0gb3MuaG9tZWRpcigpO1xuXHRcdHRoaXMudmF1bHREaWZmUGF0aCA9IHBhdGguam9pbihob21lLCAnLmNvbmZpZycsICdhY2FkZW1pY28taXQnLCAndmF1bHRfZGlmZi5qc29uJyk7XG5cblx0XHQvLyBDdXJzb3IgdHJhY2tpbmdcblx0XHR0aGlzLnJlZ2lzdGVyRXZlbnQoXG5cdFx0XHR0aGlzLmFwcC53b3Jrc3BhY2Uub24oJ2VkaXRvci1jaGFuZ2UnLCAoZWRpdG9yOiBFZGl0b3IsIHZpZXc6IE1hcmtkb3duVmlldykgPT4ge1xuXHRcdFx0XHRpZiAodmlldyAmJiB2aWV3LmZpbGUpIHtcblx0XHRcdFx0XHRjb25zdCBwb3MgPSBlZGl0b3IuZ2V0Q3Vyc29yKCk7XG5cdFx0XHRcdFx0dGhpcy5hY3RpdmVGb2N1cyA9IHsgZmlsZTogdmlldy5maWxlLnBhdGgsIGxpbmU6IHBvcy5saW5lICsgMSwgY2g6IHBvcy5jaCB9O1xuXHRcdFx0XHRcdHRoaXMuc2NoZWR1bGVVcGRhdGUoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSlcblx0XHQpO1xuXHRcdHRoaXMucmVnaXN0ZXJFdmVudChcblx0XHRcdHRoaXMuYXBwLndvcmtzcGFjZS5vbignZmlsZS1vcGVuJywgKGZpbGU6IFRGaWxlIHwgbnVsbCkgPT4ge1xuXHRcdFx0XHRpZiAoZmlsZSkge1xuXHRcdFx0XHRcdGNvbnN0IHZpZXcgPSB0aGlzLmFwcC53b3Jrc3BhY2UuZ2V0QWN0aXZlVmlld09mVHlwZShNYXJrZG93blZpZXcpO1xuXHRcdFx0XHRcdGlmICh2aWV3ICYmIHZpZXcuZWRpdG9yKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBwb3MgPSB2aWV3LmVkaXRvci5nZXRDdXJzb3IoKTtcblx0XHRcdFx0XHRcdHRoaXMuYWN0aXZlRm9jdXMgPSB7IGZpbGU6IGZpbGUucGF0aCwgbGluZTogcG9zLmxpbmUgKyAxLCBjaDogcG9zLmNoIH07XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHRoaXMuYWN0aXZlRm9jdXMgPSB7IGZpbGU6IGZpbGUucGF0aCwgbGluZTogMSwgY2g6IDAgfTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dGhpcy5zY2hlZHVsZVVwZGF0ZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KVxuXHRcdCk7XG5cblx0XHQvLyBDUlVEIHRyYWNraW5nXG5cdFx0dGhpcy5yZWdpc3RlckV2ZW50KHRoaXMuYXBwLnZhdWx0Lm9uKCdjcmVhdGUnLCAoZmlsZTogVEFic3RyYWN0RmlsZSkgPT4gdGhpcy5oYW5kbGVDcnVkKCdjcmVhdGVkJywgZmlsZSkpKTtcblx0XHR0aGlzLnJlZ2lzdGVyRXZlbnQodGhpcy5hcHAudmF1bHQub24oJ21vZGlmeScsIChmaWxlOiBUQWJzdHJhY3RGaWxlKSA9PiB0aGlzLmhhbmRsZUNydWQoJ21vZGlmaWVkJywgZmlsZSkpKTtcblx0XHR0aGlzLnJlZ2lzdGVyRXZlbnQodGhpcy5hcHAudmF1bHQub24oJ2RlbGV0ZScsIChmaWxlOiBUQWJzdHJhY3RGaWxlKSA9PiB0aGlzLmhhbmRsZUNydWQoJ2RlbGV0ZWQnLCBmaWxlKSkpO1xuXHRcdHRoaXMucmVnaXN0ZXJFdmVudCh0aGlzLmFwcC52YXVsdC5vbigncmVuYW1lJywgKGZpbGU6IFRBYnN0cmFjdEZpbGUsIG9sZFBhdGg6IHN0cmluZykgPT4ge1xuXHRcdFx0dGhpcy5wZW5kaW5nQ2hhbmdlcy5zZXQob2xkUGF0aCwgeyBvcDogJ2RlbGV0ZWQnLCBwYXRoOiBvbGRQYXRoIH0pO1xuXHRcdFx0dGhpcy5oYW5kbGVDcnVkKCdjcmVhdGVkJywgZmlsZSk7XG5cdFx0fSkpO1xuXHR9XG5cblx0b251bmxvYWQoKSB7XG5cdFx0Y29uc29sZS5sb2coJ0Rlc2NhcmdhbmRvIE1lbW9yaWEgVHJhY2tlciBwbHVnaW4uLi4nKTtcblx0XHRpZiAodGhpcy5kZWJvdW5jZVRpbWVyKSBjbGVhclRpbWVvdXQodGhpcy5kZWJvdW5jZVRpbWVyKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgaGFuZGxlQ3J1ZChvcDogc3RyaW5nLCBhYnN0cmFjdEZpbGU6IFRBYnN0cmFjdEZpbGUpIHtcblx0XHRpZiAodGhpcy5zaG91bGRJZ25vcmUoYWJzdHJhY3RGaWxlLnBhdGgpKSByZXR1cm47XG5cdFx0aWYgKCEoYWJzdHJhY3RGaWxlIGluc3RhbmNlb2YgVEZpbGUpKSByZXR1cm47XG5cblx0XHRjb25zdCBmaWxlID0gYWJzdHJhY3RGaWxlIGFzIFRGaWxlO1xuXHRcdGxldCBleGNlcnB0ID0gJyc7XG5cblx0XHRpZiAob3AgPT09ICdjcmVhdGVkJyB8fCBvcCA9PT0gJ21vZGlmaWVkJykge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMuYXBwLnZhdWx0LmNhY2hlZFJlYWQoZmlsZSk7XG5cdFx0XHRcdGV4Y2VycHQgPSBjb250ZW50Lmxlbmd0aCA+IDMwMCA/IGNvbnRlbnQuc3Vic3RyaW5nKDAsIDMwMCkgKyAnLi4uJyA6IGNvbnRlbnQ7XG5cdFx0XHRcdFxuXHRcdFx0XHRpZiAob3AgPT09ICdtb2RpZmllZCcpIHtcblx0XHRcdFx0XHR0aGlzLmV4dHJhY3RJQUJsb2NrcyhmaWxlLnBhdGgsIGNvbnRlbnQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoKGUpIHt9XG5cdFx0fVxuXG5cdFx0dGhpcy5wZW5kaW5nQ2hhbmdlcy5zZXQoZmlsZS5wYXRoLCB7IG9wLCBwYXRoOiBmaWxlLnBhdGgsIGV4Y2VycHQgfSk7XG5cdFx0dGhpcy5zY2hlZHVsZVVwZGF0ZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBleHRyYWN0SUFCbG9ja3MoZmlsZVBhdGg6IHN0cmluZywgY29udGVudDogc3RyaW5nKSB7XG5cdFx0Y29uc3QgbGluZXMgPSBjb250ZW50LnNwbGl0KCdcXG4nKTtcblx0XHRjb25zdCByZWdleCA9IC9cXC9pYVxcKFsnXCJdKFteJ1wiXSspWydcIl1cXCkvO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgbGluZXMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IG0gPSBsaW5lc1tpXS5tYXRjaChyZWdleCk7XG5cdFx0XHRpZiAobSAmJiBtLmxlbmd0aCA+IDEpIHtcblx0XHRcdFx0dGhpcy5wZW5kaW5nSUFCbG9ja3MucHVzaCh7IGZpbGU6IGZpbGVQYXRoLCBsaW5lOiBpICsgMSwgcHJvbXB0OiBtWzFdIH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc2hvdWxkSWdub3JlKGZpbGVQYXRoOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRjb25zdCBwYXJ0cyA9IGZpbGVQYXRoLnNwbGl0KCcvJyk7XG5cdFx0aWYgKHBhcnRzLmluY2x1ZGVzKCcub2JzaWRpYW4nKSB8fCBwYXJ0cy5pbmNsdWRlcygnLmdpdCcpIHx8IHBhcnRzLmluY2x1ZGVzKCcudHJhc2gnKSkgcmV0dXJuIHRydWU7XG5cdFx0Y29uc3QgYmFzZSA9IHBhdGguYmFzZW5hbWUoZmlsZVBhdGgpO1xuXHRcdGlmIChiYXNlLnN0YXJ0c1dpdGgoJy4nKSB8fCBiYXNlLmVuZHNXaXRoKCd+JykgfHwgYmFzZS5lbmRzV2l0aCgnLnRtcCcpKSByZXR1cm4gdHJ1ZTtcblx0XHRpZiAoIWJhc2UuZW5kc1dpdGgoJy5tZCcpKSByZXR1cm4gdHJ1ZTtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIHNjaGVkdWxlVXBkYXRlKCkge1xuXHRcdGlmICh0aGlzLmRlYm91bmNlVGltZXIpIGNsZWFyVGltZW91dCh0aGlzLmRlYm91bmNlVGltZXIpO1xuXHRcdHRoaXMuZGVib3VuY2VUaW1lciA9IHNldFRpbWVvdXQoKCkgPT4gdGhpcy5mbHVzaFRvTWFpbGJveCgpLCA1MDApO1xuXHR9XG5cblx0cHJpdmF0ZSBmbHVzaFRvTWFpbGJveCgpIHtcblx0XHR0cnkge1xuXHRcdFx0bGV0IGRhdGEgPSB7IHRzOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksIHZhdWx0OiAnJywgY2hhbmdlczogW10gYXMgYW55W10sIGlhX2Jsb2NrczogW10gYXMgYW55W10sIGFjdGl2ZUZvY3VzOiBudWxsIGFzIGFueSB9O1xuXHRcdFx0XG5cdFx0XHRpZiAoZnMuZXhpc3RzU3luYyh0aGlzLnZhdWx0RGlmZlBhdGgpKSB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0ZGF0YSA9IEpTT04ucGFyc2UoZnMucmVhZEZpbGVTeW5jKHRoaXMudmF1bHREaWZmUGF0aCwgJ3V0ZjgnKSk7XG5cdFx0XHRcdH0gY2F0Y2ggKGUpIHt9XG5cdFx0XHR9XG5cblx0XHRcdC8vIE1lcmdlIGNoYW5nZXNcblx0XHRcdGNvbnN0IG1lcmdlZENoYW5nZXMgPSBbLi4uKGRhdGEuY2hhbmdlcyB8fCBbXSldO1xuXHRcdFx0Zm9yIChjb25zdCBjaGFuZ2Ugb2YgdGhpcy5wZW5kaW5nQ2hhbmdlcy52YWx1ZXMoKSkge1xuXHRcdFx0XHRtZXJnZWRDaGFuZ2VzLnB1c2goY2hhbmdlKTtcblx0XHRcdH1cblx0XHRcdFxuXHRcdFx0Ly8gTWVyZ2UgYmxvY2tzXG5cdFx0XHRjb25zdCBtZXJnZWRCbG9ja3MgPSBbLi4uKGRhdGEuaWFfYmxvY2tzIHx8IFtdKSwgLi4udGhpcy5wZW5kaW5nSUFCbG9ja3NdO1xuXG5cdFx0XHRjb25zdCBwYXlsb2FkID0ge1xuXHRcdFx0XHR0czogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuXHRcdFx0XHR2YXVsdDogKHRoaXMuYXBwLnZhdWx0LmFkYXB0ZXIgYXMgYW55KS5iYXNlUGF0aCB8fCAnJyxcblx0XHRcdFx0Y2hhbmdlczogbWVyZ2VkQ2hhbmdlcyxcblx0XHRcdFx0aWFfYmxvY2tzOiBtZXJnZWRCbG9ja3MsXG5cdFx0XHRcdGFjdGl2ZUZvY3VzOiB0aGlzLmFjdGl2ZUZvY3VzIHx8IGRhdGEuYWN0aXZlRm9jdXNcblx0XHRcdH07XG5cblx0XHRcdGZzLm1rZGlyU3luYyhwYXRoLmRpcm5hbWUodGhpcy52YXVsdERpZmZQYXRoKSwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG5cdFx0XHRmcy53cml0ZUZpbGVTeW5jKHRoaXMudmF1bHREaWZmUGF0aCwgSlNPTi5zdHJpbmdpZnkocGF5bG9hZCwgbnVsbCwgMiksICd1dGY4Jyk7XG5cblx0XHRcdC8vIENsZWFyIHBlbmRpbmdcblx0XHRcdHRoaXMucGVuZGluZ0NoYW5nZXMuY2xlYXIoKTtcblx0XHRcdHRoaXMucGVuZGluZ0lBQmxvY2tzID0gW107XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRjb25zb2xlLmVycm9yKCdFcnJvciBlc2NyaWJpZW5kbyBhbCBidXpcdTAwRjNuOicsIGVycik7XG5cdFx0fVxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxzQkFBbUU7QUFD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
