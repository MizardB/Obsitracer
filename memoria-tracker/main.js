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
    this.focusDebounceTimer = null;
    this.crudDebounceTimer = null;
    this.pendingChanges = /* @__PURE__ */ new Map();
    this.pendingIABlocks = [];
    this.activeFocus = null;
  }
  async onload() {
    console.log("Cargando Memoria Tracker plugin (Multi-Vault)...");
    this.vaultName = this.app.vault.getName();
    const baseDir = path.join(os.homedir(), ".config", "obsidian-copilot");
    this.focusPath = path.join(baseDir, "active_focus.json");
    this.crudMailboxPath = path.join(baseDir, "vaults", `${this.vaultName}.json`);
    const updateCursor = () => {
      const activeFile = this.app.workspace.getActiveFile();
      if (activeFile) {
        let line = 1;
        let ch = 0;
        const view = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
        if (view && view.file && view.file.path === activeFile.path && view.editor) {
          const pos = view.editor.getCursor();
          line = pos.line + 1;
          ch = pos.ch;
        }
        this.activeFocus = { file: activeFile.path, line, ch };
      }
      this.scheduleFocusUpdate();
    };
    const scheduleUpdate = () => {
      setTimeout(updateCursor, 100);
    };
    this.registerDomEvent(document, "mousedown", scheduleUpdate);
    this.registerDomEvent(document, "keyup", scheduleUpdate);
    this.registerDomEvent(window, "focus", scheduleUpdate);
    this.registerDomEvent(document.body, "mouseenter", scheduleUpdate);
    this.registerDomEvent(document, "visibilitychange", () => {
      if (!document.hidden) scheduleUpdate();
    });
    this.registerInterval(
      window.setInterval(() => {
        if (document.hasFocus()) {
          scheduleUpdate();
        }
      }, 2e3)
    );
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => {
        scheduleUpdate();
      })
    );
    this.registerEvent(
      this.app.workspace.on("editor-change", (editor, view) => {
        if (view && view.file) {
          const pos = editor.getCursor();
          this.activeFocus = { file: view.file.path, line: pos.line + 1, ch: pos.ch };
          this.scheduleFocusUpdate();
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
          this.scheduleFocusUpdate();
        }
      })
    );
    this.registerEvent(this.app.vault.on("create", (file) => this.handleCrud("created", file)));
    this.registerEvent(this.app.vault.on("modify", (file) => this.handleCrud("modified", file)));
    this.registerEvent(this.app.vault.on("delete", (file) => this.handleCrud("deleted", file)));
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
      this.pendingChanges.set(oldPath, { op: "deleted", path: oldPath });
      this.handleCrud("created", file);
      if (this.activeFocus && this.activeFocus.file === oldPath) {
        this.activeFocus.file = file.path;
        this.scheduleFocusUpdate();
      }
    }));
  }
  onunload() {
    console.log("Descargando Memoria Tracker plugin...");
    if (this.focusDebounceTimer) clearTimeout(this.focusDebounceTimer);
    if (this.crudDebounceTimer) clearTimeout(this.crudDebounceTimer);
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
          this.extractIABlocks(file, content);
        }
      } catch (e) {
      }
    }
    this.pendingChanges.set(file.path, { op, path: file.path, excerpt });
    this.scheduleCrudUpdate();
  }
  extractIABlocks(file, content) {
    const lines = content.split("\n");
    const regex = /\/ia\(['"]([^'"]+)['"]\)/;
    let hasMatch = false;
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(regex);
      if (m && m.length > 1) {
        this.pendingIABlocks.push({ file: file.path, line: i + 1, prompt: m[1] });
        hasMatch = true;
      }
    }
    if (hasMatch) {
      this.app.vault.process(file, (data) => {
        const dataLines = data.split("\n");
        for (let i = 0; i < dataLines.length; i++) {
          if (regex.test(dataLines[i])) {
            dataLines[i] = dataLines[i].replace(regex, "").trim();
          }
        }
        return dataLines.join("\n");
      }).catch((e) => console.error(e));
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
  scheduleFocusUpdate() {
    if (this.focusDebounceTimer) clearTimeout(this.focusDebounceTimer);
    this.focusDebounceTimer = setTimeout(() => this.flushFocus(), 100);
  }
  scheduleCrudUpdate() {
    if (this.crudDebounceTimer) clearTimeout(this.crudDebounceTimer);
    this.crudDebounceTimer = setTimeout(() => this.flushCrud(), 500);
  }
  flushFocus() {
    try {
      if (!this.activeFocus) return;
      const payload = {
        ts: (/* @__PURE__ */ new Date()).toISOString(),
        vault: this.vaultName,
        vaultPath: this.app.vault.adapter.basePath || "",
        focus: this.activeFocus
      };
      fs.mkdirSync(path.dirname(this.focusPath), { recursive: true });
      fs.writeFileSync(this.focusPath, JSON.stringify(payload, null, 2), "utf8");
    } catch (e) {
      console.error("Error actualizando focus:", e);
    }
  }
  flushCrud() {
    try {
      let data = { ts: (/* @__PURE__ */ new Date()).toISOString(), vault: "", changes: [], ia_blocks: [] };
      if (fs.existsSync(this.crudMailboxPath)) {
        try {
          data = JSON.parse(fs.readFileSync(this.crudMailboxPath, "utf8"));
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
        ia_blocks: mergedBlocks
      };
      fs.mkdirSync(path.dirname(this.crudMailboxPath), { recursive: true });
      fs.writeFileSync(this.crudMailboxPath, JSON.stringify(payload, null, 2), "utf8");
      this.pendingChanges.clear();
      this.pendingIABlocks = [];
    } catch (err) {
      console.error("Error escribiendo al buz\xF3n CRUD:", err);
    }
  }
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsibWFpbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0IHsgUGx1Z2luLCBFZGl0b3IsIE1hcmtkb3duVmlldywgVEZpbGUsIFRBYnN0cmFjdEZpbGUgfSBmcm9tICdvYnNpZGlhbic7XG5pbXBvcnQgKiBhcyBmcyBmcm9tICdmcyc7XG5pbXBvcnQgKiBhcyBvcyBmcm9tICdvcyc7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBNZW1vcmlhVHJhY2tlciBleHRlbmRzIFBsdWdpbiB7XG5cdHByaXZhdGUgZm9jdXNEZWJvdW5jZVRpbWVyOiBOb2RlSlMuVGltZW91dCB8IG51bGwgPSBudWxsO1xuXHRwcml2YXRlIGNydWREZWJvdW5jZVRpbWVyOiBOb2RlSlMuVGltZW91dCB8IG51bGwgPSBudWxsO1xuXHRwcml2YXRlIGZvY3VzUGF0aDogc3RyaW5nO1xuXHRwcml2YXRlIGNydWRNYWlsYm94UGF0aDogc3RyaW5nO1xuXHRwcml2YXRlIHZhdWx0TmFtZTogc3RyaW5nO1xuXHRwcml2YXRlIHBlbmRpbmdDaGFuZ2VzOiBNYXA8c3RyaW5nLCBhbnk+ID0gbmV3IE1hcCgpO1xuXHRwcml2YXRlIHBlbmRpbmdJQUJsb2NrczogYW55W10gPSBbXTtcblx0cHJpdmF0ZSBhY3RpdmVGb2N1czogYW55ID0gbnVsbDtcblxuXHRhc3luYyBvbmxvYWQoKSB7XG5cdFx0Y29uc29sZS5sb2coJ0NhcmdhbmRvIE1lbW9yaWEgVHJhY2tlciBwbHVnaW4gKE11bHRpLVZhdWx0KS4uLicpO1xuXHRcdFxuXHRcdHRoaXMudmF1bHROYW1lID0gdGhpcy5hcHAudmF1bHQuZ2V0TmFtZSgpO1xuXHRcdGNvbnN0IGJhc2VEaXIgPSBwYXRoLmpvaW4ob3MuaG9tZWRpcigpLCAnLmNvbmZpZycsICdvYnNpZGlhbi1jb3BpbG90Jyk7XG5cdFx0dGhpcy5mb2N1c1BhdGggPSBwYXRoLmpvaW4oYmFzZURpciwgJ2FjdGl2ZV9mb2N1cy5qc29uJyk7XG5cdFx0dGhpcy5jcnVkTWFpbGJveFBhdGggPSBwYXRoLmpvaW4oYmFzZURpciwgJ3ZhdWx0cycsIGAke3RoaXMudmF1bHROYW1lfS5qc29uYCk7XG5cblx0XHQvLyBDdXJzb3IgdHJhY2tpbmdcblx0XHRjb25zdCB1cGRhdGVDdXJzb3IgPSAoKSA9PiB7XG5cdFx0XHRjb25zdCBhY3RpdmVGaWxlID0gdGhpcy5hcHAud29ya3NwYWNlLmdldEFjdGl2ZUZpbGUoKTtcblxuXHRcdFx0aWYgKGFjdGl2ZUZpbGUpIHtcblx0XHRcdFx0bGV0IGxpbmUgPSAxO1xuXHRcdFx0XHRsZXQgY2ggPSAwO1xuXG5cdFx0XHRcdGNvbnN0IHZpZXcgPSB0aGlzLmFwcC53b3Jrc3BhY2UuZ2V0QWN0aXZlVmlld09mVHlwZShNYXJrZG93blZpZXcpO1xuXHRcdFx0XHRpZiAodmlldyAmJiB2aWV3LmZpbGUgJiYgdmlldy5maWxlLnBhdGggPT09IGFjdGl2ZUZpbGUucGF0aCAmJiB2aWV3LmVkaXRvcikge1xuXHRcdFx0XHRcdGNvbnN0IHBvcyA9IHZpZXcuZWRpdG9yLmdldEN1cnNvcigpO1xuXHRcdFx0XHRcdGxpbmUgPSBwb3MubGluZSArIDE7XG5cdFx0XHRcdFx0Y2ggPSBwb3MuY2g7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aGlzLmFjdGl2ZUZvY3VzID0geyBmaWxlOiBhY3RpdmVGaWxlLnBhdGgsIGxpbmUsIGNoIH07XG5cdFx0XHR9XG5cblx0XHRcdC8vIEFsd2F5cyBmbHVzaCB2YXVsdCBpZGVudGl0eSwgZXZlbiB3aXRob3V0IGFuIGFjdGl2ZSBmaWxlXG5cdFx0XHR0aGlzLnNjaGVkdWxlRm9jdXNVcGRhdGUoKTtcblx0XHR9O1xuXG5cdFx0Y29uc3Qgc2NoZWR1bGVVcGRhdGUgPSAoKSA9PiB7XG5cdFx0XHRzZXRUaW1lb3V0KHVwZGF0ZUN1cnNvciwgMTAwKTtcblx0XHR9O1xuXG5cdFx0dGhpcy5yZWdpc3RlckRvbUV2ZW50KGRvY3VtZW50LCAnbW91c2Vkb3duJywgc2NoZWR1bGVVcGRhdGUpO1xuXHRcdHRoaXMucmVnaXN0ZXJEb21FdmVudChkb2N1bWVudCwgJ2tleXVwJywgc2NoZWR1bGVVcGRhdGUpO1xuXHRcdHRoaXMucmVnaXN0ZXJEb21FdmVudCh3aW5kb3csICdmb2N1cycsIHNjaGVkdWxlVXBkYXRlKTtcblx0XHR0aGlzLnJlZ2lzdGVyRG9tRXZlbnQoZG9jdW1lbnQuYm9keSwgJ21vdXNlZW50ZXInLCBzY2hlZHVsZVVwZGF0ZSk7XG5cblx0XHQvLyBGYWxsYmFjazogdmlzaWJpbGl0eWNoYW5nZSBpcyBtb3JlIHJlbGlhYmxlIG9uIHNvbWUgTGludXggV01zXG5cdFx0dGhpcy5yZWdpc3RlckRvbUV2ZW50KGRvY3VtZW50LCAndmlzaWJpbGl0eWNoYW5nZScsICgpID0+IHtcblx0XHRcdGlmICghZG9jdW1lbnQuaGlkZGVuKSBzY2hlZHVsZVVwZGF0ZSgpO1xuXHRcdH0pO1xuXG5cdFx0Ly8gUGFyYWNhXHUwMEVEZGFzIGRlIGVtZXJnZW5jaWEgKFBvbGxpbmcpOiBcblx0XHQvLyBQYXJhIHVzdWFyaW9zIGRlIFRpbGluZyBXTXMgKGkzLCBic3B3bSkgbyBBbHQrVGFiIGRvbmRlIGVsIHJhdFx1MDBGM24gbm8gZW50cmEgYSBsYSB2ZW50YW5hXG5cdFx0Ly8gbmkgc2UgZGlzcGFyYW4gY2xpY2tzLCB2YWxpZGFtb3MgY2FkYSAycyBzaSBsYSB2ZW50YW5hIHJlYWxtZW50ZSB0aWVuZSBlbCBmb2NvIGRlbCBPUy5cblx0XHR0aGlzLnJlZ2lzdGVySW50ZXJ2YWwoXG5cdFx0XHR3aW5kb3cuc2V0SW50ZXJ2YWwoKCkgPT4ge1xuXHRcdFx0XHRpZiAoZG9jdW1lbnQuaGFzRm9jdXMoKSkge1xuXHRcdFx0XHRcdHNjaGVkdWxlVXBkYXRlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0sIDIwMDApXG5cdFx0KTtcblxuXHRcdHRoaXMucmVnaXN0ZXJFdmVudChcblx0XHRcdHRoaXMuYXBwLndvcmtzcGFjZS5vbignYWN0aXZlLWxlYWYtY2hhbmdlJywgKCkgPT4ge1xuXHRcdFx0XHRzY2hlZHVsZVVwZGF0ZSgpO1xuXHRcdFx0fSlcblx0XHQpO1xuXG5cdFx0dGhpcy5yZWdpc3RlckV2ZW50KFxuXHRcdFx0dGhpcy5hcHAud29ya3NwYWNlLm9uKCdlZGl0b3ItY2hhbmdlJywgKGVkaXRvcjogRWRpdG9yLCB2aWV3OiBNYXJrZG93blZpZXcpID0+IHtcblx0XHRcdFx0aWYgKHZpZXcgJiYgdmlldy5maWxlKSB7XG5cdFx0XHRcdFx0Y29uc3QgcG9zID0gZWRpdG9yLmdldEN1cnNvcigpO1xuXHRcdFx0XHRcdHRoaXMuYWN0aXZlRm9jdXMgPSB7IGZpbGU6IHZpZXcuZmlsZS5wYXRoLCBsaW5lOiBwb3MubGluZSArIDEsIGNoOiBwb3MuY2ggfTtcblx0XHRcdFx0XHR0aGlzLnNjaGVkdWxlRm9jdXNVcGRhdGUoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSlcblx0XHQpO1xuXHRcdHRoaXMucmVnaXN0ZXJFdmVudChcblx0XHRcdHRoaXMuYXBwLndvcmtzcGFjZS5vbignZmlsZS1vcGVuJywgKGZpbGU6IFRGaWxlIHwgbnVsbCkgPT4ge1xuXHRcdFx0XHRpZiAoZmlsZSkge1xuXHRcdFx0XHRcdGNvbnN0IHZpZXcgPSB0aGlzLmFwcC53b3Jrc3BhY2UuZ2V0QWN0aXZlVmlld09mVHlwZShNYXJrZG93blZpZXcpO1xuXHRcdFx0XHRcdGlmICh2aWV3ICYmIHZpZXcuZWRpdG9yKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBwb3MgPSB2aWV3LmVkaXRvci5nZXRDdXJzb3IoKTtcblx0XHRcdFx0XHRcdHRoaXMuYWN0aXZlRm9jdXMgPSB7IGZpbGU6IGZpbGUucGF0aCwgbGluZTogcG9zLmxpbmUgKyAxLCBjaDogcG9zLmNoIH07XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHRoaXMuYWN0aXZlRm9jdXMgPSB7IGZpbGU6IGZpbGUucGF0aCwgbGluZTogMSwgY2g6IDAgfTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dGhpcy5zY2hlZHVsZUZvY3VzVXBkYXRlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pXG5cdFx0KTtcblxuXHRcdC8vIENSVUQgdHJhY2tpbmdcblx0XHR0aGlzLnJlZ2lzdGVyRXZlbnQodGhpcy5hcHAudmF1bHQub24oJ2NyZWF0ZScsIChmaWxlOiBUQWJzdHJhY3RGaWxlKSA9PiB0aGlzLmhhbmRsZUNydWQoJ2NyZWF0ZWQnLCBmaWxlKSkpO1xuXHRcdHRoaXMucmVnaXN0ZXJFdmVudCh0aGlzLmFwcC52YXVsdC5vbignbW9kaWZ5JywgKGZpbGU6IFRBYnN0cmFjdEZpbGUpID0+IHRoaXMuaGFuZGxlQ3J1ZCgnbW9kaWZpZWQnLCBmaWxlKSkpO1xuXHRcdHRoaXMucmVnaXN0ZXJFdmVudCh0aGlzLmFwcC52YXVsdC5vbignZGVsZXRlJywgKGZpbGU6IFRBYnN0cmFjdEZpbGUpID0+IHRoaXMuaGFuZGxlQ3J1ZCgnZGVsZXRlZCcsIGZpbGUpKSk7XG5cdFx0dGhpcy5yZWdpc3RlckV2ZW50KHRoaXMuYXBwLnZhdWx0Lm9uKCdyZW5hbWUnLCAoZmlsZTogVEFic3RyYWN0RmlsZSwgb2xkUGF0aDogc3RyaW5nKSA9PiB7XG5cdFx0XHR0aGlzLnBlbmRpbmdDaGFuZ2VzLnNldChvbGRQYXRoLCB7IG9wOiAnZGVsZXRlZCcsIHBhdGg6IG9sZFBhdGggfSk7XG5cdFx0XHR0aGlzLmhhbmRsZUNydWQoJ2NyZWF0ZWQnLCBmaWxlKTtcblx0XHRcdGlmICh0aGlzLmFjdGl2ZUZvY3VzICYmIHRoaXMuYWN0aXZlRm9jdXMuZmlsZSA9PT0gb2xkUGF0aCkge1xuXHRcdFx0XHR0aGlzLmFjdGl2ZUZvY3VzLmZpbGUgPSBmaWxlLnBhdGg7XG5cdFx0XHRcdHRoaXMuc2NoZWR1bGVGb2N1c1VwZGF0ZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdG9udW5sb2FkKCkge1xuXHRcdGNvbnNvbGUubG9nKCdEZXNjYXJnYW5kbyBNZW1vcmlhIFRyYWNrZXIgcGx1Z2luLi4uJyk7XG5cdFx0aWYgKHRoaXMuZm9jdXNEZWJvdW5jZVRpbWVyKSBjbGVhclRpbWVvdXQodGhpcy5mb2N1c0RlYm91bmNlVGltZXIpO1xuXHRcdGlmICh0aGlzLmNydWREZWJvdW5jZVRpbWVyKSBjbGVhclRpbWVvdXQodGhpcy5jcnVkRGVib3VuY2VUaW1lcik7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGhhbmRsZUNydWQob3A6IHN0cmluZywgYWJzdHJhY3RGaWxlOiBUQWJzdHJhY3RGaWxlKSB7XG5cdFx0aWYgKHRoaXMuc2hvdWxkSWdub3JlKGFic3RyYWN0RmlsZS5wYXRoKSkgcmV0dXJuO1xuXHRcdGlmICghKGFic3RyYWN0RmlsZSBpbnN0YW5jZW9mIFRGaWxlKSkgcmV0dXJuO1xuXG5cdFx0Y29uc3QgZmlsZSA9IGFic3RyYWN0RmlsZSBhcyBURmlsZTtcblx0XHRsZXQgZXhjZXJwdCA9ICcnO1xuXG5cdFx0aWYgKG9wID09PSAnY3JlYXRlZCcgfHwgb3AgPT09ICdtb2RpZmllZCcpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5jYWNoZWRSZWFkKGZpbGUpO1xuXHRcdFx0XHRleGNlcnB0ID0gY29udGVudC5sZW5ndGggPiAzMDAgPyBjb250ZW50LnN1YnN0cmluZygwLCAzMDApICsgJy4uLicgOiBjb250ZW50O1xuXHRcdFx0XHRcblx0XHRcdFx0aWYgKG9wID09PSAnbW9kaWZpZWQnKSB7XG5cdFx0XHRcdFx0dGhpcy5leHRyYWN0SUFCbG9ja3MoZmlsZSwgY29udGVudCk7XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2goZSkge31cblx0XHR9XG5cblx0XHR0aGlzLnBlbmRpbmdDaGFuZ2VzLnNldChmaWxlLnBhdGgsIHsgb3AsIHBhdGg6IGZpbGUucGF0aCwgZXhjZXJwdCB9KTtcblx0XHR0aGlzLnNjaGVkdWxlQ3J1ZFVwZGF0ZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBleHRyYWN0SUFCbG9ja3MoZmlsZTogVEZpbGUsIGNvbnRlbnQ6IHN0cmluZykge1xuXHRcdGNvbnN0IGxpbmVzID0gY29udGVudC5zcGxpdCgnXFxuJyk7XG5cdFx0Y29uc3QgcmVnZXggPSAvXFwvaWFcXChbJ1wiXShbXidcIl0rKVsnXCJdXFwpLztcblx0XHRsZXQgaGFzTWF0Y2ggPSBmYWxzZTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGxpbmVzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCBtID0gbGluZXNbaV0ubWF0Y2gocmVnZXgpO1xuXHRcdFx0aWYgKG0gJiYgbS5sZW5ndGggPiAxKSB7XG5cdFx0XHRcdHRoaXMucGVuZGluZ0lBQmxvY2tzLnB1c2goeyBmaWxlOiBmaWxlLnBhdGgsIGxpbmU6IGkgKyAxLCBwcm9tcHQ6IG1bMV0gfSk7XG5cdFx0XHRcdGhhc01hdGNoID0gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoaGFzTWF0Y2gpIHtcblx0XHRcdHRoaXMuYXBwLnZhdWx0LnByb2Nlc3MoZmlsZSwgKGRhdGEpID0+IHtcblx0XHRcdFx0Y29uc3QgZGF0YUxpbmVzID0gZGF0YS5zcGxpdCgnXFxuJyk7XG5cdFx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgZGF0YUxpbmVzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdFx0aWYgKHJlZ2V4LnRlc3QoZGF0YUxpbmVzW2ldKSkge1xuXHRcdFx0XHRcdFx0ZGF0YUxpbmVzW2ldID0gZGF0YUxpbmVzW2ldLnJlcGxhY2UocmVnZXgsICcnKS50cmltKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBkYXRhTGluZXMuam9pbignXFxuJyk7XG5cdFx0XHR9KS5jYXRjaChlID0+IGNvbnNvbGUuZXJyb3IoZSkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc2hvdWxkSWdub3JlKGZpbGVQYXRoOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRjb25zdCBwYXJ0cyA9IGZpbGVQYXRoLnNwbGl0KCcvJyk7XG5cdFx0aWYgKHBhcnRzLmluY2x1ZGVzKCcub2JzaWRpYW4nKSB8fCBwYXJ0cy5pbmNsdWRlcygnLmdpdCcpIHx8IHBhcnRzLmluY2x1ZGVzKCcudHJhc2gnKSkgcmV0dXJuIHRydWU7XG5cdFx0Y29uc3QgYmFzZSA9IHBhdGguYmFzZW5hbWUoZmlsZVBhdGgpO1xuXHRcdGlmIChiYXNlLnN0YXJ0c1dpdGgoJy4nKSB8fCBiYXNlLmVuZHNXaXRoKCd+JykgfHwgYmFzZS5lbmRzV2l0aCgnLnRtcCcpKSByZXR1cm4gdHJ1ZTtcblx0XHRpZiAoIWJhc2UuZW5kc1dpdGgoJy5tZCcpKSByZXR1cm4gdHJ1ZTtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIHNjaGVkdWxlRm9jdXNVcGRhdGUoKSB7XG5cdFx0aWYgKHRoaXMuZm9jdXNEZWJvdW5jZVRpbWVyKSBjbGVhclRpbWVvdXQodGhpcy5mb2N1c0RlYm91bmNlVGltZXIpO1xuXHRcdHRoaXMuZm9jdXNEZWJvdW5jZVRpbWVyID0gc2V0VGltZW91dCgoKSA9PiB0aGlzLmZsdXNoRm9jdXMoKSwgMTAwKTtcblx0fVxuXG5cdHByaXZhdGUgc2NoZWR1bGVDcnVkVXBkYXRlKCkge1xuXHRcdGlmICh0aGlzLmNydWREZWJvdW5jZVRpbWVyKSBjbGVhclRpbWVvdXQodGhpcy5jcnVkRGVib3VuY2VUaW1lcik7XG5cdFx0dGhpcy5jcnVkRGVib3VuY2VUaW1lciA9IHNldFRpbWVvdXQoKCkgPT4gdGhpcy5mbHVzaENydWQoKSwgNTAwKTtcblx0fVxuXG5cdHByaXZhdGUgZmx1c2hGb2N1cygpIHtcblx0XHR0cnkge1xuXHRcdFx0aWYgKCF0aGlzLmFjdGl2ZUZvY3VzKSByZXR1cm47XG5cdFx0XHRcblx0XHRcdGNvbnN0IHBheWxvYWQgPSB7XG5cdFx0XHRcdHRzOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG5cdFx0XHRcdHZhdWx0OiB0aGlzLnZhdWx0TmFtZSxcblx0XHRcdFx0dmF1bHRQYXRoOiAodGhpcy5hcHAudmF1bHQuYWRhcHRlciBhcyBhbnkpLmJhc2VQYXRoIHx8ICcnLFxuXHRcdFx0XHRmb2N1czogdGhpcy5hY3RpdmVGb2N1c1xuXHRcdFx0fTtcblx0XHRcdFxuXHRcdFx0ZnMubWtkaXJTeW5jKHBhdGguZGlybmFtZSh0aGlzLmZvY3VzUGF0aCksIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuXHRcdFx0ZnMud3JpdGVGaWxlU3luYyh0aGlzLmZvY3VzUGF0aCwgSlNPTi5zdHJpbmdpZnkocGF5bG9hZCwgbnVsbCwgMiksICd1dGY4Jyk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0Y29uc29sZS5lcnJvcignRXJyb3IgYWN0dWFsaXphbmRvIGZvY3VzOicsIGUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZmx1c2hDcnVkKCkge1xuXHRcdHRyeSB7XG5cdFx0XHRsZXQgZGF0YSA9IHsgdHM6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSwgdmF1bHQ6ICcnLCBjaGFuZ2VzOiBbXSBhcyBhbnlbXSwgaWFfYmxvY2tzOiBbXSBhcyBhbnlbXSB9O1xuXHRcdFx0XG5cdFx0XHRpZiAoZnMuZXhpc3RzU3luYyh0aGlzLmNydWRNYWlsYm94UGF0aCkpIHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRkYXRhID0gSlNPTi5wYXJzZShmcy5yZWFkRmlsZVN5bmModGhpcy5jcnVkTWFpbGJveFBhdGgsICd1dGY4JykpO1xuXHRcdFx0XHR9IGNhdGNoIChlKSB7fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBNZXJnZSBjaGFuZ2VzXG5cdFx0XHRjb25zdCBtZXJnZWRDaGFuZ2VzID0gWy4uLihkYXRhLmNoYW5nZXMgfHwgW10pXTtcblx0XHRcdGZvciAoY29uc3QgY2hhbmdlIG9mIHRoaXMucGVuZGluZ0NoYW5nZXMudmFsdWVzKCkpIHtcblx0XHRcdFx0bWVyZ2VkQ2hhbmdlcy5wdXNoKGNoYW5nZSk7XG5cdFx0XHR9XG5cdFx0XHRcblx0XHRcdC8vIE1lcmdlIGJsb2Nrc1xuXHRcdFx0Y29uc3QgbWVyZ2VkQmxvY2tzID0gWy4uLihkYXRhLmlhX2Jsb2NrcyB8fCBbXSksIC4uLnRoaXMucGVuZGluZ0lBQmxvY2tzXTtcblxuXHRcdFx0Y29uc3QgcGF5bG9hZCA9IHtcblx0XHRcdFx0dHM6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcblx0XHRcdFx0dmF1bHQ6ICh0aGlzLmFwcC52YXVsdC5hZGFwdGVyIGFzIGFueSkuYmFzZVBhdGggfHwgJycsXG5cdFx0XHRcdGNoYW5nZXM6IG1lcmdlZENoYW5nZXMsXG5cdFx0XHRcdGlhX2Jsb2NrczogbWVyZ2VkQmxvY2tzXG5cdFx0XHR9O1xuXG5cdFx0XHRmcy5ta2RpclN5bmMocGF0aC5kaXJuYW1lKHRoaXMuY3J1ZE1haWxib3hQYXRoKSwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG5cdFx0XHRmcy53cml0ZUZpbGVTeW5jKHRoaXMuY3J1ZE1haWxib3hQYXRoLCBKU09OLnN0cmluZ2lmeShwYXlsb2FkLCBudWxsLCAyKSwgJ3V0ZjgnKTtcblxuXHRcdFx0Ly8gQ2xlYXIgcGVuZGluZ1xuXHRcdFx0dGhpcy5wZW5kaW5nQ2hhbmdlcy5jbGVhcigpO1xuXHRcdFx0dGhpcy5wZW5kaW5nSUFCbG9ja3MgPSBbXTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGNvbnNvbGUuZXJyb3IoJ0Vycm9yIGVzY3JpYmllbmRvIGFsIGJ1elx1MDBGM24gQ1JVRDonLCBlcnIpO1xuXHRcdH1cblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsc0JBQW1FO0FBQ25FLFNBQW9CO0FBQ3BCLFNBQW9CO0FBQ3BCLFdBQXNCO0FBRXRCLElBQXFCLGlCQUFyQixjQUE0Qyx1QkFBTztBQUFBLEVBQW5EO0FBQUE7QUFDQyxTQUFRLHFCQUE0QztBQUNwRCxTQUFRLG9CQUEyQztBQUluRCxTQUFRLGlCQUFtQyxvQkFBSSxJQUFJO0FBQ25ELFNBQVEsa0JBQXlCLENBQUM7QUFDbEMsU0FBUSxjQUFtQjtBQUFBO0FBQUEsRUFFM0IsTUFBTSxTQUFTO0FBQ2QsWUFBUSxJQUFJLGtEQUFrRDtBQUU5RCxTQUFLLFlBQVksS0FBSyxJ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
