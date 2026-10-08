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
  IAPromptWidget: () => IAPromptWidget,
  addIAWidgetEffect: () => addIAWidgetEffect,
  clearIAWidgetsEffect: () => clearIAWidgetsEffect,
  default: () => Obsitracer,
  iaWidgetField: () => iaWidgetField
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var import_state = require("@codemirror/state");
var import_view = require("@codemirror/view");
var import_child_process = require("child_process");
var fs = __toESM(require("fs"));
var os = __toESM(require("os"));
var path = __toESM(require("path"));
function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
var addIAWidgetEffect = import_state.StateEffect.define();
var clearIAWidgetsEffect = import_state.StateEffect.define();
var IAPromptWidget = class extends import_view.WidgetType {
  constructor(prompt) {
    super();
    this.prompt = prompt;
  }
  eq(other) {
    return other.prompt === this.prompt;
  }
  toDOM() {
    const div = document.createElement("div");
    div.className = "obsitracer-glass-widget";
    div.setAttribute("style", "background: rgba(255, 255, 255, 0.03); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 8px; padding: 12px 16px; margin: 10px 0; color: #e2e8f0; font-size: 0.9em; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15); display: flex; align-items: center; justify-content: space-between;");
    div.innerHTML = `
         <div style="display: flex; align-items: center; gap: 8px;">
           <span style="opacity: 0.4;">\u2726</span>
           <span>${escapeHtml(this.prompt)}</span>
         </div>
         <span style="font-size: 11px; opacity: 0.5; font-family: monospace;">procesando...</span>
       `;
    return div;
  }
  ignoreEvent() {
    return false;
  }
};
var iaWidgetField = import_state.StateField.define({
  create() {
    return import_view.Decoration.none;
  },
  update(decorations, tr) {
    decorations = decorations.map(tr.changes);
    for (const effect of tr.effects) {
      if (effect.is(addIAWidgetEffect)) {
        const pos = Math.min(Math.max(0, effect.value.pos), tr.newDoc.length);
        const widget = import_view.Decoration.widget({
          widget: new IAPromptWidget(effect.value.prompt),
          block: true,
          side: 1
        });
        decorations = decorations.update({
          add: [widget.range(pos)],
          sort: true
        });
      } else if (effect.is(clearIAWidgetsEffect)) {
        decorations = import_view.Decoration.none;
      }
    }
    return decorations;
  },
  provide: (field) => import_view.EditorView.decorations.from(field)
});
var IAPromptModal = class extends import_obsidian.Modal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    const view = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
    let filePath = "";
    let line = 1;
    let ch = 0;
    let selectionText = "";
    if (view && view.file && view.editor) {
      filePath = view.file.path;
      const pos = view.editor.getCursor();
      line = pos.line + 1;
      ch = pos.ch;
      selectionText = view.editor.getSelection() || "";
    } else {
      const activeFile = this.app.workspace.getActiveFile();
      if (activeFile) {
        filePath = activeFile.path;
      }
    }
    contentEl.createEl("h2", { text: "\u26A1 Petici\xF3n a Mizar / IA" });
    const badgeContainer = contentEl.createDiv({ cls: "obsitracer-context-badge" });
    badgeContainer.style.marginBottom = "12px";
    badgeContainer.style.padding = "8px 12px";
    badgeContainer.style.borderRadius = "6px";
    badgeContainer.style.backgroundColor = "var(--background-secondary)";
    badgeContainer.style.border = "1px solid var(--background-modifier-border)";
    badgeContainer.style.fontSize = "12px";
    badgeContainer.style.lineHeight = "1.4";
    const fileLineInfo = badgeContainer.createDiv();
    if (filePath) {
      fileLineInfo.innerHTML = `<strong>\u{1F4C4} Nota:</strong> <code>${filePath}</code> (L\xEDnea ${line}, Col ${ch})`;
    } else {
      fileLineInfo.innerHTML = `<em>(Sin nota markdown activa en el workspace)</em>`;
    }
    if (selectionText && selectionText.trim().length > 0) {
      const snippet = selectionText.length > 120 ? selectionText.substring(0, 120) + "..." : selectionText;
      const selDiv = badgeContainer.createDiv();
      selDiv.style.marginTop = "6px";
      selDiv.style.color = "var(--text-muted)";
      selDiv.innerHTML = `<strong>\u{1F4CD} Selecci\xF3n:</strong> <span style="font-style: italic;">"${snippet.replace(/</g, "&lt;").replace(/>/g, "&gt;")}"</span>`;
    }
    const textContainer = contentEl.createDiv();
    textContainer.style.marginBottom = "12px";
    const textArea = new import_obsidian.TextAreaComponent(textContainer);
    textArea.setPlaceholder("\xBFQu\xE9 deseas que haga Mizar con esta nota o contexto?");
    textArea.inputEl.rows = 5;
    textArea.inputEl.style.width = "100%";
    textArea.inputEl.style.resize = "vertical";
    textArea.inputEl.style.fontFamily = "inherit";
    textArea.inputEl.style.padding = "8px";
    textArea.inputEl.style.boxSizing = "border-box";
    const handleSubmit = () => {
      const promptText = textArea.getValue().trim();
      if (!promptText) {
        new import_obsidian.Notice("\u26A0\uFE0F Por favor escribe una instrucci\xF3n para Mizar");
        return;
      }
      const activeView = view || this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
      if (activeView && activeView.editor) {
        const cursor = activeView.editor.getCursor();
        const offset = activeView.editor.posToOffset(cursor);
        this.plugin.addIAWidgetToView(activeView, offset, promptText);
      }
      this.plugin.pendingIABlocks.push({
        file: filePath,
        line,
        ch,
        prompt: promptText,
        selection: selectionText,
        ts: (/* @__PURE__ */ new Date()).toISOString()
      });
      this.plugin.flushCrud();
      new import_obsidian.Notice("\u26A1 Petici\xF3n enviada a Mizar");
      this.close();
    };
    textArea.inputEl.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        handleSubmit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        this.close();
      }
    });
    const buttonContainer = contentEl.createDiv();
    buttonContainer.style.display = "flex";
    buttonContainer.style.justifyContent = "flex-end";
    buttonContainer.style.gap = "8px";
    const cancelBtn = buttonContainer.createEl("button", { text: "Cancelar" });
    cancelBtn.addEventListener("click", () => this.close());
    const submitBtn = buttonContainer.createEl("button", {
      text: "\u26A1 Enviar a Mizar",
      cls: "mod-cta"
    });
    submitBtn.addEventListener("click", () => handleSubmit());
    setTimeout(() => textArea.inputEl.focus(), 20);
  }
  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
};
var Obsitracer = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    this.focusDebounceTimer = null;
    this.crudDebounceTimer = null;
    this.pendingChanges = /* @__PURE__ */ new Map();
    this.pendingIABlocks = [];
    this.activeFocus = null;
    this.fileSnapshots = /* @__PURE__ */ new Map();
    this.activeWidgetCount = 0;
    this.crudWatcherTimer = null;
    this.lastWidgetSentTime = 0;
    this.lastHumanInputTime = 0;
  }
  async onload() {
    console.log("Cargando Obsitracer plugin (Multi-Vault)...");
    this.vaultName = this.app.vault.getName();
    const baseDir = path.join(os.homedir(), ".config", "obsitracer");
    const vaultDir = path.join(baseDir, "vaults", this.vaultName);
    this.focusPath = path.join(vaultDir, "focus.json");
    this.crudMailboxPath = path.join(vaultDir, "crud.json");
    this.registerVaultToList();
    this.registerEditorExtension(iaWidgetField);
    const initialFile = this.app.workspace.getActiveFile();
    if (initialFile) {
      this.cacheSnapshot(initialFile);
    }
    const updateCursor = () => {
      const activeFile = this.app.workspace.getActiveFile();
      if (activeFile) {
        this.cacheSnapshot(activeFile);
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
    const onHumanInput = () => {
      this.lastHumanInputTime = Date.now();
      scheduleUpdate();
    };
    this.registerDomEvent(document, "keydown", () => {
      this.lastHumanInputTime = Date.now();
    });
    this.registerDomEvent(document, "keyup", onHumanInput);
    this.registerDomEvent(document, "mousedown", onHumanInput);
    this.registerDomEvent(window, "focus", scheduleUpdate);
    this.registerDomEvent(document.body, "mouseenter", scheduleUpdate);
    this.registerDomEvent(document, "visibilitychange", () => {
      if (!document.hidden) scheduleUpdate();
    });
    this.registerDomEvent(window, "beforeunload", () => {
      this.clearAllWidgets();
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
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile) {
          this.cacheSnapshot(activeFile);
        }
        scheduleUpdate();
      })
    );
    this.registerEvent(
      this.app.workspace.on("layout-change", () => {
        const leaves = this.app.workspace.getLeavesOfType("markdown");
        if (leaves.length === 0) {
          this.clearAllWidgets();
        }
      })
    );
    this.registerEvent(
      this.app.workspace.on("window-close", () => {
        this.clearAllWidgets();
      })
    );
    this.registerEvent(
      this.app.workspace.on("editor-change", (editor, view) => {
        if (view && view.file) {
          this.cacheSnapshot(view.file);
          const pos = editor.getCursor();
          this.activeFocus = { file: view.file.path, line: pos.line + 1, ch: pos.ch };
          this.scheduleFocusUpdate();
          const isHuman = document.hasFocus() && Date.now() - this.lastHumanInputTime < 1e3;
          if (isHuman && view.file instanceof import_obsidian.TFile) {
            this.handleEditorChange(editor, view.file);
          }
        }
      })
    );
    this.registerEvent(
      this.app.workspace.on("file-open", (file) => {
        if (file) {
          this.cacheSnapshot(file);
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
    this.registerEvent(
      this.app.vault.on("modify", async (file) => {
        if (this.shouldIgnore(file.path)) return;
        if (!(file instanceof import_obsidian.TFile)) return;
        try {
          const content = await this.app.vault.cachedRead(file);
          this.fileSnapshots.set(file.path, content);
        } catch (_) {
        }
      })
    );
    this.registerEvent(this.app.vault.on("delete", (file) => this.handleCrud("deleted", file)));
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
      const isHuman = document.hasFocus() && Date.now() - this.lastHumanInputTime < 2e3;
      if (isHuman) {
        this.pendingChanges.set(oldPath, { op: "deleted", path: oldPath, ts: Math.floor(Date.now() / 1e3) });
      }
      const oldContent = this.fileSnapshots.get(oldPath);
      this.fileSnapshots.delete(oldPath);
      if (oldContent !== void 0 && file instanceof import_obsidian.TFile) {
        this.fileSnapshots.set(file.path, oldContent);
      }
      this.handleCrud("created", file);
      if (this.activeFocus && this.activeFocus.file === oldPath) {
        this.activeFocus.file = file.path;
        this.scheduleFocusUpdate();
      }
    }));
    this.addCommand({
      id: "send-ia-prompt",
      name: "Enviar petici\xF3n a Mizar / IA",
      hotkeys: [{ modifiers: ["Mod", "Alt"], key: "i" }],
      callback: () => new IAPromptModal(this.app, this).open()
    });
  }
  onunload() {
    console.log("Descargando Obsitracer plugin...");
    if (this.focusDebounceTimer) clearTimeout(this.focusDebounceTimer);
    if (this.crudDebounceTimer) clearTimeout(this.crudDebounceTimer);
    this.clearAllWidgets();
    this.stopCrudDrainWatcher();
    this.fileSnapshots.clear();
  }
  async cacheSnapshot(file) {
    if (this.shouldIgnore(file.path)) return;
    if (this.fileSnapshots.has(file.path)) return;
    try {
      const content = await this.app.vault.cachedRead(file);
      this.fileSnapshots.set(file.path, content);
    } catch (_) {
    }
  }
  calculateMicroDiff(oldContent, newContent, maxDiffLines = 30) {
    if (oldContent === newContent) return [];
    const oldLines = oldContent.split(/\r?\n/);
    const newLines = newContent.split(/\r?\n/);
    let start = 0;
    while (start < oldLines.length && start < newLines.length && oldLines[start] === newLines[start]) {
      start++;
    }
    let oldEnd = oldLines.length - 1;
    let newEnd = newLines.length - 1;
    while (oldEnd >= start && newEnd >= start && oldLines[oldEnd] === newLines[newEnd]) {
      oldEnd--;
      newEnd--;
    }
    const trimmedOld = oldLines.slice(start, oldEnd + 1);
    const trimmedNew = newLines.slice(start, newEnd + 1);
    if (trimmedOld.length === 0 && trimmedNew.length === 0) {
      return [];
    }
    if (trimmedOld.length === 0) {
      return trimmedNew.slice(0, maxDiffLines).map((l) => `+ ${l}`);
    }
    if (trimmedNew.length === 0) {
      return trimmedOld.slice(0, maxDiffLines).map((l) => `- ${l}`);
    }
    if (trimmedOld.length > 50 || trimmedNew.length > 50) {
      const diff2 = [];
      for (const line of trimmedNew) {
        if (diff2.length >= maxDiffLines) break;
        diff2.push(`+ ${line}`);
      }
      for (const line of trimmedOld) {
        if (diff2.length >= maxDiffLines) break;
        diff2.push(`- ${line}`);
      }
      return diff2;
    }
    const m = trimmedOld.length;
    const n = trimmedNew.length;
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i2 = m - 1; i2 >= 0; i2--) {
      for (let j2 = n - 1; j2 >= 0; j2--) {
        if (trimmedOld[i2] === trimmedNew[j2]) {
          dp[i2][j2] = dp[i2 + 1][j2 + 1] + 1;
        } else {
          dp[i2][j2] = Math.max(dp[i2 + 1][j2], dp[i2][j2 + 1]);
        }
      }
    }
    const diff = [];
    let i = 0, j = 0;
    while ((i < m || j < n) && diff.length < maxDiffLines) {
      if (i < m && j < n && trimmedOld[i] === trimmedNew[j]) {
        i++;
        j++;
      } else if (j < n && (i >= m || dp[i][j + 1] >= dp[i + 1][j])) {
        diff.push(`+ ${trimmedNew[j]}`);
        j++;
      } else if (i < m) {
        diff.push(`- ${trimmedOld[i]}`);
        i++;
      }
    }
    return diff;
  }
  handleEditorChange(editor, file) {
    if (this.shouldIgnore(file.path)) return;
    if (!document.hasFocus() || Date.now() - this.lastHumanInputTime >= 1e3) return;
    try {
      const content = editor.getValue();
      const excerpt = content.length > 300 ? content.substring(0, 300) + "..." : content;
      this.extractIABlocks(file, content);
      let diff = void 0;
      if (this.fileSnapshots.has(file.path)) {
        const prevContent = this.fileSnapshots.get(file.path);
        diff = this.calculateMicroDiff(prevContent, content);
      }
      const changeItem = {
        op: "modified",
        path: file.path,
        excerpt,
        ts: Math.floor(Date.now() / 1e3),
        _latestContent: content
      };
      if (diff && diff.length > 0) {
        changeItem.diff = diff;
      }
      this.pendingChanges.set(file.path, changeItem);
      this.scheduleCrudUpdate();
    } catch (e) {
      console.error("Error handling editor change:", e);
    }
  }
  async handleCrud(op, abstractFile) {
    if (this.shouldIgnore(abstractFile.path)) return;
    if (!(abstractFile instanceof import_obsidian.TFile)) return;
    const file = abstractFile;
    let excerpt = "";
    if (op === "created") {
      try {
        const content = await this.app.vault.cachedRead(file);
        excerpt = content.length > 300 ? content.substring(0, 300) + "..." : content;
        this.fileSnapshots.set(file.path, content);
      } catch (e) {
      }
      const isHuman = document.hasFocus() && Date.now() - this.lastHumanInputTime < 2e3;
      if (!isHuman) return;
      this.pendingChanges.set(file.path, {
        op,
        path: file.path,
        excerpt,
        ts: Math.floor(Date.now() / 1e3)
      });
      this.scheduleCrudUpdate();
      return;
    }
    if (op === "deleted") {
      this.fileSnapshots.delete(file.path);
      const isHuman = document.hasFocus() && Date.now() - this.lastHumanInputTime < 2e3;
      if (!isHuman) return;
      this.pendingChanges.set(file.path, {
        op,
        path: file.path,
        ts: Math.floor(Date.now() / 1e3)
      });
      this.scheduleCrudUpdate();
      return;
    }
  }
  extractIABlocks(file, content) {
    const lines = content.split("\n");
    const regex = /\/ia\(['"]([^'"]+)['"]\)/;
    let hasMatch = false;
    for (let i = 0; i < lines.length; i++) {
      let lineText = lines[i];
      let m = lineText.match(regex);
      while (m && m.length > 1) {
        this.pendingIABlocks.push({ file: file.path, line: i + 1, prompt: m[1] });
        hasMatch = true;
        lineText = lineText.replace(regex, "");
        m = lineText.match(regex);
      }
    }
    if (hasMatch) {
      this.app.vault.process(file, (data) => {
        const dataLines = data.split("\n");
        for (let i = 0; i < dataLines.length; i++) {
          let m = dataLines[i].match(regex);
          while (m && m.length > 1) {
            dataLines[i] = dataLines[i].replace(regex, "");
            m = dataLines[i].match(regex);
          }
        }
        return dataLines.join("\n");
      }).catch((e) => console.error(e));
      const activeView = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
      if (activeView && activeView.file && activeView.file.path === file.path && activeView.editor) {
        const offset = activeView.editor.posToOffset(activeView.editor.getCursor());
        for (const block of this.pendingIABlocks) {
          if (block.file === file.path) {
            this.addIAWidgetToView(activeView, offset, block.prompt);
          }
        }
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
      if (this.crudDebounceTimer) {
        clearTimeout(this.crudDebounceTimer);
        this.crudDebounceTimer = null;
      }
      let data = { ts: (/* @__PURE__ */ new Date()).toISOString(), vault: "", changes: [], ia_blocks: [] };
      if (fs.existsSync(this.crudMailboxPath)) {
        try {
          data = JSON.parse(fs.readFileSync(this.crudMailboxPath, "utf8"));
        } catch (e) {
        }
      }
      let mergedChanges = [...data.changes || []];
      for (const change of this.pendingChanges.values()) {
        const { _latestContent, ...cleanChange } = change;
        if (_latestContent !== void 0) {
          this.fileSnapshots.set(change.path, _latestContent);
        }
        mergedChanges.push(cleanChange);
      }
      if (mergedChanges.length > 30) {
        mergedChanges = mergedChanges.slice(-30);
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
  addIAWidgetToView(view, pos, prompt) {
    var _a;
    const cm = (_a = view.editor) == null ? void 0 : _a.cm;
    if (cm) {
      cm.dispatch({
        effects: addIAWidgetEffect.of({ pos, prompt })
      });
      this.activeWidgetCount++;
      this.lastWidgetSentTime = Date.now();
      this.startCrudDrainWatcher();
    }
  }
  clearAllWidgets() {
    this.app.workspace.iterateAllLeaves((leaf) => {
      var _a;
      if (leaf.view instanceof import_obsidian.MarkdownView && leaf.view.editor) {
        const cm = (_a = leaf.view.editor) == null ? void 0 : _a.cm;
        if (cm) {
          cm.dispatch({
            effects: clearIAWidgetsEffect.of()
          });
        }
      }
    });
    this.activeWidgetCount = 0;
    this.stopCrudDrainWatcher();
  }
  startCrudDrainWatcher() {
    if (this.crudWatcherTimer) return;
    this.crudWatcherTimer = setInterval(() => {
      this.checkCrudDrained();
    }, 800);
  }
  stopCrudDrainWatcher() {
    if (this.crudWatcherTimer) {
      clearInterval(this.crudWatcherTimer);
      this.crudWatcherTimer = null;
    }
  }
  checkCrudDrained() {
    if (this.activeWidgetCount <= 0) {
      this.stopCrudDrainWatcher();
      return;
    }
    try {
      if (!fs.existsSync(this.crudMailboxPath)) return;
      const raw = fs.readFileSync(this.crudMailboxPath, "utf8");
      const data = JSON.parse(raw);
      if (this.pendingIABlocks.length === 0 && (!data.ia_blocks || data.ia_blocks.length === 0)) {
        this.clearAllWidgets();
        return;
      }
      if (Date.now() - this.lastWidgetSentTime > 12e4) {
        this.clearAllWidgets();
      }
    } catch (_) {
    }
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  IAPromptWidget,
  addIAWidgetEffect,
  clearIAWidgetsEffect,
  iaWidgetField
});
