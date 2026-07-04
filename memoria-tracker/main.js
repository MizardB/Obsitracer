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
      if (!activeFile) return;
      let line = 1;
      let ch = 0;
      const view = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
      if (view && view.file && view.file.path === activeFile.path && view.editor) {
        const pos = view.editor.getCursor();
        line = pos.line + 1;
        ch = pos.ch;
      }
      const newFocus = { file: activeFile.path, line, ch };
      this.activeFocus = newFocus;
      this.scheduleFocusUpdate();
    };
    const scheduleUpdate = () => {
      setTimeout(updateCursor, 100);
    };
    this.registerDomEvent(document, "mousedown", scheduleUpdate);
    this.registerDomEvent(document, "keyup", scheduleUpdate);
    this.registerDomEvent(window, "focus", scheduleUpdate);
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsibWFpbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0IHsgUGx1Z2luLCBFZGl0b3IsIE1hcmtkb3duVmlldywgVEZpbGUsIFRBYnN0cmFjdEZpbGUgfSBmcm9tICdvYnNpZGlhbic7XG5pbXBvcnQgKiBhcyBmcyBmcm9tICdmcyc7XG5pbXBvcnQgKiBhcyBvcyBmcm9tICdvcyc7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBNZW1vcmlhVHJhY2tlciBleHRlbmRzIFBsdWdpbiB7XG5cdHByaXZhdGUgZm9jdXNEZWJvdW5jZVRpbWVyOiBOb2RlSlMuVGltZW91dCB8IG51bGwgPSBudWxsO1xuXHRwcml2YXRlIGNydWREZWJvdW5jZVRpbWVyOiBOb2RlSlMuVGltZW91dCB8IG51bGwgPSBudWxsO1xuXHRwcml2YXRlIGZvY3VzUGF0aDogc3RyaW5nO1xuXHRwcml2YXRlIGNydWRNYWlsYm94UGF0aDogc3RyaW5nO1xuXHRwcml2YXRlIHZhdWx0TmFtZTogc3RyaW5nO1xuXHRwcml2YXRlIHBlbmRpbmdDaGFuZ2VzOiBNYXA8c3RyaW5nLCBhbnk+ID0gbmV3IE1hcCgpO1xuXHRwcml2YXRlIHBlbmRpbmdJQUJsb2NrczogYW55W10gPSBbXTtcblx0cHJpdmF0ZSBhY3RpdmVGb2N1czogYW55ID0gbnVsbDtcblxuXHRhc3luYyBvbmxvYWQoKSB7XG5cdFx0Y29uc29sZS5sb2coJ0NhcmdhbmRvIE1lbW9yaWEgVHJhY2tlciBwbHVnaW4gKE11bHRpLVZhdWx0KS4uLicpO1xuXHRcdFxuXHRcdHRoaXMudmF1bHROYW1lID0gdGhpcy5hcHAudmF1bHQuZ2V0TmFtZSgpO1xuXHRcdGNvbnN0IGJhc2VEaXIgPSBwYXRoLmpvaW4ob3MuaG9tZWRpcigpLCAnLmNvbmZpZycsICdvYnNpZGlhbi1jb3BpbG90Jyk7XG5cdFx0dGhpcy5mb2N1c1BhdGggPSBwYXRoLmpvaW4oYmFzZURpciwgJ2FjdGl2ZV9mb2N1cy5qc29uJyk7XG5cdFx0dGhpcy5jcnVkTWFpbGJveFBhdGggPSBwYXRoLmpvaW4oYmFzZURpciwgJ3ZhdWx0cycsIGAke3RoaXMudmF1bHROYW1lfS5qc29uYCk7XG5cblx0XHQvLyBDdXJzb3IgdHJhY2tpbmdcblx0XHRjb25zdCB1cGRhdGVDdXJzb3IgPSAoKSA9PiB7XG5cdFx0XHRjb25zdCBhY3RpdmVGaWxlID0gdGhpcy5hcHAud29ya3NwYWNlLmdldEFjdGl2ZUZpbGUoKTtcblx0XHRcdGlmICghYWN0aXZlRmlsZSkgcmV0dXJuO1xuXG5cdFx0XHRsZXQgbGluZSA9IDE7XG5cdFx0XHRsZXQgY2ggPSAwO1xuXG5cdFx0XHRjb25zdCB2aWV3ID0gdGhpcy5hcHAud29ya3NwYWNlLmdldEFjdGl2ZVZpZXdPZlR5cGUoTWFya2Rvd25WaWV3KTtcblx0XHRcdGlmICh2aWV3ICYmIHZpZXcuZmlsZSAmJiB2aWV3LmZpbGUucGF0aCA9PT0gYWN0aXZlRmlsZS5wYXRoICYmIHZpZXcuZWRpdG9yKSB7XG5cdFx0XHRcdGNvbnN0IHBvcyA9IHZpZXcuZWRpdG9yLmdldEN1cnNvcigpO1xuXHRcdFx0XHRsaW5lID0gcG9zLmxpbmUgKyAxO1xuXHRcdFx0XHRjaCA9IHBvcy5jaDtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbmV3Rm9jdXMgPSB7IGZpbGU6IGFjdGl2ZUZpbGUucGF0aCwgbGluZSwgY2ggfTtcblx0XHRcdHRoaXMuYWN0aXZlRm9jdXMgPSBuZXdGb2N1cztcblx0XHRcdHRoaXMuc2NoZWR1bGVGb2N1c1VwZGF0ZSgpO1xuXHRcdH07XG5cblx0XHRjb25zdCBzY2hlZHVsZVVwZGF0ZSA9ICgpID0+IHtcblx0XHRcdHNldFRpbWVvdXQodXBkYXRlQ3Vyc29yLCAxMDApO1xuXHRcdH07XG5cblx0XHR0aGlzLnJlZ2lzdGVyRG9tRXZlbnQoZG9jdW1lbnQsICdtb3VzZWRvd24nLCBzY2hlZHVsZVVwZGF0ZSk7XG5cdFx0dGhpcy5yZWdpc3RlckRvbUV2ZW50KGRvY3VtZW50LCAna2V5dXAnLCBzY2hlZHVsZVVwZGF0ZSk7XG5cdFx0dGhpcy5yZWdpc3RlckRvbUV2ZW50KHdpbmRvdywgJ2ZvY3VzJywgc2NoZWR1bGVVcGRhdGUpO1xuXG5cdFx0dGhpcy5yZWdpc3RlckV2ZW50KFxuXHRcdFx0dGhpcy5hcHAud29ya3NwYWNlLm9uKCdhY3RpdmUtbGVhZi1jaGFuZ2UnLCAoKSA9PiB7XG5cdFx0XHRcdHNjaGVkdWxlVXBkYXRlKCk7XG5cdFx0XHR9KVxuXHRcdCk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyRXZlbnQoXG5cdFx0XHR0aGlzLmFwcC53b3Jrc3BhY2Uub24oJ2VkaXRvci1jaGFuZ2UnLCAoZWRpdG9yOiBFZGl0b3IsIHZpZXc6IE1hcmtkb3duVmlldykgPT4ge1xuXHRcdFx0XHRpZiAodmlldyAmJiB2aWV3LmZpbGUpIHtcblx0XHRcdFx0XHRjb25zdCBwb3MgPSBlZGl0b3IuZ2V0Q3Vyc29yKCk7XG5cdFx0XHRcdFx0dGhpcy5hY3RpdmVGb2N1cyA9IHsgZmlsZTogdmlldy5maWxlLnBhdGgsIGxpbmU6IHBvcy5saW5lICsgMSwgY2g6IHBvcy5jaCB9O1xuXHRcdFx0XHRcdHRoaXMuc2NoZWR1bGVGb2N1c1VwZGF0ZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KVxuXHRcdCk7XG5cdFx0dGhpcy5yZWdpc3RlckV2ZW50KFxuXHRcdFx0dGhpcy5hcHAud29ya3NwYWNlLm9uKCdmaWxlLW9wZW4nLCAoZmlsZTogVEZpbGUgfCBudWxsKSA9PiB7XG5cdFx0XHRcdGlmIChmaWxlKSB7XG5cdFx0XHRcdFx0Y29uc3QgdmlldyA9IHRoaXMuYXBwLndvcmtzcGFjZS5nZXRBY3RpdmVWaWV3T2ZUeXBlKE1hcmtkb3duVmlldyk7XG5cdFx0XHRcdFx0aWYgKHZpZXcgJiYgdmlldy5lZGl0b3IpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHBvcyA9IHZpZXcuZWRpdG9yLmdldEN1cnNvcigpO1xuXHRcdFx0XHRcdFx0dGhpcy5hY3RpdmVGb2N1cyA9IHsgZmlsZTogZmlsZS5wYXRoLCBsaW5lOiBwb3MubGluZSArIDEsIGNoOiBwb3MuY2ggfTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0dGhpcy5hY3RpdmVGb2N1cyA9IHsgZmlsZTogZmlsZS5wYXRoLCBsaW5lOiAxLCBjaDogMCB9O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0aGlzLnNjaGVkdWxlRm9jdXNVcGRhdGUoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSlcblx0XHQpO1xuXG5cdFx0Ly8gQ1JVRCB0cmFja2luZ1xuXHRcdHRoaXMucmVnaXN0ZXJFdmVudCh0aGlzLmFwcC52YXVsdC5vbignY3JlYXRlJywgKGZpbGU6IFRBYnN0cmFjdEZpbGUpID0+IHRoaXMuaGFuZGxlQ3J1ZCgnY3JlYXRlZCcsIGZpbGUpKSk7XG5cdFx0dGhpcy5yZWdpc3RlckV2ZW50KHRoaXMuYXBwLnZhdWx0Lm9uKCdtb2RpZnknLCAoZmlsZTogVEFic3RyYWN0RmlsZSkgPT4gdGhpcy5oYW5kbGVDcnVkKCdtb2RpZmllZCcsIGZpbGUpKSk7XG5cdFx0dGhpcy5yZWdpc3RlckV2ZW50KHRoaXMuYXBwLnZhdWx0Lm9uKCdkZWxldGUnLCAoZmlsZTogVEFic3RyYWN0RmlsZSkgPT4gdGhpcy5oYW5kbGVDcnVkKCdkZWxldGVkJywgZmlsZSkpKTtcblx0XHR0aGlzLnJlZ2lzdGVyRXZlbnQodGhpcy5hcHAudmF1bHQub24oJ3JlbmFtZScsIChmaWxlOiBUQWJzdHJhY3RGaWxlLCBvbGRQYXRoOiBzdHJpbmcpID0+IHtcblx0XHRcdHRoaXMucGVuZGluZ0NoYW5nZXMuc2V0KG9sZFBhdGgsIHsgb3A6ICdkZWxldGVkJywgcGF0aDogb2xkUGF0aCB9KTtcblx0XHRcdHRoaXMuaGFuZGxlQ3J1ZCgnY3JlYXRlZCcsIGZpbGUpO1xuXHRcdFx0aWYgKHRoaXMuYWN0aXZlRm9jdXMgJiYgdGhpcy5hY3RpdmVGb2N1cy5maWxlID09PSBvbGRQYXRoKSB7XG5cdFx0XHRcdHRoaXMuYWN0aXZlRm9jdXMuZmlsZSA9IGZpbGUucGF0aDtcblx0XHRcdFx0dGhpcy5zY2hlZHVsZUZvY3VzVXBkYXRlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0b251bmxvYWQoKSB7XG5cdFx0Y29uc29sZS5sb2coJ0Rlc2NhcmdhbmRvIE1lbW9yaWEgVHJhY2tlciBwbHVnaW4uLi4nKTtcblx0XHRpZiAodGhpcy5mb2N1c0RlYm91bmNlVGltZXIpIGNsZWFyVGltZW91dCh0aGlzLmZvY3VzRGVib3VuY2VUaW1lcik7XG5cdFx0aWYgKHRoaXMuY3J1ZERlYm91bmNlVGltZXIpIGNsZWFyVGltZW91dCh0aGlzLmNydWREZWJvdW5jZVRpbWVyKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgaGFuZGxlQ3J1ZChvcDogc3RyaW5nLCBhYnN0cmFjdEZpbGU6IFRBYnN0cmFjdEZpbGUpIHtcblx0XHRpZiAodGhpcy5zaG91bGRJZ25vcmUoYWJzdHJhY3RGaWxlLnBhdGgpKSByZXR1cm47XG5cdFx0aWYgKCEoYWJzdHJhY3RGaWxlIGluc3RhbmNlb2YgVEZpbGUpKSByZXR1cm47XG5cblx0XHRjb25zdCBmaWxlID0gYWJzdHJhY3RGaWxlIGFzIFRGaWxlO1xuXHRcdGxldCBleGNlcnB0ID0gJyc7XG5cblx0XHRpZiAob3AgPT09ICdjcmVhdGVkJyB8fCBvcCA9PT0gJ21vZGlmaWVkJykge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMuYXBwLnZhdWx0LmNhY2hlZFJlYWQoZmlsZSk7XG5cdFx0XHRcdGV4Y2VycHQgPSBjb250ZW50Lmxlbmd0aCA+IDMwMCA/IGNvbnRlbnQuc3Vic3RyaW5nKDAsIDMwMCkgKyAnLi4uJyA6IGNvbnRlbnQ7XG5cdFx0XHRcdFxuXHRcdFx0XHRpZiAob3AgPT09ICdtb2RpZmllZCcpIHtcblx0XHRcdFx0XHR0aGlzLmV4dHJhY3RJQUJsb2NrcyhmaWxlLnBhdGgsIGNvbnRlbnQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoKGUpIHt9XG5cdFx0fVxuXG5cdFx0dGhpcy5wZW5kaW5nQ2hhbmdlcy5zZXQoZmlsZS5wYXRoLCB7IG9wLCBwYXRoOiBmaWxlLnBhdGgsIGV4Y2VycHQgfSk7XG5cdFx0dGhpcy5zY2hlZHVsZUNydWRVcGRhdGUoKTtcblx0fVxuXG5cdHByaXZhdGUgZXh0cmFjdElBQmxvY2tzKGZpbGVQYXRoOiBzdHJpbmcsIGNvbnRlbnQ6IHN0cmluZykge1xuXHRcdGNvbnN0IGxpbmVzID0gY29udGVudC5zcGxpdCgnXFxuJyk7XG5cdFx0Y29uc3QgcmVnZXggPSAvXFwvaWFcXChbJ1wiXShbXidcIl0rKVsnXCJdXFwpLztcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGxpbmVzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCBtID0gbGluZXNbaV0ubWF0Y2gocmVnZXgpO1xuXHRcdFx0aWYgKG0gJiYgbS5sZW5ndGggPiAxKSB7XG5cdFx0XHRcdHRoaXMucGVuZGluZ0lBQmxvY2tzLnB1c2goeyBmaWxlOiBmaWxlUGF0aCwgbGluZTogaSArIDEsIHByb21wdDogbVsxXSB9KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHNob3VsZElnbm9yZShmaWxlUGF0aDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgcGFydHMgPSBmaWxlUGF0aC5zcGxpdCgnLycpO1xuXHRcdGlmIChwYXJ0cy5pbmNsdWRlcygnLm9ic2lkaWFuJykgfHwgcGFydHMuaW5jbHVkZXMoJy5naXQnKSB8fCBwYXJ0cy5pbmNsdWRlcygnLnRyYXNoJykpIHJldHVybiB0cnVlO1xuXHRcdGNvbnN0IGJhc2UgPSBwYXRoLmJhc2VuYW1lKGZpbGVQYXRoKTtcblx0XHRpZiAoYmFzZS5zdGFydHNXaXRoKCcuJykgfHwgYmFzZS5lbmRzV2l0aCgnficpIHx8IGJhc2UuZW5kc1dpdGgoJy50bXAnKSkgcmV0dXJuIHRydWU7XG5cdFx0aWYgKCFiYXNlLmVuZHNXaXRoKCcubWQnKSkgcmV0dXJuIHRydWU7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSBzY2hlZHVsZUZvY3VzVXBkYXRlKCkge1xuXHRcdGlmICh0aGlzLmZvY3VzRGVib3VuY2VUaW1lcikgY2xlYXJUaW1lb3V0KHRoaXMuZm9jdXNEZWJvdW5jZVRpbWVyKTtcblx0XHR0aGlzLmZvY3VzRGVib3VuY2VUaW1lciA9IHNldFRpbWVvdXQoKCkgPT4gdGhpcy5mbHVzaEZvY3VzKCksIDEwMCk7XG5cdH1cblxuXHRwcml2YXRlIHNjaGVkdWxlQ3J1ZFVwZGF0ZSgpIHtcblx0XHRpZiAodGhpcy5jcnVkRGVib3VuY2VUaW1lcikgY2xlYXJUaW1lb3V0KHRoaXMuY3J1ZERlYm91bmNlVGltZXIpO1xuXHRcdHRoaXMuY3J1ZERlYm91bmNlVGltZXIgPSBzZXRUaW1lb3V0KCgpID0+IHRoaXMuZmx1c2hDcnVkKCksIDUwMCk7XG5cdH1cblxuXHRwcml2YXRlIGZsdXNoRm9jdXMoKSB7XG5cdFx0dHJ5IHtcblx0XHRcdGlmICghdGhpcy5hY3RpdmVGb2N1cykgcmV0dXJuO1xuXHRcdFx0XG5cdFx0XHRjb25zdCBwYXlsb2FkID0ge1xuXHRcdFx0XHR0czogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuXHRcdFx0XHR2YXVsdDogdGhpcy52YXVsdE5hbWUsXG5cdFx0XHRcdHZhdWx0UGF0aDogKHRoaXMuYXBwLnZhdWx0LmFkYXB0ZXIgYXMgYW55KS5iYXNlUGF0aCB8fCAnJyxcblx0XHRcdFx0Zm9jdXM6IHRoaXMuYWN0aXZlRm9jdXNcblx0XHRcdH07XG5cdFx0XHRcblx0XHRcdGZzLm1rZGlyU3luYyhwYXRoLmRpcm5hbWUodGhpcy5mb2N1c1BhdGgpLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcblx0XHRcdGZzLndyaXRlRmlsZVN5bmModGhpcy5mb2N1c1BhdGgsIEpTT04uc3RyaW5naWZ5KHBheWxvYWQsIG51bGwsIDIpLCAndXRmOCcpO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdGNvbnNvbGUuZXJyb3IoJ0Vycm9yIGFjdHVhbGl6YW5kbyBmb2N1czonLCBlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGZsdXNoQ3J1ZCgpIHtcblx0XHR0cnkge1xuXHRcdFx0bGV0IGRhdGEgPSB7IHRzOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksIHZhdWx0OiAnJywgY2hhbmdlczogW10gYXMgYW55W10sIGlhX2Jsb2NrczogW10gYXMgYW55W10gfTtcblx0XHRcdFxuXHRcdFx0aWYgKGZzLmV4aXN0c1N5bmModGhpcy5jcnVkTWFpbGJveFBhdGgpKSB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0ZGF0YSA9IEpTT04ucGFyc2UoZnMucmVhZEZpbGVTeW5jKHRoaXMuY3J1ZE1haWxib3hQYXRoLCAndXRmOCcpKTtcblx0XHRcdFx0fSBjYXRjaCAoZSkge31cblx0XHRcdH1cblxuXHRcdFx0Ly8gTWVyZ2UgY2hhbmdlc1xuXHRcdFx0Y29uc3QgbWVyZ2VkQ2hhbmdlcyA9IFsuLi4oZGF0YS5jaGFuZ2VzIHx8IFtdKV07XG5cdFx0XHRmb3IgKGNvbnN0IGNoYW5nZSBvZiB0aGlzLnBlbmRpbmdDaGFuZ2VzLnZhbHVlcygpKSB7XG5cdFx0XHRcdG1lcmdlZENoYW5nZXMucHVzaChjaGFuZ2UpO1xuXHRcdFx0fVxuXHRcdFx0XG5cdFx0XHQvLyBNZXJnZSBibG9ja3Ncblx0XHRcdGNvbnN0IG1lcmdlZEJsb2NrcyA9IFsuLi4oZGF0YS5pYV9ibG9ja3MgfHwgW10pLCAuLi50aGlzLnBlbmRpbmdJQUJsb2Nrc107XG5cblx0XHRcdGNvbnN0IHBheWxvYWQgPSB7XG5cdFx0XHRcdHRzOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG5cdFx0XHRcdHZhdWx0OiAodGhpcy5hcHAudmF1bHQuYWRhcHRlciBhcyBhbnkpLmJhc2VQYXRoIHx8ICcnLFxuXHRcdFx0XHRjaGFuZ2VzOiBtZXJnZWRDaGFuZ2VzLFxuXHRcdFx0XHRpYV9ibG9ja3M6IG1lcmdlZEJsb2Nrc1xuXHRcdFx0fTtcblxuXHRcdFx0ZnMubWtkaXJTeW5jKHBhdGguZGlybmFtZSh0aGlzLmNydWRNYWlsYm94UGF0aCksIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuXHRcdFx0ZnMud3JpdGVGaWxlU3luYyh0aGlzLmNydWRNYWlsYm94UGF0aCwgSlNPTi5zdHJpbmdpZnkocGF5bG9hZCwgbnVsbCwgMiksICd1dGY4Jyk7XG5cblx0XHRcdC8vIENsZWFyIHBlbmRpbmdcblx0XHRcdHRoaXMucGVuZGluZ0NoYW5nZXMuY2xlYXIoKTtcblx0XHRcdHRoaXMucGVuZGluZ0lBQmxvY2tzID0gW107XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRjb25zb2xlLmVycm9yKCdFcnJvciBlc2NyaWJpZW5kbyBhbCBidXpcdTAwRjNuIENSVUQ6JywgZXJyKTtcblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLHNCQUFtRTtBQUNuRSxTQUFvQjtBQUNwQixTQUFvQjtBQUNwQixXQUFzQjtBQUV0QixJQUFxQixpQkFBckIsY0FBNEMsdUJBQU87QUFBQSxFQUFuRDtBQUFBO0FBQ0MsU0FBUSxxQkFBNEM7QUFDcEQsU0FBUSxvQkFBMkM7QUFJbkQsU0FBUSxpQkFBbUMsb0JBQUksSUFBSTtBQUNuRCxTQUFRLGtCQUF5QixDQUFDO0FBQ2xDLFNBQVEsY0FBbUI7QUFBQTtBQUFBLEVBRTNCLE1BQU0sU0FBUztBQUNkLFlBQVEsSUFBSSxrREFBa0Q7QUFFOUQsU0FBSyxZQUFZLEtBQUssSUFBSSxNQUFNLFFBQVE7QUFDeEMsVUFBTSxVQUFlLFVBQVEsV0FBUSxHQUFHLFdBQVcsa0JBQWtCO0FBQ3JFLFNBQUssWUFBaUIsVUFBSyxTQUFTLG1CQUFtQjtBQUN2RCxTQUFLLGtCQUF1QixVQUFLLFNBQVMsVUFBVSxHQUFHLEtBQUssU0FBUyxPQUFPO0FBRzVFLFVBQU0sZUFBZSxNQUFNO0FBQzFCLFlBQU0sYUFBYSxLQUFLLElBQUksVUFBVSxjQUFjO0FBQ3BELFVBQUksQ0FBQyxXQUFZO0FBRWpCLFVBQUksT0FBTztBQUNYLFVBQUksS0FBSztBQUVULFlBQU0sT0FB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
