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
  default: () => Obsitracer
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var import_child_process = require("child_process");
var fs = __toESM(require("fs"));
var os = __toESM(require("os"));
var path = __toESM(require("path"));
var Obsitracer = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    this.focusDebounceTimer = null;
    this.crudDebounceTimer = null;
    this.pendingChanges = /* @__PURE__ */ new Map();
    this.pendingIABlocks = [];
    this.activeFocus = null;
  }
  async onload() {
    console.log("Cargando Obsitracer plugin (Multi-Vault)...");
    this.vaultName = this.app.vault.getName();
    const baseDir = path.join(os.homedir(), ".config", "obsitracer");
    const vaultDir = path.join(baseDir, "vaults", this.vaultName);
    this.focusPath = path.join(vaultDir, "focus.json");
    this.crudMailboxPath = path.join(vaultDir, "crud.json");
    this.registerVaultToList();
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
    console.log("Descargando Obsitracer plugin...");
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
      const label = `\u{1F4CD} ${this.vaultName}/${this.activeFocus.file}`;
      try {
        (0, import_child_process.exec)(`tmux set -gq @obsitracer "${label}" && tmux refresh-client -S`, { timeout: 200 }, () => {
        });
      } catch (_) {
      }
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
  registerVaultToList() {
    try {
      const baseDir = path.join(os.homedir(), ".config", "obsitracer");
      const listPath = path.join(baseDir, "vaults.json");
      const vaultPath = this.app.vault.adapter.basePath || "";
      let list = [];
      if (fs.existsSync(listPath)) {
        try {
          list = JSON.parse(fs.readFileSync(listPath, "utf8"));
        } catch (e) {
        }
      }
      list = list.filter((v) => fs.existsSync(v.path));
      const indexByPath = list.findIndex((v) => v.path === vaultPath);
      const indexByName = list.findIndex((v) => v.name === this.vaultName);
      let changed = false;
      if (indexByPath !== -1) {
        if (list[indexByPath].name !== this.vaultName) {
          list[indexByPath].name = this.vaultName;
          changed = true;
        }
      } else if (indexByName !== -1) {
        if (list[indexByName].path !== vaultPath) {
          list[indexByName].path = vaultPath;
          changed = true;
        }
      } else {
        list.push({ name: this.vaultName, path: vaultPath });
        changed = true;
      }
      fs.mkdirSync(baseDir, { recursive: true });
      fs.writeFileSync(listPath, JSON.stringify(list, null, 2), "utf8");
    } catch (e) {
      console.error("Error registrando vault en la lista global:", e);
    }
  }
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsibWFpbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0IHsgUGx1Z2luLCBFZGl0b3IsIE1hcmtkb3duVmlldywgVEZpbGUsIFRBYnN0cmFjdEZpbGUgfSBmcm9tICdvYnNpZGlhbic7XG5pbXBvcnQgeyBleGVjU3luYywgZXhlYyB9IGZyb20gJ2NoaWxkX3Byb2Nlc3MnO1xuaW1wb3J0ICogYXMgZnMgZnJvbSAnZnMnO1xuaW1wb3J0ICogYXMgb3MgZnJvbSAnb3MnO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcblxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgT2JzaXRyYWNlciBleHRlbmRzIFBsdWdpbiB7XG5cdHByaXZhdGUgZm9jdXNEZWJvdW5jZVRpbWVyOiBOb2RlSlMuVGltZW91dCB8IG51bGwgPSBudWxsO1xuXHRwcml2YXRlIGNydWREZWJvdW5jZVRpbWVyOiBOb2RlSlMuVGltZW91dCB8IG51bGwgPSBudWxsO1xuXHRwcml2YXRlIGZvY3VzUGF0aDogc3RyaW5nO1xuXHRwcml2YXRlIGNydWRNYWlsYm94UGF0aDogc3RyaW5nO1xuXHRwcml2YXRlIHZhdWx0TmFtZTogc3RyaW5nO1xuXHRwcml2YXRlIHBlbmRpbmdDaGFuZ2VzOiBNYXA8c3RyaW5nLCBhbnk+ID0gbmV3IE1hcCgpO1xuXHRwcml2YXRlIHBlbmRpbmdJQUJsb2NrczogYW55W10gPSBbXTtcblx0cHJpdmF0ZSBhY3RpdmVGb2N1czogYW55ID0gbnVsbDtcblxuXHRhc3luYyBvbmxvYWQoKSB7XG5cdFx0Y29uc29sZS5sb2coJ0NhcmdhbmRvIE9ic2l0cmFjZXIgcGx1Z2luIChNdWx0aS1WYXVsdCkuLi4nKTtcblx0XHRcblx0XHR0aGlzLnZhdWx0TmFtZSA9IHRoaXMuYXBwLnZhdWx0LmdldE5hbWUoKTtcblx0XHRjb25zdCBiYXNlRGlyID0gcGF0aC5qb2luKG9zLmhvbWVkaXIoKSwgJy5jb25maWcnLCAnb2JzaXRyYWNlcicpO1xuXHRcdGNvbnN0IHZhdWx0RGlyID0gcGF0aC5qb2luKGJhc2VEaXIsICd2YXVsdHMnLCB0aGlzLnZhdWx0TmFtZSk7XG5cdFx0XG5cdFx0dGhpcy5mb2N1c1BhdGggPSBwYXRoLmpvaW4odmF1bHREaXIsICdmb2N1cy5qc29uJyk7XG5cdFx0dGhpcy5jcnVkTWFpbGJveFBhdGggPSBwYXRoLmpvaW4odmF1bHREaXIsICdjcnVkLmpzb24nKTtcblx0XHRcblx0XHR0aGlzLnJlZ2lzdGVyVmF1bHRUb0xpc3QoKTtcblxuXG5cblx0XHQvLyBDdXJzb3IgdHJhY2tpbmdcblx0XHRjb25zdCB1cGRhdGVDdXJzb3IgPSAoKSA9PiB7XG5cdFx0XHRjb25zdCBhY3RpdmVGaWxlID0gdGhpcy5hcHAud29ya3NwYWNlLmdldEFjdGl2ZUZpbGUoKTtcblxuXHRcdFx0aWYgKGFjdGl2ZUZpbGUpIHtcblx0XHRcdFx0bGV0IGxpbmUgPSAxO1xuXHRcdFx0XHRsZXQgY2ggPSAwO1xuXG5cdFx0XHRcdGNvbnN0IHZpZXcgPSB0aGlzLmFwcC53b3Jrc3BhY2UuZ2V0QWN0aXZlVmlld09mVHlwZShNYXJrZG93blZpZXcpO1xuXHRcdFx0XHRpZiAodmlldyAmJiB2aWV3LmZpbGUgJiYgdmlldy5maWxlLnBhdGggPT09IGFjdGl2ZUZpbGUucGF0aCAmJiB2aWV3LmVkaXRvcikge1xuXHRcdFx0XHRcdGNvbnN0IHBvcyA9IHZpZXcuZWRpdG9yLmdldEN1cnNvcigpO1xuXHRcdFx0XHRcdGxpbmUgPSBwb3MubGluZSArIDE7XG5cdFx0XHRcdFx0Y2ggPSBwb3MuY2g7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aGlzLmFjdGl2ZUZvY3VzID0geyBmaWxlOiBhY3RpdmVGaWxlLnBhdGgsIGxpbmUsIGNoIH07XG5cdFx0XHR9XG5cblx0XHRcdC8vIEFsd2F5cyBmbHVzaCB2YXVsdCBpZGVudGl0eSwgZXZlbiB3aXRob3V0IGFuIGFjdGl2ZSBmaWxlXG5cdFx0XHR0aGlzLnNjaGVkdWxlRm9jdXNVcGRhdGUoKTtcblx0XHR9O1xuXG5cdFx0Y29uc3Qgc2NoZWR1bGVVcGRhdGUgPSAoKSA9PiB7XG5cdFx0XHRzZXRUaW1lb3V0KHVwZGF0ZUN1cnNvciwgMTAwKTtcblx0XHR9O1xuXG5cdFx0dGhpcy5yZWdpc3RlckRvbUV2ZW50KGRvY3VtZW50LCAnbW91c2Vkb3duJywgc2NoZWR1bGVVcGRhdGUpO1xuXHRcdHRoaXMucmVnaXN0ZXJEb21FdmVudChkb2N1bWVudCwgJ2tleXVwJywgc2NoZWR1bGVVcGRhdGUpO1xuXHRcdHRoaXMucmVnaXN0ZXJEb21FdmVudCh3aW5kb3csICdmb2N1cycsIHNjaGVkdWxlVXBkYXRlKTtcblx0XHR0aGlzLnJlZ2lzdGVyRG9tRXZlbnQoZG9jdW1lbnQuYm9keSwgJ21vdXNlZW50ZXInLCBzY2hlZHVsZVVwZGF0ZSk7XG5cblx0XHQvLyBGYWxsYmFjazogdmlzaWJpbGl0eWNoYW5nZSBpcyBtb3JlIHJlbGlhYmxlIG9uIHNvbWUgTGludXggV01zXG5cdFx0dGhpcy5yZWdpc3RlckRvbUV2ZW50KGRvY3VtZW50LCAndmlzaWJpbGl0eWNoYW5nZScsICgpID0+IHtcblx0XHRcdGlmICghZG9jdW1lbnQuaGlkZGVuKSBzY2hlZHVsZVVwZGF0ZSgpO1xuXHRcdH0pO1xuXG5cdFx0Ly8gUGFyYWNhXHUwMEVEZGFzIGRlIGVtZXJnZW5jaWEgKFBvbGxpbmcpOiBcblx0XHQvLyBQYXJhIHVzdWFyaW9zIGRlIFRpbGluZyBXTXMgKGkzLCBic3B3bSkgbyBBbHQrVGFiIGRvbmRlIGVsIHJhdFx1MDBGM24gbm8gZW50cmEgYSBsYSB2ZW50YW5hXG5cdFx0Ly8gbmkgc2UgZGlzcGFyYW4gY2xpY2tzLCB2YWxpZGFtb3MgY2FkYSAycyBzaSBsYSB2ZW50YW5hIHJlYWxtZW50ZSB0aWVuZSBlbCBmb2NvIGRlbCBPUy5cblx0XHR0aGlzLnJlZ2lzdGVySW50ZXJ2YWwoXG5cdFx0XHR3aW5kb3cuc2V0SW50ZXJ2YWwoKCkgPT4ge1xuXHRcdFx0XHRpZiAoZG9jdW1lbnQuaGFzRm9jdXMoKSkge1xuXHRcdFx0XHRcdHNjaGVkdWxlVXBkYXRlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0sIDIwMDApXG5cdFx0KTtcblxuXHRcdHRoaXMucmVnaXN0ZXJFdmVudChcblx0XHRcdHRoaXMuYXBwLndvcmtzcGFjZS5vbignYWN0aXZlLWxlYWYtY2hhbmdlJywgKCkgPT4ge1xuXHRcdFx0XHRzY2hlZHVsZVVwZGF0ZSgpO1xuXHRcdFx0fSlcblx0XHQpO1xuXG5cdFx0dGhpcy5yZWdpc3RlckV2ZW50KFxuXHRcdFx0dGhpcy5hcHAud29ya3NwYWNlLm9uKCdlZGl0b3ItY2hhbmdlJywgKGVkaXRvcjogRWRpdG9yLCB2aWV3OiBNYXJrZG93blZpZXcpID0+IHtcblx0XHRcdFx0aWYgKHZpZXcgJiYgdmlldy5maWxlKSB7XG5cdFx0XHRcdFx0Y29uc3QgcG9zID0gZWRpdG9yLmdldEN1cnNvcigpO1xuXHRcdFx0XHRcdHRoaXMuYWN0aXZlRm9jdXMgPSB7IGZpbGU6IHZpZXcuZmlsZS5wYXRoLCBsaW5lOiBwb3MubGluZSArIDEsIGNoOiBwb3MuY2ggfTtcblx0XHRcdFx0XHR0aGlzLnNjaGVkdWxlRm9jdXNVcGRhdGUoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSlcblx0XHQpO1xuXHRcdHRoaXMucmVnaXN0ZXJFdmVudChcblx0XHRcdHRoaXMuYXBwLndvcmtzcGFjZS5vbignZmlsZS1vcGVuJywgKGZpbGU6IFRGaWxlIHwgbnVsbCkgPT4ge1xuXHRcdFx0XHRpZiAoZmlsZSkge1xuXHRcdFx0XHRcdGNvbnN0IHZpZXcgPSB0aGlzLmFwcC53b3Jrc3BhY2UuZ2V0QWN0aXZlVmlld09mVHlwZShNYXJrZG93blZpZXcpO1xuXHRcdFx0XHRcdGlmICh2aWV3ICYmIHZpZXcuZWRpdG9yKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBwb3MgPSB2aWV3LmVkaXRvci5nZXRDdXJzb3IoKTtcblx0XHRcdFx0XHRcdHRoaXMuYWN0aXZlRm9jdXMgPSB7IGZpbGU6IGZpbGUucGF0aCwgbGluZTogcG9zLmxpbmUgKyAxLCBjaDogcG9zLmNoIH07XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHRoaXMuYWN0aXZlRm9jdXMgPSB7IGZpbGU6IGZpbGUucGF0aCwgbGluZTogMSwgY2g6IDAgfTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dGhpcy5zY2hlZHVsZUZvY3VzVXBkYXRlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pXG5cdFx0KTtcblxuXHRcdC8vIENSVUQgdHJhY2tpbmdcblx0XHR0aGlzLnJlZ2lzdGVyRXZlbnQodGhpcy5hcHAudmF1bHQub24oJ2NyZWF0ZScsIChmaWxlOiBUQWJzdHJhY3RGaWxlKSA9PiB0aGlzLmhhbmRsZUNydWQoJ2NyZWF0ZWQnLCBmaWxlKSkpO1xuXHRcdHRoaXMucmVnaXN0ZXJFdmVudCh0aGlzLmFwcC52YXVsdC5vbignbW9kaWZ5JywgKGZpbGU6IFRBYnN0cmFjdEZpbGUpID0+IHRoaXMuaGFuZGxlQ3J1ZCgnbW9kaWZpZWQnLCBmaWxlKSkpO1xuXHRcdHRoaXMucmVnaXN0ZXJFdmVudCh0aGlzLmFwcC52YXVsdC5vbignZGVsZXRlJywgKGZpbGU6IFRBYnN0cmFjdEZpbGUpID0+IHRoaXMuaGFuZGxlQ3J1ZCgnZGVsZXRlZCcsIGZpbGUpKSk7XG5cdFx0dGhpcy5yZWdpc3RlckV2ZW50KHRoaXMuYXBwLnZhdWx0Lm9uKCdyZW5hbWUnLCAoZmlsZTogVEFic3RyYWN0RmlsZSwgb2xkUGF0aDogc3RyaW5nKSA9PiB7XG5cdFx0XHR0aGlzLnBlbmRpbmdDaGFuZ2VzLnNldChvbGRQYXRoLCB7IG9wOiAnZGVsZXRlZCcsIHBhdGg6IG9sZFBhdGggfSk7XG5cdFx0XHR0aGlzLmhhbmRsZUNydWQoJ2NyZWF0ZWQnLCBmaWxlKTtcblx0XHRcdGlmICh0aGlzLmFjdGl2ZUZvY3VzICYmIHRoaXMuYWN0aXZlRm9jdXMuZmlsZSA9PT0gb2xkUGF0aCkge1xuXHRcdFx0XHR0aGlzLmFjdGl2ZUZvY3VzLmZpbGUgPSBmaWxlLnBhdGg7XG5cdFx0XHRcdHRoaXMuc2NoZWR1bGVGb2N1c1VwZGF0ZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdG9udW5sb2FkKCkge1xuXHRcdGNvbnNvbGUubG9nKCdEZXNjYXJnYW5kbyBPYnNpdHJhY2VyIHBsdWdpbi4uLicpO1xuXHRcdGlmICh0aGlzLmZvY3VzRGVib3VuY2VUaW1lcikgY2xlYXJUaW1lb3V0KHRoaXMuZm9jdXNEZWJvdW5jZVRpbWVyKTtcblx0XHRpZiAodGhpcy5jcnVkRGVib3VuY2VUaW1lcikgY2xlYXJUaW1lb3V0KHRoaXMuY3J1ZERlYm91bmNlVGltZXIpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBoYW5kbGVDcnVkKG9wOiBzdHJpbmcsIGFic3RyYWN0RmlsZTogVEFic3RyYWN0RmlsZSkge1xuXHRcdGlmICh0aGlzLnNob3VsZElnbm9yZShhYnN0cmFjdEZpbGUucGF0aCkpIHJldHVybjtcblx0XHRpZiAoIShhYnN0cmFjdEZpbGUgaW5zdGFuY2VvZiBURmlsZSkpIHJldHVybjtcblxuXHRcdGNvbnN0IGZpbGUgPSBhYnN0cmFjdEZpbGUgYXMgVEZpbGU7XG5cdFx0bGV0IGV4Y2VycHQgPSAnJztcblxuXHRcdGlmIChvcCA9PT0gJ2NyZWF0ZWQnIHx8IG9wID09PSAnbW9kaWZpZWQnKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5hcHAudmF1bHQuY2FjaGVkUmVhZChmaWxlKTtcblx0XHRcdFx0ZXhjZXJwdCA9IGNvbnRlbnQubGVuZ3RoID4gMzAwID8gY29udGVudC5zdWJzdHJpbmcoMCwgMzAwKSArICcuLi4nIDogY29udGVudDtcblx0XHRcdFx0XG5cdFx0XHRcdGlmIChvcCA9PT0gJ21vZGlmaWVkJykge1xuXHRcdFx0XHRcdHRoaXMuZXh0cmFjdElBQmxvY2tzKGZpbGUsIGNvbnRlbnQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoKGUpIHt9XG5cdFx0fVxuXG5cdFx0dGhpcy5wZW5kaW5nQ2hhbmdlcy5zZXQoZmlsZS5wYXRoLCB7IG9wLCBwYXRoOiBmaWxlLnBhdGgsIGV4Y2VycHQgfSk7XG5cdFx0dGhpcy5zY2hlZHVsZUNydWRVcGRhdGUoKTtcblx0fVxuXG5cdHByaXZhdGUgZXh0cmFjdElBQmxvY2tzKGZpbGU6IFRGaWxlLCBjb250ZW50OiBzdHJpbmcpIHtcblx0XHRjb25zdCBsaW5lcyA9IGNvbnRlbnQuc3BsaXQoJ1xcbicpO1xuXHRcdGNvbnN0IHJlZ2V4ID0gL1xcL2lhXFwoWydcIl0oW14nXCJdKylbJ1wiXVxcKS87XG5cdFx0bGV0IGhhc01hdGNoID0gZmFsc2U7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBsaW5lcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3QgbSA9IGxpbmVzW2ldLm1hdGNoKHJlZ2V4KTtcblx0XHRcdGlmIChtICYmIG0ubGVuZ3RoID4gMSkge1xuXHRcdFx0XHR0aGlzLnBlbmRpbmdJQUJsb2Nrcy5wdXNoKHsgZmlsZTogZmlsZS5wYXRoLCBsaW5lOiBpICsgMSwgcHJvbXB0OiBtWzFdIH0pO1xuXHRcdFx0XHRoYXNNYXRjaCA9IHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGhhc01hdGNoKSB7XG5cdFx0XHR0aGlzLmFwcC52YXVsdC5wcm9jZXNzKGZpbGUsIChkYXRhKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGRhdGFMaW5lcyA9IGRhdGEuc3BsaXQoJ1xcbicpO1xuXHRcdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGRhdGFMaW5lcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRcdGlmIChyZWdleC50ZXN0KGRhdGFMaW5lc1tpXSkpIHtcblx0XHRcdFx0XHRcdGRhdGFMaW5lc1tpXSA9IGRhdGFMaW5lc1tpXS5yZXBsYWNlKHJlZ2V4LCAnJykudHJpbSgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gZGF0YUxpbmVzLmpvaW4oJ1xcbicpO1xuXHRcdFx0fSkuY2F0Y2goZSA9PiBjb25zb2xlLmVycm9yKGUpKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHNob3VsZElnbm9yZShmaWxlUGF0aDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgcGFydHMgPSBmaWxlUGF0aC5zcGxpdCgnLycpO1xuXHRcdGlmIChwYXJ0cy5pbmNsdWRlcygnLm9ic2lkaWFuJykgfHwgcGFydHMuaW5jbHVkZXMoJy5naXQnKSB8fCBwYXJ0cy5pbmNsdWRlcygnLnRyYXNoJykpIHJldHVybiB0cnVlO1xuXHRcdGNvbnN0IGJhc2UgPSBwYXRoLmJhc2VuYW1lKGZpbGVQYXRoKTtcblx0XHRpZiAoYmFzZS5zdGFydHNXaXRoKCcuJykgfHwgYmFzZS5lbmRzV2l0aCgnficpIHx8IGJhc2UuZW5kc1dpdGgoJy50bXAnKSkgcmV0dXJuIHRydWU7XG5cdFx0aWYgKCFiYXNlLmVuZHNXaXRoKCcubWQnKSkgcmV0dXJuIHRydWU7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSBzY2hlZHVsZUZvY3VzVXBkYXRlKCkge1xuXHRcdGlmICh0aGlzLmZvY3VzRGVib3VuY2VUaW1lcikgY2xlYXJUaW1lb3V0KHRoaXMuZm9jdXNEZWJvdW5jZVRpbWVyKTtcblx0XHR0aGlzLmZvY3VzRGVib3VuY2VUaW1lciA9IHNldFRpbWVvdXQoKCkgPT4gdGhpcy5mbHVzaEZvY3VzKCksIDEwMCk7XG5cdH1cblxuXHRwcml2YXRlIHNjaGVkdWxlQ3J1ZFVwZGF0ZSgpIHtcblx0XHRpZiAodGhpcy5jcnVkRGVib3VuY2VUaW1lcikgY2xlYXJUaW1lb3V0KHRoaXMuY3J1ZERlYm91bmNlVGltZXIpO1xuXHRcdHRoaXMuY3J1ZERlYm91bmNlVGltZXIgPSBzZXRUaW1lb3V0KCgpID0+IHRoaXMuZmx1c2hDcnVkKCksIDUwMCk7XG5cdH1cblxuXHRwcml2YXRlIGZsdXNoRm9jdXMoKSB7XG5cdFx0dHJ5IHtcblx0XHRcdGlmICghdGhpcy5hY3RpdmVGb2N1cykgcmV0dXJuO1xuXHRcdFx0XG5cdFx0XHRjb25zdCBwYXlsb2FkID0ge1xuXHRcdFx0XHR0czogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuXHRcdFx0XHR2YXVsdDogdGhpcy52YXVsdE5hbWUsXG5cdFx0XHRcdHZhdWx0UGF0aDogKHRoaXMuYXBwLnZhdWx0LmFkYXB0ZXIgYXMgYW55KS5iYXNlUGF0aCB8fCAnJyxcblx0XHRcdFx0Zm9jdXM6IHRoaXMuYWN0aXZlRm9jdXNcblx0XHRcdH07XG5cdFx0XHRcblx0XHRcdGZzLm1rZGlyU3luYyhwYXRoLmRpcm5hbWUodGhpcy5mb2N1c1BhdGgpLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcblx0XHRcdGZzLndyaXRlRmlsZVN5bmModGhpcy5mb2N1c1BhdGgsIEpTT04uc3RyaW5naWZ5KHBheWxvYWQsIG51bGwsIDIpLCAndXRmOCcpO1xuXG5cdFx0XHQvLyBDYW5hbCByZWFjdGl2byBcdTIxOTIgdG11eDogZW1wdWphIGVsIGZvY28gYWN0dWFsIHkgZnVlcnphIHJlY2FyZ2EgZGVsIHdpZGdldCBkZSBmb3JtYSBBU1x1MDBDRE5DUk9OQVxuXHRcdFx0Y29uc3QgbGFiZWwgPSBgXHVEODNEXHVEQ0NEICR7dGhpcy52YXVsdE5hbWV9LyR7dGhpcy5hY3RpdmVGb2N1cy5maWxlfWA7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRleGVjKGB0bXV4IHNldCAtZ3EgQG9ic2l0cmFjZXIgXCIke2xhYmVsfVwiICYmIHRtdXggcmVmcmVzaC1jbGllbnQgLVNgLCB7IHRpbWVvdXQ6IDIwMCB9LCAoKSA9PiB7fSk7XG5cdFx0XHR9IGNhdGNoIChfKSB7XG5cdFx0XHRcdC8vIFNpbGVuY2lvc29cblx0XHRcdH1cblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRjb25zb2xlLmVycm9yKCdFcnJvciBhY3R1YWxpemFuZG8gZm9jdXM6JywgZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBmbHVzaENydWQoKSB7XG5cdFx0dHJ5IHtcblx0XHRcdGxldCBkYXRhID0geyB0czogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLCB2YXVsdDogJycsIGNoYW5nZXM6IFtdIGFzIGFueVtdLCBpYV9ibG9ja3M6IFtdIGFzIGFueVtdIH07XG5cdFx0XHRcblx0XHRcdGlmIChmcy5leGlzdHNTeW5jKHRoaXMuY3J1ZE1haWxib3hQYXRoKSkge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGRhdGEgPSBKU09OLnBhcnNlKGZzLnJlYWRGaWxlU3luYyh0aGlzLmNydWRNYWlsYm94UGF0aCwgJ3V0ZjgnKSk7XG5cdFx0XHRcdH0gY2F0Y2ggKGUpIHt9XG5cdFx0XHR9XG5cblx0XHRcdC8vIE1lcmdlIGNoYW5nZXNcblx0XHRcdGNvbnN0IG1lcmdlZENoYW5nZXMgPSBbLi4uKGRhdGEuY2hhbmdlcyB8fCBbXSldO1xuXHRcdFx0Zm9yIChjb25zdCBjaGFuZ2Ugb2YgdGhpcy5wZW5kaW5nQ2hhbmdlcy52YWx1ZXMoKSkge1xuXHRcdFx0XHRtZXJnZWRDaGFuZ2VzLnB1c2goY2hhbmdlKTtcblx0XHRcdH1cblx0XHRcdFxuXHRcdFx0Ly8gTWVyZ2UgYmxvY2tzXG5cdFx0XHRjb25zdCBtZXJnZWRCbG9ja3MgPSBbLi4uKGRhdGEuaWFfYmxvY2tzIHx8IFtdKSwgLi4udGhpcy5wZW5kaW5nSUFCbG9ja3NdO1xuXG5cdFx0XHRjb25zdCBwYXlsb2FkID0ge1xuXHRcdFx0XHR0czogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuXHRcdFx0XHR2YXVsdDogKHRoaXMuYXBwLnZhdWx0LmFkYXB0ZXIgYXMgYW55KS5iYXNlUGF0aCB8fCAnJyxcblx0XHRcdFx0Y2hhbmdlczogbWVyZ2VkQ2hhbmdlcyxcblx0XHRcdFx0aWFfYmxvY2tzOiBtZXJnZWRCbG9ja3Ncblx0XHRcdH07XG5cblx0XHRcdGZzLm1rZGlyU3luYyhwYXRoLmRpcm5hbWUodGhpcy5jcnVkTWFpbGJveFBhdGgpLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcblx0XHRcdGZzLndyaXRlRmlsZVN5bmModGhpcy5jcnVkTWFpbGJveFBhdGgsIEpTT04uc3RyaW5naWZ5KHBheWxvYWQsIG51bGwsIDIpLCAndXRmOCcpO1xuXG5cdFx0XHQvLyBDbGVhciBwZW5kaW5nXG5cdFx0XHR0aGlzLnBlbmRpbmdDaGFuZ2VzLmNsZWFyKCk7XG5cdFx0XHR0aGlzLnBlbmRpbmdJQUJsb2NrcyA9IFtdO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0Y29uc29sZS5lcnJvcignRXJyb3IgZXNjcmliaWVuZG8gYWwgYnV6XHUwMEYzbiBDUlVEOicsIGVycik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlclZhdWx0VG9MaXN0KCkge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBiYXNlRGlyID0gcGF0aC5qb2luKG9zLmhvbWVkaXIoKSwgJy5jb25maWcnLCAnb2JzaXRyYWNlcicpO1xuXHRcdFx0Y29uc3QgbGlzdFBhdGggPSBwYXRoLmpvaW4oYmFzZURpciwgJ3ZhdWx0cy5qc29uJyk7XG5cdFx0XHRjb25zdCB2YXVsdFBhdGggPSAodGhpcy5hcHAudmF1bHQuYWRhcHRlciBhcyBhbnkpLmJhc2VQYXRoIHx8ICcnO1xuXHRcdFx0XG5cdFx0XHRsZXQgbGlzdDogeyBuYW1lOiBzdHJpbmc7IHBhdGg6IHN0cmluZyB9W10gPSBbXTtcblx0XHRcdGlmIChmcy5leGlzdHNTeW5jKGxpc3RQYXRoKSkge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGxpc3QgPSBKU09OLnBhcnNlKGZzLnJlYWRGaWxlU3luYyhsaXN0UGF0aCwgJ3V0ZjgnKSk7XG5cdFx0XHRcdH0gY2F0Y2ggKGUpIHt9XG5cdFx0XHR9XG5cblx0XHRcdC8vIDEuIExpbXBpYXIgdmF1bHRzIHF1ZSB5YSBubyBleGlzdGVuIGZcdTAwRURzaWNhbWVudGUgZW4gZGlzY28gKG1hbnRlbmltaWVudG8pXG5cdFx0XHRsaXN0ID0gbGlzdC5maWx0ZXIodiA9PiBmcy5leGlzdHNTeW5jKHYucGF0aCkpO1xuXG5cdFx0XHQvLyAyLiBCdXNjYXIgc2kgZXN0ZSB2YXVsdCB5YSBleGlzdGUgZW4gbGEgbGlzdGEgKHBvciBwYXRoIG8gcG9yIG5vbWJyZSlcblx0XHRcdGNvbnN0IGluZGV4QnlQYXRoID0gbGlzdC5maW5kSW5kZXgodiA9PiB2LnBhdGggPT09IHZhdWx0UGF0aCk7XG5cdFx0XHRjb25zdCBpbmRleEJ5TmFtZSA9IGxpc3QuZmluZEluZGV4KHYgPT4gdi5uYW1lID09PSB0aGlzLnZhdWx0TmFtZSk7XG5cblx0XHRcdGxldCBjaGFuZ2VkID0gZmFsc2U7XG5cblx0XHRcdGlmIChpbmRleEJ5UGF0aCAhPT0gLTEpIHtcblx0XHRcdFx0Ly8gU2kgZWwgcGF0aCBjb2luY2lkZSBwZXJvIGVsIG5vbWJyZSBjYW1iaVx1MDBGMyAocmVuYW1lIGRlbCB2YXVsdCksIGFjdHVhbGl6YW1vcyBlbCBub21icmVcblx0XHRcdFx0aWYgKGxpc3RbaW5kZXhCeVBhdGhdLm5hbWUgIT09IHRoaXMudmF1bHROYW1lKSB7XG5cdFx0XHRcdFx0bGlzdFtpbmRleEJ5UGF0aF0ubmFtZSA9IHRoaXMudmF1bHROYW1lO1xuXHRcdFx0XHRcdGNoYW5nZWQgPSB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYgKGluZGV4QnlOYW1lICE9PSAtMSkge1xuXHRcdFx0XHQvLyBTaSBlbCBub21icmUgY29pbmNpZGUgcGVybyBsYSBydXRhIGNhbWJpXHUwMEYzIChzZSBtb3ZpXHUwMEYzIGRlIGNhcnBldGEpLCBhY3R1YWxpemFtb3MgbGEgcnV0YVxuXHRcdFx0XHRpZiAobGlzdFtpbmRleEJ5TmFtZV0ucGF0aCAhPT0gdmF1bHRQYXRoKSB7XG5cdFx0XHRcdFx0bGlzdFtpbmRleEJ5TmFtZV0ucGF0aCA9IHZhdWx0UGF0aDtcblx0XHRcdFx0XHRjaGFuZ2VkID0gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gU2kgZXMgY29tcGxldGFtZW50ZSBudWV2bywgbG8gYVx1MDBGMWFkaW1vc1xuXHRcdFx0XHRsaXN0LnB1c2goeyBuYW1lOiB0aGlzLnZhdWx0TmFtZSwgcGF0aDogdmF1bHRQYXRoIH0pO1xuXHRcdFx0XHRjaGFuZ2VkID0gdHJ1ZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gU2kgaHVibyBjYW1iaW9zIG8gbGEgbGlzdGEgc2UgcmVkdWpvIHBvciBlbCBmaWx0cm8gZGUgZXhpc3RlbmNpYSwgZ3VhcmRhbW9zXG5cdFx0XHRmcy5ta2RpclN5bmMoYmFzZURpciwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG5cdFx0XHRmcy53cml0ZUZpbGVTeW5jKGxpc3RQYXRoLCBKU09OLnN0cmluZ2lmeShsaXN0LCBudWxsLCAyKSwgJ3V0ZjgnKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRjb25zb2xlLmVycm9yKCdFcnJvciByZWdpc3RyYW5kbyB2YXVsdCBlbiBsYSBsaXN0YSBnbG9iYWw6JywgZSk7XG5cdFx0fVxuXHR9XG59XG5cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLHNCQUFtRTtBQUNuRSwyQkFBK0I7QUFDL0IsU0FBb0I7QUFDcEIsU0FBb0I7QUFDcEIsV0FBc0I7QUFFdEIsSUFBcUIsYUFBckIsY0FBd0MsdUJBQU87QUFBQSxFQUEvQztBQUFBO0FBQ0MsU0FBUSxxQkFBNEM7QUFDcEQsU0FBUSxvQkFBMkM7QUFJbkQsU0FBUSxpQkFBbUMsb0JBQUksSUFBSTtBQUNuRCxTQUFRLGtCQUF5QixDQUFDO0FBQ2xDLFNBQVEsY0FBbUI7QUFBQTtBQUFBLEVBRTNCLE1BQU0sU0FBUztBQUNkLFlBQVEsSUFBSSw2Q0FBNkM7QUFFekQsU0FBSyxZQUFZLEtBQUssSUFBSSxNQUFNLFFBQVE7QUFDeEMsVUFBTSxVQUFlLFVBQVEsV0FBUSxHQUFHLFdBQVcsWUFBWTtBQUMvRCxVQUFNLFdBQWdCLFVBQUssU0FBUyxVQUFVLEtBQUssU0FBUztBQUU1RCxTQUFLLFlBQWlCLFVBQUssVUFBVSxZQUFZO0FBQ2pELFNBQUssa0JBQXVCLFVBQUssVUFBVSxXQUFXO0FBRXRELFNBQUssb0JBQW9CO0FBS3pCLFVBQU0sZUFBZSxNQUFNO0FBQzFCLFlBQU0sYUFBYSxLQUFLLElBQUksVUFBVSxjQUFjO0FBRXBELFVBQUksWUFBWTtBQUNmLFlBQUksT0FBTztBQUNY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
