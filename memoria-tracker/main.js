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
      const view = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
      if (view && view.file && view.editor) {
        const pos = view.editor.getCursor();
        const newFocus = { file: view.file.path, line: pos.line + 1, ch: pos.ch };
        this.activeFocus = newFocus;
        this.scheduleFocusUpdate();
      }
    };
    this.registerDomEvent(document, "click", updateCursor);
    this.registerDomEvent(document, "keyup", updateCursor);
    this.registerDomEvent(window, "focus", () => {
      setTimeout(updateCursor, 100);
    });
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => {
        setTimeout(updateCursor, 100);
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
          this.extractIABlocks(file.path, content);
        }
      } catch (e) {
      }
    }
    this.pendingChanges.set(file.path, { op, path: file.path, excerpt });
    this.scheduleCrudUpdate();
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsibWFpbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0IHsgUGx1Z2luLCBFZGl0b3IsIE1hcmtkb3duVmlldywgVEZpbGUsIFRBYnN0cmFjdEZpbGUgfSBmcm9tICdvYnNpZGlhbic7XG5pbXBvcnQgKiBhcyBmcyBmcm9tICdmcyc7XG5pbXBvcnQgKiBhcyBvcyBmcm9tICdvcyc7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBNZW1vcmlhVHJhY2tlciBleHRlbmRzIFBsdWdpbiB7XG5cdHByaXZhdGUgZm9jdXNEZWJvdW5jZVRpbWVyOiBOb2RlSlMuVGltZW91dCB8IG51bGwgPSBudWxsO1xuXHRwcml2YXRlIGNydWREZWJvdW5jZVRpbWVyOiBOb2RlSlMuVGltZW91dCB8IG51bGwgPSBudWxsO1xuXHRwcml2YXRlIGZvY3VzUGF0aDogc3RyaW5nO1xuXHRwcml2YXRlIGNydWRNYWlsYm94UGF0aDogc3RyaW5nO1xuXHRwcml2YXRlIHZhdWx0TmFtZTogc3RyaW5nO1xuXHRwcml2YXRlIHBlbmRpbmdDaGFuZ2VzOiBNYXA8c3RyaW5nLCBhbnk+ID0gbmV3IE1hcCgpO1xuXHRwcml2YXRlIHBlbmRpbmdJQUJsb2NrczogYW55W10gPSBbXTtcblx0cHJpdmF0ZSBhY3RpdmVGb2N1czogYW55ID0gbnVsbDtcblxuXHRhc3luYyBvbmxvYWQoKSB7XG5cdFx0Y29uc29sZS5sb2coJ0NhcmdhbmRvIE1lbW9yaWEgVHJhY2tlciBwbHVnaW4gKE11bHRpLVZhdWx0KS4uLicpO1xuXHRcdFxuXHRcdHRoaXMudmF1bHROYW1lID0gdGhpcy5hcHAudmF1bHQuZ2V0TmFtZSgpO1xuXHRcdGNvbnN0IGJhc2VEaXIgPSBwYXRoLmpvaW4ob3MuaG9tZWRpcigpLCAnLmNvbmZpZycsICdvYnNpZGlhbi1jb3BpbG90Jyk7XG5cdFx0dGhpcy5mb2N1c1BhdGggPSBwYXRoLmpvaW4oYmFzZURpciwgJ2FjdGl2ZV9mb2N1cy5qc29uJyk7XG5cdFx0dGhpcy5jcnVkTWFpbGJveFBhdGggPSBwYXRoLmpvaW4oYmFzZURpciwgJ3ZhdWx0cycsIGAke3RoaXMudmF1bHROYW1lfS5qc29uYCk7XG5cblx0XHQvLyBDdXJzb3IgdHJhY2tpbmdcblx0XHRjb25zdCB1cGRhdGVDdXJzb3IgPSAoKSA9PiB7XG5cdFx0XHRjb25zdCB2aWV3ID0gdGhpcy5hcHAud29ya3NwYWNlLmdldEFjdGl2ZVZpZXdPZlR5cGUoTWFya2Rvd25WaWV3KTtcblx0XHRcdGlmICh2aWV3ICYmIHZpZXcuZmlsZSAmJiB2aWV3LmVkaXRvcikge1xuXHRcdFx0XHRjb25zdCBwb3MgPSB2aWV3LmVkaXRvci5nZXRDdXJzb3IoKTtcblx0XHRcdFx0Y29uc3QgbmV3Rm9jdXMgPSB7IGZpbGU6IHZpZXcuZmlsZS5wYXRoLCBsaW5lOiBwb3MubGluZSArIDEsIGNoOiBwb3MuY2ggfTtcblx0XHRcdFx0dGhpcy5hY3RpdmVGb2N1cyA9IG5ld0ZvY3VzO1xuXHRcdFx0XHR0aGlzLnNjaGVkdWxlRm9jdXNVcGRhdGUoKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0dGhpcy5yZWdpc3RlckRvbUV2ZW50KGRvY3VtZW50LCAnY2xpY2snLCB1cGRhdGVDdXJzb3IpO1xuXHRcdHRoaXMucmVnaXN0ZXJEb21FdmVudChkb2N1bWVudCwgJ2tleXVwJywgdXBkYXRlQ3Vyc29yKTtcblx0XHR0aGlzLnJlZ2lzdGVyRG9tRXZlbnQod2luZG93LCAnZm9jdXMnLCAoKSA9PiB7XG5cdFx0XHRzZXRUaW1lb3V0KHVwZGF0ZUN1cnNvciwgMTAwKTtcblx0XHR9KTtcblxuXHRcdHRoaXMucmVnaXN0ZXJFdmVudChcblx0XHRcdHRoaXMuYXBwLndvcmtzcGFjZS5vbignYWN0aXZlLWxlYWYtY2hhbmdlJywgKCkgPT4ge1xuXHRcdFx0XHRzZXRUaW1lb3V0KHVwZGF0ZUN1cnNvciwgMTAwKTtcblx0XHRcdH0pXG5cdFx0KTtcblxuXHRcdHRoaXMucmVnaXN0ZXJFdmVudChcblx0XHRcdHRoaXMuYXBwLndvcmtzcGFjZS5vbignZWRpdG9yLWNoYW5nZScsIChlZGl0b3I6IEVkaXRvciwgdmlldzogTWFya2Rvd25WaWV3KSA9PiB7XG5cdFx0XHRcdGlmICh2aWV3ICYmIHZpZXcuZmlsZSkge1xuXHRcdFx0XHRcdGNvbnN0IHBvcyA9IGVkaXRvci5nZXRDdXJzb3IoKTtcblx0XHRcdFx0XHR0aGlzLmFjdGl2ZUZvY3VzID0geyBmaWxlOiB2aWV3LmZpbGUucGF0aCwgbGluZTogcG9zLmxpbmUgKyAxLCBjaDogcG9zLmNoIH07XG5cdFx0XHRcdFx0dGhpcy5zY2hlZHVsZUZvY3VzVXBkYXRlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pXG5cdFx0KTtcblx0XHR0aGlzLnJlZ2lzdGVyRXZlbnQoXG5cdFx0XHR0aGlzLmFwcC53b3Jrc3BhY2Uub24oJ2ZpbGUtb3BlbicsIChmaWxlOiBURmlsZSB8IG51bGwpID0+IHtcblx0XHRcdFx0aWYgKGZpbGUpIHtcblx0XHRcdFx0XHRjb25zdCB2aWV3ID0gdGhpcy5hcHAud29ya3NwYWNlLmdldEFjdGl2ZVZpZXdPZlR5cGUoTWFya2Rvd25WaWV3KTtcblx0XHRcdFx0XHRpZiAodmlldyAmJiB2aWV3LmVkaXRvcikge1xuXHRcdFx0XHRcdFx0Y29uc3QgcG9zID0gdmlldy5lZGl0b3IuZ2V0Q3Vyc29yKCk7XG5cdFx0XHRcdFx0XHR0aGlzLmFjdGl2ZUZvY3VzID0geyBmaWxlOiBmaWxlLnBhdGgsIGxpbmU6IHBvcy5saW5lICsgMSwgY2g6IHBvcy5jaCB9O1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHR0aGlzLmFjdGl2ZUZvY3VzID0geyBmaWxlOiBmaWxlLnBhdGgsIGxpbmU6IDEsIGNoOiAwIH07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHRoaXMuc2NoZWR1bGVGb2N1c1VwZGF0ZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KVxuXHRcdCk7XG5cblx0XHQvLyBDUlVEIHRyYWNraW5nXG5cdFx0dGhpcy5yZWdpc3RlckV2ZW50KHRoaXMuYXBwLnZhdWx0Lm9uKCdjcmVhdGUnLCAoZmlsZTogVEFic3RyYWN0RmlsZSkgPT4gdGhpcy5oYW5kbGVDcnVkKCdjcmVhdGVkJywgZmlsZSkpKTtcblx0XHR0aGlzLnJlZ2lzdGVyRXZlbnQodGhpcy5hcHAudmF1bHQub24oJ21vZGlmeScsIChmaWxlOiBUQWJzdHJhY3RGaWxlKSA9PiB0aGlzLmhhbmRsZUNydWQoJ21vZGlmaWVkJywgZmlsZSkpKTtcblx0XHR0aGlzLnJlZ2lzdGVyRXZlbnQodGhpcy5hcHAudmF1bHQub24oJ2RlbGV0ZScsIChmaWxlOiBUQWJzdHJhY3RGaWxlKSA9PiB0aGlzLmhhbmRsZUNydWQoJ2RlbGV0ZWQnLCBmaWxlKSkpO1xuXHRcdHRoaXMucmVnaXN0ZXJFdmVudCh0aGlzLmFwcC52YXVsdC5vbigncmVuYW1lJywgKGZpbGU6IFRBYnN0cmFjdEZpbGUsIG9sZFBhdGg6IHN0cmluZykgPT4ge1xuXHRcdFx0dGhpcy5wZW5kaW5nQ2hhbmdlcy5zZXQob2xkUGF0aCwgeyBvcDogJ2RlbGV0ZWQnLCBwYXRoOiBvbGRQYXRoIH0pO1xuXHRcdFx0dGhpcy5oYW5kbGVDcnVkKCdjcmVhdGVkJywgZmlsZSk7XG5cdFx0XHRpZiAodGhpcy5hY3RpdmVGb2N1cyAmJiB0aGlzLmFjdGl2ZUZvY3VzLmZpbGUgPT09IG9sZFBhdGgpIHtcblx0XHRcdFx0dGhpcy5hY3RpdmVGb2N1cy5maWxlID0gZmlsZS5wYXRoO1xuXHRcdFx0XHR0aGlzLnNjaGVkdWxlRm9jdXNVcGRhdGUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRvbnVubG9hZCgpIHtcblx0XHRjb25zb2xlLmxvZygnRGVzY2FyZ2FuZG8gTWVtb3JpYSBUcmFja2VyIHBsdWdpbi4uLicpO1xuXHRcdGlmICh0aGlzLmZvY3VzRGVib3VuY2VUaW1lcikgY2xlYXJUaW1lb3V0KHRoaXMuZm9jdXNEZWJvdW5jZVRpbWVyKTtcblx0XHRpZiAodGhpcy5jcnVkRGVib3VuY2VUaW1lcikgY2xlYXJUaW1lb3V0KHRoaXMuY3J1ZERlYm91bmNlVGltZXIpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBoYW5kbGVDcnVkKG9wOiBzdHJpbmcsIGFic3RyYWN0RmlsZTogVEFic3RyYWN0RmlsZSkge1xuXHRcdGlmICh0aGlzLnNob3VsZElnbm9yZShhYnN0cmFjdEZpbGUucGF0aCkpIHJldHVybjtcblx0XHRpZiAoIShhYnN0cmFjdEZpbGUgaW5zdGFuY2VvZiBURmlsZSkpIHJldHVybjtcblxuXHRcdGNvbnN0IGZpbGUgPSBhYnN0cmFjdEZpbGUgYXMgVEZpbGU7XG5cdFx0bGV0IGV4Y2VycHQgPSAnJztcblxuXHRcdGlmIChvcCA9PT0gJ2NyZWF0ZWQnIHx8IG9wID09PSAnbW9kaWZpZWQnKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5hcHAudmF1bHQuY2FjaGVkUmVhZChmaWxlKTtcblx0XHRcdFx0ZXhjZXJwdCA9IGNvbnRlbnQubGVuZ3RoID4gMzAwID8gY29udGVudC5zdWJzdHJpbmcoMCwgMzAwKSArICcuLi4nIDogY29udGVudDtcblx0XHRcdFx0XG5cdFx0XHRcdGlmIChvcCA9PT0gJ21vZGlmaWVkJykge1xuXHRcdFx0XHRcdHRoaXMuZXh0cmFjdElBQmxvY2tzKGZpbGUucGF0aCwgY29udGVudCk7XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2goZSkge31cblx0XHR9XG5cblx0XHR0aGlzLnBlbmRpbmdDaGFuZ2VzLnNldChmaWxlLnBhdGgsIHsgb3AsIHBhdGg6IGZpbGUucGF0aCwgZXhjZXJwdCB9KTtcblx0XHR0aGlzLnNjaGVkdWxlQ3J1ZFVwZGF0ZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBleHRyYWN0SUFCbG9ja3MoZmlsZVBhdGg6IHN0cmluZywgY29udGVudDogc3RyaW5nKSB7XG5cdFx0Y29uc3QgbGluZXMgPSBjb250ZW50LnNwbGl0KCdcXG4nKTtcblx0XHRjb25zdCByZWdleCA9IC9cXC9pYVxcKFsnXCJdKFteJ1wiXSspWydcIl1cXCkvO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgbGluZXMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IG0gPSBsaW5lc1tpXS5tYXRjaChyZWdleCk7XG5cdFx0XHRpZiAobSAmJiBtLmxlbmd0aCA+IDEpIHtcblx0XHRcdFx0dGhpcy5wZW5kaW5nSUFCbG9ja3MucHVzaCh7IGZpbGU6IGZpbGVQYXRoLCBsaW5lOiBpICsgMSwgcHJvbXB0OiBtWzFdIH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc2hvdWxkSWdub3JlKGZpbGVQYXRoOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRjb25zdCBwYXJ0cyA9IGZpbGVQYXRoLnNwbGl0KCcvJyk7XG5cdFx0aWYgKHBhcnRzLmluY2x1ZGVzKCcub2JzaWRpYW4nKSB8fCBwYXJ0cy5pbmNsdWRlcygnLmdpdCcpIHx8IHBhcnRzLmluY2x1ZGVzKCcudHJhc2gnKSkgcmV0dXJuIHRydWU7XG5cdFx0Y29uc3QgYmFzZSA9IHBhdGguYmFzZW5hbWUoZmlsZVBhdGgpO1xuXHRcdGlmIChiYXNlLnN0YXJ0c1dpdGgoJy4nKSB8fCBiYXNlLmVuZHNXaXRoKCd+JykgfHwgYmFzZS5lbmRzV2l0aCgnLnRtcCcpKSByZXR1cm4gdHJ1ZTtcblx0XHRpZiAoIWJhc2UuZW5kc1dpdGgoJy5tZCcpKSByZXR1cm4gdHJ1ZTtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIHNjaGVkdWxlRm9jdXNVcGRhdGUoKSB7XG5cdFx0aWYgKHRoaXMuZm9jdXNEZWJvdW5jZVRpbWVyKSBjbGVhclRpbWVvdXQodGhpcy5mb2N1c0RlYm91bmNlVGltZXIpO1xuXHRcdHRoaXMuZm9jdXNEZWJvdW5jZVRpbWVyID0gc2V0VGltZW91dCgoKSA9PiB0aGlzLmZsdXNoRm9jdXMoKSwgMTAwKTtcblx0fVxuXG5cdHByaXZhdGUgc2NoZWR1bGVDcnVkVXBkYXRlKCkge1xuXHRcdGlmICh0aGlzLmNydWREZWJvdW5jZVRpbWVyKSBjbGVhclRpbWVvdXQodGhpcy5jcnVkRGVib3VuY2VUaW1lcik7XG5cdFx0dGhpcy5jcnVkRGVib3VuY2VUaW1lciA9IHNldFRpbWVvdXQoKCkgPT4gdGhpcy5mbHVzaENydWQoKSwgNTAwKTtcblx0fVxuXG5cdHByaXZhdGUgZmx1c2hGb2N1cygpIHtcblx0XHR0cnkge1xuXHRcdFx0aWYgKCF0aGlzLmFjdGl2ZUZvY3VzKSByZXR1cm47XG5cdFx0XHRcblx0XHRcdGNvbnN0IHBheWxvYWQgPSB7XG5cdFx0XHRcdHRzOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG5cdFx0XHRcdHZhdWx0OiB0aGlzLnZhdWx0TmFtZSxcblx0XHRcdFx0dmF1bHRQYXRoOiAodGhpcy5hcHAudmF1bHQuYWRhcHRlciBhcyBhbnkpLmJhc2VQYXRoIHx8ICcnLFxuXHRcdFx0XHRmb2N1czogdGhpcy5hY3RpdmVGb2N1c1xuXHRcdFx0fTtcblx0XHRcdFxuXHRcdFx0ZnMubWtkaXJTeW5jKHBhdGguZGlybmFtZSh0aGlzLmZvY3VzUGF0aCksIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuXHRcdFx0ZnMud3JpdGVGaWxlU3luYyh0aGlzLmZvY3VzUGF0aCwgSlNPTi5zdHJpbmdpZnkocGF5bG9hZCwgbnVsbCwgMiksICd1dGY4Jyk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0Y29uc29sZS5lcnJvcignRXJyb3IgYWN0dWFsaXphbmRvIGZvY3VzOicsIGUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZmx1c2hDcnVkKCkge1xuXHRcdHRyeSB7XG5cdFx0XHRsZXQgZGF0YSA9IHsgdHM6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSwgdmF1bHQ6ICcnLCBjaGFuZ2VzOiBbXSBhcyBhbnlbXSwgaWFfYmxvY2tzOiBbXSBhcyBhbnlbXSB9O1xuXHRcdFx0XG5cdFx0XHRpZiAoZnMuZXhpc3RzU3luYyh0aGlzLmNydWRNYWlsYm94UGF0aCkpIHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRkYXRhID0gSlNPTi5wYXJzZShmcy5yZWFkRmlsZVN5bmModGhpcy5jcnVkTWFpbGJveFBhdGgsICd1dGY4JykpO1xuXHRcdFx0XHR9IGNhdGNoIChlKSB7fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBNZXJnZSBjaGFuZ2VzXG5cdFx0XHRjb25zdCBtZXJnZWRDaGFuZ2VzID0gWy4uLihkYXRhLmNoYW5nZXMgfHwgW10pXTtcblx0XHRcdGZvciAoY29uc3QgY2hhbmdlIG9mIHRoaXMucGVuZGluZ0NoYW5nZXMudmFsdWVzKCkpIHtcblx0XHRcdFx0bWVyZ2VkQ2hhbmdlcy5wdXNoKGNoYW5nZSk7XG5cdFx0XHR9XG5cdFx0XHRcblx0XHRcdC8vIE1lcmdlIGJsb2Nrc1xuXHRcdFx0Y29uc3QgbWVyZ2VkQmxvY2tzID0gWy4uLihkYXRhLmlhX2Jsb2NrcyB8fCBbXSksIC4uLnRoaXMucGVuZGluZ0lBQmxvY2tzXTtcblxuXHRcdFx0Y29uc3QgcGF5bG9hZCA9IHtcblx0XHRcdFx0dHM6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcblx0XHRcdFx0dmF1bHQ6ICh0aGlzLmFwcC52YXVsdC5hZGFwdGVyIGFzIGFueSkuYmFzZVBhdGggfHwgJycsXG5cdFx0XHRcdGNoYW5nZXM6IG1lcmdlZENoYW5nZXMsXG5cdFx0XHRcdGlhX2Jsb2NrczogbWVyZ2VkQmxvY2tzXG5cdFx0XHR9O1xuXG5cdFx0XHRmcy5ta2RpclN5bmMocGF0aC5kaXJuYW1lKHRoaXMuY3J1ZE1haWxib3hQYXRoKSwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG5cdFx0XHRmcy53cml0ZUZpbGVTeW5jKHRoaXMuY3J1ZE1haWxib3hQYXRoLCBKU09OLnN0cmluZ2lmeShwYXlsb2FkLCBudWxsLCAyKSwgJ3V0ZjgnKTtcblxuXHRcdFx0Ly8gQ2xlYXIgcGVuZGluZ1xuXHRcdFx0dGhpcy5wZW5kaW5nQ2hhbmdlcy5jbGVhcigpO1xuXHRcdFx0dGhpcy5wZW5kaW5nSUFCbG9ja3MgPSBbXTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGNvbnNvbGUuZXJyb3IoJ0Vycm9yIGVzY3JpYmll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
