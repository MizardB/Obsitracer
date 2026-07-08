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
        (0, import_child_process.execSync)(`tmux set -gq @obsitracer "${label}"`, { timeout: 200, stdio: "ignore" });
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
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsibWFpbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0IHsgUGx1Z2luLCBFZGl0b3IsIE1hcmtkb3duVmlldywgVEZpbGUsIFRBYnN0cmFjdEZpbGUgfSBmcm9tICdvYnNpZGlhbic7XG5pbXBvcnQgeyBleGVjU3luYyB9IGZyb20gJ2NoaWxkX3Byb2Nlc3MnO1xuaW1wb3J0ICogYXMgZnMgZnJvbSAnZnMnO1xuaW1wb3J0ICogYXMgb3MgZnJvbSAnb3MnO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcblxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgT2JzaXRyYWNlciBleHRlbmRzIFBsdWdpbiB7XG5cdHByaXZhdGUgZm9jdXNEZWJvdW5jZVRpbWVyOiBOb2RlSlMuVGltZW91dCB8IG51bGwgPSBudWxsO1xuXHRwcml2YXRlIGNydWREZWJvdW5jZVRpbWVyOiBOb2RlSlMuVGltZW91dCB8IG51bGwgPSBudWxsO1xuXHRwcml2YXRlIGZvY3VzUGF0aDogc3RyaW5nO1xuXHRwcml2YXRlIGNydWRNYWlsYm94UGF0aDogc3RyaW5nO1xuXHRwcml2YXRlIHZhdWx0TmFtZTogc3RyaW5nO1xuXHRwcml2YXRlIHBlbmRpbmdDaGFuZ2VzOiBNYXA8c3RyaW5nLCBhbnk+ID0gbmV3IE1hcCgpO1xuXHRwcml2YXRlIHBlbmRpbmdJQUJsb2NrczogYW55W10gPSBbXTtcblx0cHJpdmF0ZSBhY3RpdmVGb2N1czogYW55ID0gbnVsbDtcblxuXHRhc3luYyBvbmxvYWQoKSB7XG5cdFx0Y29uc29sZS5sb2coJ0NhcmdhbmRvIE9ic2l0cmFjZXIgcGx1Z2luIChNdWx0aS1WYXVsdCkuLi4nKTtcblx0XHRcblx0XHR0aGlzLnZhdWx0TmFtZSA9IHRoaXMuYXBwLnZhdWx0LmdldE5hbWUoKTtcblx0XHRjb25zdCBiYXNlRGlyID0gcGF0aC5qb2luKG9zLmhvbWVkaXIoKSwgJy5jb25maWcnLCAnb2JzaXRyYWNlcicpO1xuXHRcdHRoaXMuZm9jdXNQYXRoID0gcGF0aC5qb2luKGJhc2VEaXIsICdhY3RpdmVfZm9jdXMuanNvbicpO1xuXHRcdHRoaXMuY3J1ZE1haWxib3hQYXRoID0gcGF0aC5qb2luKGJhc2VEaXIsICd2YXVsdHMnLCBgJHt0aGlzLnZhdWx0TmFtZX0uanNvbmApO1xuXG5cdFx0Ly8gQ3Vyc29yIHRyYWNraW5nXG5cdFx0Y29uc3QgdXBkYXRlQ3Vyc29yID0gKCkgPT4ge1xuXHRcdFx0Y29uc3QgYWN0aXZlRmlsZSA9IHRoaXMuYXBwLndvcmtzcGFjZS5nZXRBY3RpdmVGaWxlKCk7XG5cblx0XHRcdGlmIChhY3RpdmVGaWxlKSB7XG5cdFx0XHRcdGxldCBsaW5lID0gMTtcblx0XHRcdFx0bGV0IGNoID0gMDtcblxuXHRcdFx0XHRjb25zdCB2aWV3ID0gdGhpcy5hcHAud29ya3NwYWNlLmdldEFjdGl2ZVZpZXdPZlR5cGUoTWFya2Rvd25WaWV3KTtcblx0XHRcdFx0aWYgKHZpZXcgJiYgdmlldy5maWxlICYmIHZpZXcuZmlsZS5wYXRoID09PSBhY3RpdmVGaWxlLnBhdGggJiYgdmlldy5lZGl0b3IpIHtcblx0XHRcdFx0XHRjb25zdCBwb3MgPSB2aWV3LmVkaXRvci5nZXRDdXJzb3IoKTtcblx0XHRcdFx0XHRsaW5lID0gcG9zLmxpbmUgKyAxO1xuXHRcdFx0XHRcdGNoID0gcG9zLmNoO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy5hY3RpdmVGb2N1cyA9IHsgZmlsZTogYWN0aXZlRmlsZS5wYXRoLCBsaW5lLCBjaCB9O1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBBbHdheXMgZmx1c2ggdmF1bHQgaWRlbnRpdHksIGV2ZW4gd2l0aG91dCBhbiBhY3RpdmUgZmlsZVxuXHRcdFx0dGhpcy5zY2hlZHVsZUZvY3VzVXBkYXRlKCk7XG5cdFx0fTtcblxuXHRcdGNvbnN0IHNjaGVkdWxlVXBkYXRlID0gKCkgPT4ge1xuXHRcdFx0c2V0VGltZW91dCh1cGRhdGVDdXJzb3IsIDEwMCk7XG5cdFx0fTtcblxuXHRcdHRoaXMucmVnaXN0ZXJEb21FdmVudChkb2N1bWVudCwgJ21vdXNlZG93bicsIHNjaGVkdWxlVXBkYXRlKTtcblx0XHR0aGlzLnJlZ2lzdGVyRG9tRXZlbnQoZG9jdW1lbnQsICdrZXl1cCcsIHNjaGVkdWxlVXBkYXRlKTtcblx0XHR0aGlzLnJlZ2lzdGVyRG9tRXZlbnQod2luZG93LCAnZm9jdXMnLCBzY2hlZHVsZVVwZGF0ZSk7XG5cdFx0dGhpcy5yZWdpc3RlckRvbUV2ZW50KGRvY3VtZW50LmJvZHksICdtb3VzZWVudGVyJywgc2NoZWR1bGVVcGRhdGUpO1xuXG5cdFx0Ly8gRmFsbGJhY2s6IHZpc2liaWxpdHljaGFuZ2UgaXMgbW9yZSByZWxpYWJsZSBvbiBzb21lIExpbnV4IFdNc1xuXHRcdHRoaXMucmVnaXN0ZXJEb21FdmVudChkb2N1bWVudCwgJ3Zpc2liaWxpdHljaGFuZ2UnLCAoKSA9PiB7XG5cdFx0XHRpZiAoIWRvY3VtZW50LmhpZGRlbikgc2NoZWR1bGVVcGRhdGUoKTtcblx0XHR9KTtcblxuXHRcdC8vIFBhcmFjYVx1MDBFRGRhcyBkZSBlbWVyZ2VuY2lhIChQb2xsaW5nKTogXG5cdFx0Ly8gUGFyYSB1c3VhcmlvcyBkZSBUaWxpbmcgV01zIChpMywgYnNwd20pIG8gQWx0K1RhYiBkb25kZSBlbCByYXRcdTAwRjNuIG5vIGVudHJhIGEgbGEgdmVudGFuYVxuXHRcdC8vIG5pIHNlIGRpc3BhcmFuIGNsaWNrcywgdmFsaWRhbW9zIGNhZGEgMnMgc2kgbGEgdmVudGFuYSByZWFsbWVudGUgdGllbmUgZWwgZm9jbyBkZWwgT1MuXG5cdFx0dGhpcy5yZWdpc3RlckludGVydmFsKFxuXHRcdFx0d2luZG93LnNldEludGVydmFsKCgpID0+IHtcblx0XHRcdFx0aWYgKGRvY3VtZW50Lmhhc0ZvY3VzKCkpIHtcblx0XHRcdFx0XHRzY2hlZHVsZVVwZGF0ZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LCAyMDAwKVxuXHRcdCk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyRXZlbnQoXG5cdFx0XHR0aGlzLmFwcC53b3Jrc3BhY2Uub24oJ2FjdGl2ZS1sZWFmLWNoYW5nZScsICgpID0+IHtcblx0XHRcdFx0c2NoZWR1bGVVcGRhdGUoKTtcblx0XHRcdH0pXG5cdFx0KTtcblxuXHRcdHRoaXMucmVnaXN0ZXJFdmVudChcblx0XHRcdHRoaXMuYXBwLndvcmtzcGFjZS5vbignZWRpdG9yLWNoYW5nZScsIChlZGl0b3I6IEVkaXRvciwgdmlldzogTWFya2Rvd25WaWV3KSA9PiB7XG5cdFx0XHRcdGlmICh2aWV3ICYmIHZpZXcuZmlsZSkge1xuXHRcdFx0XHRcdGNvbnN0IHBvcyA9IGVkaXRvci5nZXRDdXJzb3IoKTtcblx0XHRcdFx0XHR0aGlzLmFjdGl2ZUZvY3VzID0geyBmaWxlOiB2aWV3LmZpbGUucGF0aCwgbGluZTogcG9zLmxpbmUgKyAxLCBjaDogcG9zLmNoIH07XG5cdFx0XHRcdFx0dGhpcy5zY2hlZHVsZUZvY3VzVXBkYXRlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pXG5cdFx0KTtcblx0XHR0aGlzLnJlZ2lzdGVyRXZlbnQoXG5cdFx0XHR0aGlzLmFwcC53b3Jrc3BhY2Uub24oJ2ZpbGUtb3BlbicsIChmaWxlOiBURmlsZSB8IG51bGwpID0+IHtcblx0XHRcdFx0aWYgKGZpbGUpIHtcblx0XHRcdFx0XHRjb25zdCB2aWV3ID0gdGhpcy5hcHAud29ya3NwYWNlLmdldEFjdGl2ZVZpZXdPZlR5cGUoTWFya2Rvd25WaWV3KTtcblx0XHRcdFx0XHRpZiAodmlldyAmJiB2aWV3LmVkaXRvcikge1xuXHRcdFx0XHRcdFx0Y29uc3QgcG9zID0gdmlldy5lZGl0b3IuZ2V0Q3Vyc29yKCk7XG5cdFx0XHRcdFx0XHR0aGlzLmFjdGl2ZUZvY3VzID0geyBmaWxlOiBmaWxlLnBhdGgsIGxpbmU6IHBvcy5saW5lICsgMSwgY2g6IHBvcy5jaCB9O1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHR0aGlzLmFjdGl2ZUZvY3VzID0geyBmaWxlOiBmaWxlLnBhdGgsIGxpbmU6IDEsIGNoOiAwIH07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHRoaXMuc2NoZWR1bGVGb2N1c1VwZGF0ZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KVxuXHRcdCk7XG5cblx0XHQvLyBDUlVEIHRyYWNraW5nXG5cdFx0dGhpcy5yZWdpc3RlckV2ZW50KHRoaXMuYXBwLnZhdWx0Lm9uKCdjcmVhdGUnLCAoZmlsZTogVEFic3RyYWN0RmlsZSkgPT4gdGhpcy5oYW5kbGVDcnVkKCdjcmVhdGVkJywgZmlsZSkpKTtcblx0XHR0aGlzLnJlZ2lzdGVyRXZlbnQodGhpcy5hcHAudmF1bHQub24oJ21vZGlmeScsIChmaWxlOiBUQWJzdHJhY3RGaWxlKSA9PiB0aGlzLmhhbmRsZUNydWQoJ21vZGlmaWVkJywgZmlsZSkpKTtcblx0XHR0aGlzLnJlZ2lzdGVyRXZlbnQodGhpcy5hcHAudmF1bHQub24oJ2RlbGV0ZScsIChmaWxlOiBUQWJzdHJhY3RGaWxlKSA9PiB0aGlzLmhhbmRsZUNydWQoJ2RlbGV0ZWQnLCBmaWxlKSkpO1xuXHRcdHRoaXMucmVnaXN0ZXJFdmVudCh0aGlzLmFwcC52YXVsdC5vbigncmVuYW1lJywgKGZpbGU6IFRBYnN0cmFjdEZpbGUsIG9sZFBhdGg6IHN0cmluZykgPT4ge1xuXHRcdFx0dGhpcy5wZW5kaW5nQ2hhbmdlcy5zZXQob2xkUGF0aCwgeyBvcDogJ2RlbGV0ZWQnLCBwYXRoOiBvbGRQYXRoIH0pO1xuXHRcdFx0dGhpcy5oYW5kbGVDcnVkKCdjcmVhdGVkJywgZmlsZSk7XG5cdFx0XHRpZiAodGhpcy5hY3RpdmVGb2N1cyAmJiB0aGlzLmFjdGl2ZUZvY3VzLmZpbGUgPT09IG9sZFBhdGgpIHtcblx0XHRcdFx0dGhpcy5hY3RpdmVGb2N1cy5maWxlID0gZmlsZS5wYXRoO1xuXHRcdFx0XHR0aGlzLnNjaGVkdWxlRm9jdXNVcGRhdGUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRvbnVubG9hZCgpIHtcblx0XHRjb25zb2xlLmxvZygnRGVzY2FyZ2FuZG8gT2JzaXRyYWNlciBwbHVnaW4uLi4nKTtcblx0XHRpZiAodGhpcy5mb2N1c0RlYm91bmNlVGltZXIpIGNsZWFyVGltZW91dCh0aGlzLmZvY3VzRGVib3VuY2VUaW1lcik7XG5cdFx0aWYgKHRoaXMuY3J1ZERlYm91bmNlVGltZXIpIGNsZWFyVGltZW91dCh0aGlzLmNydWREZWJvdW5jZVRpbWVyKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgaGFuZGxlQ3J1ZChvcDogc3RyaW5nLCBhYnN0cmFjdEZpbGU6IFRBYnN0cmFjdEZpbGUpIHtcblx0XHRpZiAodGhpcy5zaG91bGRJZ25vcmUoYWJzdHJhY3RGaWxlLnBhdGgpKSByZXR1cm47XG5cdFx0aWYgKCEoYWJzdHJhY3RGaWxlIGluc3RhbmNlb2YgVEZpbGUpKSByZXR1cm47XG5cblx0XHRjb25zdCBmaWxlID0gYWJzdHJhY3RGaWxlIGFzIFRGaWxlO1xuXHRcdGxldCBleGNlcnB0ID0gJyc7XG5cblx0XHRpZiAob3AgPT09ICdjcmVhdGVkJyB8fCBvcCA9PT0gJ21vZGlmaWVkJykge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMuYXBwLnZhdWx0LmNhY2hlZFJlYWQoZmlsZSk7XG5cdFx0XHRcdGV4Y2VycHQgPSBjb250ZW50Lmxlbmd0aCA+IDMwMCA/IGNvbnRlbnQuc3Vic3RyaW5nKDAsIDMwMCkgKyAnLi4uJyA6IGNvbnRlbnQ7XG5cdFx0XHRcdFxuXHRcdFx0XHRpZiAob3AgPT09ICdtb2RpZmllZCcpIHtcblx0XHRcdFx0XHR0aGlzLmV4dHJhY3RJQUJsb2NrcyhmaWxlLCBjb250ZW50KTtcblx0XHRcdFx0fVxuXHRcdFx0fSBjYXRjaChlKSB7fVxuXHRcdH1cblxuXHRcdHRoaXMucGVuZGluZ0NoYW5nZXMuc2V0KGZpbGUucGF0aCwgeyBvcCwgcGF0aDogZmlsZS5wYXRoLCBleGNlcnB0IH0pO1xuXHRcdHRoaXMuc2NoZWR1bGVDcnVkVXBkYXRlKCk7XG5cdH1cblxuXHRwcml2YXRlIGV4dHJhY3RJQUJsb2NrcyhmaWxlOiBURmlsZSwgY29udGVudDogc3RyaW5nKSB7XG5cdFx0Y29uc3QgbGluZXMgPSBjb250ZW50LnNwbGl0KCdcXG4nKTtcblx0XHRjb25zdCByZWdleCA9IC9cXC9pYVxcKFsnXCJdKFteJ1wiXSspWydcIl1cXCkvO1xuXHRcdGxldCBoYXNNYXRjaCA9IGZhbHNlO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgbGluZXMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IG0gPSBsaW5lc1tpXS5tYXRjaChyZWdleCk7XG5cdFx0XHRpZiAobSAmJiBtLmxlbmd0aCA+IDEpIHtcblx0XHRcdFx0dGhpcy5wZW5kaW5nSUFCbG9ja3MucHVzaCh7IGZpbGU6IGZpbGUucGF0aCwgbGluZTogaSArIDEsIHByb21wdDogbVsxXSB9KTtcblx0XHRcdFx0aGFzTWF0Y2ggPSB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChoYXNNYXRjaCkge1xuXHRcdFx0dGhpcy5hcHAudmF1bHQucHJvY2VzcyhmaWxlLCAoZGF0YSkgPT4ge1xuXHRcdFx0XHRjb25zdCBkYXRhTGluZXMgPSBkYXRhLnNwbGl0KCdcXG4nKTtcblx0XHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBkYXRhTGluZXMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0XHRpZiAocmVnZXgudGVzdChkYXRhTGluZXNbaV0pKSB7XG5cdFx0XHRcdFx0XHRkYXRhTGluZXNbaV0gPSBkYXRhTGluZXNbaV0ucmVwbGFjZShyZWdleCwgJycpLnRyaW0oKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGRhdGFMaW5lcy5qb2luKCdcXG4nKTtcblx0XHRcdH0pLmNhdGNoKGUgPT4gY29uc29sZS5lcnJvcihlKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzaG91bGRJZ25vcmUoZmlsZVBhdGg6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHBhcnRzID0gZmlsZVBhdGguc3BsaXQoJy8nKTtcblx0XHRpZiAocGFydHMuaW5jbHVkZXMoJy5vYnNpZGlhbicpIHx8IHBhcnRzLmluY2x1ZGVzKCcuZ2l0JykgfHwgcGFydHMuaW5jbHVkZXMoJy50cmFzaCcpKSByZXR1cm4gdHJ1ZTtcblx0XHRjb25zdCBiYXNlID0gcGF0aC5iYXNlbmFtZShmaWxlUGF0aCk7XG5cdFx0aWYgKGJhc2Uuc3RhcnRzV2l0aCgnLicpIHx8IGJhc2UuZW5kc1dpdGgoJ34nKSB8fCBiYXNlLmVuZHNXaXRoKCcudG1wJykpIHJldHVybiB0cnVlO1xuXHRcdGlmICghYmFzZS5lbmRzV2l0aCgnLm1kJykpIHJldHVybiB0cnVlO1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgc2NoZWR1bGVGb2N1c1VwZGF0ZSgpIHtcblx0XHRpZiAodGhpcy5mb2N1c0RlYm91bmNlVGltZXIpIGNsZWFyVGltZW91dCh0aGlzLmZvY3VzRGVib3VuY2VUaW1lcik7XG5cdFx0dGhpcy5mb2N1c0RlYm91bmNlVGltZXIgPSBzZXRUaW1lb3V0KCgpID0+IHRoaXMuZmx1c2hGb2N1cygpLCAxMDApO1xuXHR9XG5cblx0cHJpdmF0ZSBzY2hlZHVsZUNydWRVcGRhdGUoKSB7XG5cdFx0aWYgKHRoaXMuY3J1ZERlYm91bmNlVGltZXIpIGNsZWFyVGltZW91dCh0aGlzLmNydWREZWJvdW5jZVRpbWVyKTtcblx0XHR0aGlzLmNydWREZWJvdW5jZVRpbWVyID0gc2V0VGltZW91dCgoKSA9PiB0aGlzLmZsdXNoQ3J1ZCgpLCA1MDApO1xuXHR9XG5cblx0cHJpdmF0ZSBmbHVzaEZvY3VzKCkge1xuXHRcdHRyeSB7XG5cdFx0XHRpZiAoIXRoaXMuYWN0aXZlRm9jdXMpIHJldHVybjtcblx0XHRcdFxuXHRcdFx0Y29uc3QgcGF5bG9hZCA9IHtcblx0XHRcdFx0dHM6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcblx0XHRcdFx0dmF1bHQ6IHRoaXMudmF1bHROYW1lLFxuXHRcdFx0XHR2YXVsdFBhdGg6ICh0aGlzLmFwcC52YXVsdC5hZGFwdGVyIGFzIGFueSkuYmFzZVBhdGggfHwgJycsXG5cdFx0XHRcdGZvY3VzOiB0aGlzLmFjdGl2ZUZvY3VzXG5cdFx0XHR9O1xuXHRcdFx0XG5cdFx0XHRmcy5ta2RpclN5bmMocGF0aC5kaXJuYW1lKHRoaXMuZm9jdXNQYXRoKSwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG5cdFx0XHRmcy53cml0ZUZpbGVTeW5jKHRoaXMuZm9jdXNQYXRoLCBKU09OLnN0cmluZ2lmeShwYXlsb2FkLCBudWxsLCAyKSwgJ3V0ZjgnKTtcblxuXHRcdFx0Ly8gQ2FuYWwgcmVhY3Rpdm8gXHUyMTkyIHRtdXg6IGVtcHVqYSBlbCBmb2NvIGFjdHVhbCBzaW4gcG9sbGluZ1xuXHRcdFx0Y29uc3QgbGFiZWwgPSBgXHVEODNEXHVEQ0NEICR7dGhpcy52YXVsdE5hbWV9LyR7dGhpcy5hY3RpdmVGb2N1cy5maWxlfWA7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRleGVjU3luYyhgdG11eCBzZXQgLWdxIEBvYnNpdHJhY2VyIFwiJHtsYWJlbH1cImAsIHsgdGltZW91dDogMjAwLCBzdGRpbzogJ2lnbm9yZScgfSk7XG5cdFx0XHR9IGNhdGNoIChfKSB7XG5cdFx0XHRcdC8vIFNpbGVuY2lvc28gc2kgbm8gaGF5IHNlc2lcdTAwRjNuIHRtdXggYWN0aXZhXG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0Y29uc29sZS5lcnJvcignRXJyb3IgYWN0dWFsaXphbmRvIGZvY3VzOicsIGUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZmx1c2hDcnVkKCkge1xuXHRcdHRyeSB7XG5cdFx0XHRsZXQgZGF0YSA9IHsgdHM6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSwgdmF1bHQ6ICcnLCBjaGFuZ2VzOiBbXSBhcyBhbnlbXSwgaWFfYmxvY2tzOiBbXSBhcyBhbnlbXSB9O1xuXHRcdFx0XG5cdFx0XHRpZiAoZnMuZXhpc3RzU3luYyh0aGlzLmNydWRNYWlsYm94UGF0aCkpIHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRkYXRhID0gSlNPTi5wYXJzZShmcy5yZWFkRmlsZVN5bmModGhpcy5jcnVkTWFpbGJveFBhdGgsICd1dGY4JykpO1xuXHRcdFx0XHR9IGNhdGNoIChlKSB7fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBNZXJnZSBjaGFuZ2VzXG5cdFx0XHRjb25zdCBtZXJnZWRDaGFuZ2VzID0gWy4uLihkYXRhLmNoYW5nZXMgfHwgW10pXTtcblx0XHRcdGZvciAoY29uc3QgY2hhbmdlIG9mIHRoaXMucGVuZGluZ0NoYW5nZXMudmFsdWVzKCkpIHtcblx0XHRcdFx0bWVyZ2VkQ2hhbmdlcy5wdXNoKGNoYW5nZSk7XG5cdFx0XHR9XG5cdFx0XHRcblx0XHRcdC8vIE1lcmdlIGJsb2Nrc1xuXHRcdFx0Y29uc3QgbWVyZ2VkQmxvY2tzID0gWy4uLihkYXRhLmlhX2Jsb2NrcyB8fCBbXSksIC4uLnRoaXMucGVuZGluZ0lBQmxvY2tzXTtcblxuXHRcdFx0Y29uc3QgcGF5bG9hZCA9IHtcblx0XHRcdFx0dHM6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcblx0XHRcdFx0dmF1bHQ6ICh0aGlzLmFwcC52YXVsdC5hZGFwdGVyIGFzIGFueSkuYmFzZVBhdGggfHwgJycsXG5cdFx0XHRcdGNoYW5nZXM6IG1lcmdlZENoYW5nZXMsXG5cdFx0XHRcdGlhX2Jsb2NrczogbWVyZ2VkQmxvY2tzXG5cdFx0XHR9O1xuXG5cdFx0XHRmcy5ta2RpclN5bmMocGF0aC5kaXJuYW1lKHRoaXMuY3J1ZE1haWxib3hQYXRoKSwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG5cdFx0XHRmcy53cml0ZUZpbGVTeW5jKHRoaXMuY3J1ZE1haWxib3hQYXRoLCBKU09OLnN0cmluZ2lmeShwYXlsb2FkLCBudWxsLCAyKSwgJ3V0ZjgnKTtcblxuXHRcdFx0Ly8gQ2xlYXIgcGVuZGluZ1xuXHRcdFx0dGhpcy5wZW5kaW5nQ2hhbmdlcy5jbGVhcigpO1xuXHRcdFx0dGhpcy5wZW5kaW5nSUFCbG9ja3MgPSBbXTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGNvbnNvbGUuZXJyb3IoJ0Vycm9yIGVzY3JpYmllbmRvIGFsIGJ1elx1MDBGM24g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
