import { Plugin, Editor, MarkdownView, TFile, TAbstractFile, Modal, App, TextAreaComponent, Notice } from 'obsidian';
import { StateField, StateEffect } from '@codemirror/state';
import { EditorView, WidgetType, Decoration, DecorationSet } from '@codemirror/view';
import { exec } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
}

export interface IAWidgetSpec {
	pos: number;
	prompt: string;
}

export const addIAWidgetEffect = StateEffect.define<IAWidgetSpec>();
export const clearIAWidgetsEffect = StateEffect.define<void>();

export class IAPromptWidget extends WidgetType {
	constructor(readonly prompt: string) {
		super();
	}

	eq(other: IAPromptWidget): boolean {
		return other.prompt === this.prompt;
	}

	toDOM(): HTMLElement {
		const div = document.createElement('div');
		div.className = 'obsitracer-glass-widget';
		div.setAttribute('style', 'background: rgba(255, 255, 255, 0.03); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 8px; padding: 12px 16px; margin: 10px 0; color: #e2e8f0; font-size: 0.9em; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15); display: flex; align-items: center; justify-content: space-between;');
		div.innerHTML = `
         <div style="display: flex; align-items: center; gap: 8px;">
           <span style="opacity: 0.4;">✦</span>
           <span>${escapeHtml(this.prompt)}</span>
         </div>
         <span style="font-size: 11px; opacity: 0.5; font-family: monospace;">procesando...</span>
       `;
		return div;
	}

	ignoreEvent(): boolean {
		return false;
	}
}

export const iaWidgetField = StateField.define<DecorationSet>({
	create(): DecorationSet {
		return Decoration.none;
	},
	update(decorations: DecorationSet, tr): DecorationSet {
		decorations = decorations.map(tr.changes);
		for (const effect of tr.effects) {
			if (effect.is(addIAWidgetEffect)) {
				const pos = Math.min(Math.max(0, effect.value.pos), tr.newDoc.length);
				const widget = Decoration.widget({
					widget: new IAPromptWidget(effect.value.prompt),
					block: true,
					side: 1
				});
				decorations = decorations.update({
					add: [widget.range(pos)],
					sort: true
				});
			} else if (effect.is(clearIAWidgetsEffect)) {
				decorations = Decoration.none;
			}
		}
		return decorations;
	},
	provide: (field) => EditorView.decorations.from(field)
});

class IAPromptModal extends Modal {
	private plugin: Obsitracer;

	constructor(app: App, plugin: Obsitracer) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		let filePath = '';
		let line = 1;
		let ch = 0;
		let selectionText = '';

		if (view && view.file && view.editor) {
			filePath = view.file.path;
			const pos = view.editor.getCursor();
			line = pos.line + 1;
			ch = pos.ch;
			selectionText = view.editor.getSelection() || '';
		} else {
			const activeFile = this.app.workspace.getActiveFile();
			if (activeFile) {
				filePath = activeFile.path;
			}
		}

		contentEl.createEl('h2', { text: '⚡ Petición a Mizar / IA' });

		const badgeContainer = contentEl.createDiv({ cls: 'obsitracer-context-badge' });
		badgeContainer.style.marginBottom = '12px';
		badgeContainer.style.padding = '8px 12px';
		badgeContainer.style.borderRadius = '6px';
		badgeContainer.style.backgroundColor = 'var(--background-secondary)';
		badgeContainer.style.border = '1px solid var(--background-modifier-border)';
		badgeContainer.style.fontSize = '12px';
		badgeContainer.style.lineHeight = '1.4';

		const fileLineInfo = badgeContainer.createDiv();
		if (filePath) {
			fileLineInfo.innerHTML = `<strong>📄 Nota:</strong> <code>${filePath}</code> (Línea ${line}, Col ${ch})`;
		} else {
			fileLineInfo.innerHTML = `<em>(Sin nota markdown activa en el workspace)</em>`;
		}

		if (selectionText && selectionText.trim().length > 0) {
			const snippet = selectionText.length > 120
				? selectionText.substring(0, 120) + '...'
				: selectionText;
			const selDiv = badgeContainer.createDiv();
			selDiv.style.marginTop = '6px';
			selDiv.style.color = 'var(--text-muted)';
			selDiv.innerHTML = `<strong>📍 Selección:</strong> <span style="font-style: italic;">"${snippet.replace(/</g, '&lt;').replace(/>/g, '&gt;')}"</span>`;
		}

		const textContainer = contentEl.createDiv();
		textContainer.style.marginBottom = '12px';

		const textArea = new TextAreaComponent(textContainer);
		textArea.setPlaceholder('¿Qué deseas que haga Mizar con esta nota o contexto?');
		textArea.inputEl.rows = 5;
		textArea.inputEl.style.width = '100%';
		textArea.inputEl.style.resize = 'vertical';
		textArea.inputEl.style.fontFamily = 'inherit';
		textArea.inputEl.style.padding = '8px';
		textArea.inputEl.style.boxSizing = 'border-box';

		const handleSubmit = () => {
			const promptText = textArea.getValue().trim();
			if (!promptText) {
				new Notice('⚠️ Por favor escribe una instrucción para Mizar');
				return;
			}

			// Inyectar widget visual en memoria (CodeMirror 6) sin alterar el markdown de la nota
			const activeView = view || this.app.workspace.getActiveViewOfType(MarkdownView);
			if (activeView && activeView.editor) {
				const cursor = activeView.editor.getCursor();
				const offset = activeView.editor.posToOffset(cursor);
				this.plugin.addIAWidgetToView(activeView, offset, promptText);
			}

			this.plugin.pendingIABlocks.push({
				file: filePath,
				line: line,
				ch: ch,
				prompt: promptText,
				selection: selectionText,
				ts: new Date().toISOString()
			});

			this.plugin.flushCrud();
			new Notice('⚡ Petición enviada a Mizar');
			this.close();
		};

		textArea.inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
			if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
				e.preventDefault();
				handleSubmit();
			} else if (e.key === 'Escape') {
				e.preventDefault();
				this.close();
			}
		});

		const buttonContainer = contentEl.createDiv();
		buttonContainer.style.display = 'flex';
		buttonContainer.style.justifyContent = 'flex-end';
		buttonContainer.style.gap = '8px';

		const cancelBtn = buttonContainer.createEl('button', { text: 'Cancelar' });
		cancelBtn.addEventListener('click', () => this.close());

		const submitBtn = buttonContainer.createEl('button', {
			text: '⚡ Enviar a Mizar',
			cls: 'mod-cta'
		});
		submitBtn.addEventListener('click', () => handleSubmit());

		setTimeout(() => textArea.inputEl.focus(), 20);
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

export default class Obsitracer extends Plugin {
	private focusDebounceTimer: NodeJS.Timeout | null = null;
	private crudDebounceTimer: NodeJS.Timeout | null = null;
	private focusPath: string;
	private crudMailboxPath: string;
	private vaultName: string;
	private pendingChanges: Map<string, any> = new Map();
	public pendingIABlocks: any[] = [];
	private activeFocus: any = null;
	private fileSnapshots: Map<string, string> = new Map();
	private activeWidgetCount = 0;
	private crudWatcherTimer: NodeJS.Timeout | null = null;
	private lastWidgetSentTime = 0;
	private lastHumanInputTime = 0;

	async onload() {
		console.log('Cargando Obsitracer plugin (Multi-Vault)...');
		
		this.vaultName = this.app.vault.getName();
		const baseDir = path.join(os.homedir(), '.config', 'obsitracer');
		const vaultDir = path.join(baseDir, 'vaults', this.vaultName);
		
		this.focusPath = path.join(vaultDir, 'focus.json');
		this.crudMailboxPath = path.join(vaultDir, 'crud.json');
		
		this.registerVaultToList();

		// Registrar extensión CodeMirror 6 para renderizado de widgets visuales en memoria
		this.registerEditorExtension(iaWidgetField);

		const initialFile = this.app.workspace.getActiveFile();
		if (initialFile) {
			this.cacheSnapshot(initialFile);
		}

		// Cursor tracking
		const updateCursor = () => {
			const activeFile = this.app.workspace.getActiveFile();

			if (activeFile) {
				this.cacheSnapshot(activeFile);
				let line = 1;
				let ch = 0;

				const view = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (view && view.file && view.file.path === activeFile.path && view.editor) {
					const pos = view.editor.getCursor();
					line = pos.line + 1;
					ch = pos.ch;
				}

				this.activeFocus = { file: activeFile.path, line, ch };
			}

			// Always flush vault identity, even without an active file
			this.scheduleFocusUpdate();
		};

		const scheduleUpdate = () => {
			setTimeout(updateCursor, 100);
		};

		const onHumanInput = () => {
			this.lastHumanInputTime = Date.now();
			scheduleUpdate();
		};

		this.registerDomEvent(document, 'keydown', () => {
			this.lastHumanInputTime = Date.now();
		});
		this.registerDomEvent(document, 'keyup', onHumanInput);
		this.registerDomEvent(document, 'mousedown', onHumanInput);
		this.registerDomEvent(window, 'focus', scheduleUpdate);
		this.registerDomEvent(document.body, 'mouseenter', scheduleUpdate);

		// Fallback: visibilitychange is more reliable on some Linux WMs
		this.registerDomEvent(document, 'visibilitychange', () => {
			if (!document.hidden) scheduleUpdate();
		});

		// Limpiar widgets si la ventana se cierra
		this.registerDomEvent(window, 'beforeunload', () => {
			this.clearAllWidgets();
		});

		// Paracaídas de emergencia (Polling): 
		// Para usuarios de Tiling WMs (i3, bspwm) o Alt+Tab donde el ratón no entra a la ventana
		// ni se disparan clicks, validamos cada 2s si la ventana realmente tiene el foco del OS.
		this.registerInterval(
			window.setInterval(() => {
				if (document.hasFocus()) {
					scheduleUpdate();
				}
			}, 2000)
		);

		this.registerEvent(
			this.app.workspace.on('active-leaf-change', () => {
				const activeFile = this.app.workspace.getActiveFile();
				if (activeFile) {
					this.cacheSnapshot(activeFile);
				}
				scheduleUpdate();
			})
		);

		// Limpieza de widgets si las hojas de markdown se cierran
		this.registerEvent(
			this.app.workspace.on('layout-change', () => {
				const leaves = this.app.workspace.getLeavesOfType('markdown');
				if (leaves.length === 0) {
					this.clearAllWidgets();
				}
			})
		);

		this.registerEvent(
			this.app.workspace.on('window-close', () => {
				this.clearAllWidgets();
			})
		);

		this.registerEvent(
			this.app.workspace.on('editor-change', (editor: Editor, view: any) => {
				if (view && view.file) {
					this.cacheSnapshot(view.file);
					const pos = editor.getCursor();
					this.activeFocus = { file: view.file.path, line: pos.line + 1, ch: pos.ch };
					this.scheduleFocusUpdate();

					const isHuman = document.hasFocus() && (Date.now() - this.lastHumanInputTime < 1000);
					if (isHuman && view.file instanceof TFile) {
						this.handleEditorChange(editor, view.file);
					}
				}
			})
		);
		this.registerEvent(
			this.app.workspace.on('file-open', (file: TFile | null) => {
				if (file) {
					this.cacheSnapshot(file);
					const view = this.app.workspace.getActiveViewOfType(MarkdownView);
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

		// CRUD tracking
		this.registerEvent(this.app.vault.on('create', (file: TAbstractFile) => this.handleCrud('created', file)));
		this.registerEvent(
			this.app.vault.on('modify', async (file: TAbstractFile) => {
				if (this.shouldIgnore(file.path)) return;
				if (!(file instanceof TFile)) return;
				try {
					const content = await this.app.vault.cachedRead(file);
					this.fileSnapshots.set(file.path, content);
				} catch (_) {}
			})
		);
		this.registerEvent(this.app.vault.on('delete', (file: TAbstractFile) => this.handleCrud('deleted', file)));
		this.registerEvent(this.app.vault.on('rename', (file: TAbstractFile, oldPath: string) => {
			const isHuman = document.hasFocus() && (Date.now() - this.lastHumanInputTime < 2000);
			if (isHuman) {
				this.pendingChanges.set(oldPath, { op: 'deleted', path: oldPath, ts: Math.floor(Date.now() / 1000) });
			}
			const oldContent = this.fileSnapshots.get(oldPath);
			this.fileSnapshots.delete(oldPath);
			if (oldContent !== undefined && file instanceof TFile) {
				this.fileSnapshots.set(file.path, oldContent);
			}
			this.handleCrud('created', file);
			if (this.activeFocus && this.activeFocus.file === oldPath) {
				this.activeFocus.file = file.path;
				this.scheduleFocusUpdate();
			}
		}));

		this.addCommand({
			id: 'send-ia-prompt',
			name: 'Enviar petición a Mizar / IA',
			hotkeys: [{ modifiers: ['Mod', 'Alt'], key: 'i' }],
			callback: () => new IAPromptModal(this.app, this).open()
		});
	}

	onunload() {
		console.log('Descargando Obsitracer plugin...');
		if (this.focusDebounceTimer) clearTimeout(this.focusDebounceTimer);
		if (this.crudDebounceTimer) clearTimeout(this.crudDebounceTimer);
		this.clearAllWidgets();
		this.stopCrudDrainWatcher();
		this.fileSnapshots.clear();
	}

	private async cacheSnapshot(file: TFile) {
		if (this.shouldIgnore(file.path)) return;
		if (this.fileSnapshots.has(file.path)) return;
		try {
			const content = await this.app.vault.cachedRead(file);
			this.fileSnapshots.set(file.path, content);
		} catch (_) {}
	}

	private calculateMicroDiff(oldContent: string, newContent: string, maxDiffLines = 30): string[] {
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
			return trimmedNew.slice(0, maxDiffLines).map(l => `+ ${l}`);
		}
		if (trimmedNew.length === 0) {
			return trimmedOld.slice(0, maxDiffLines).map(l => `- ${l}`);
		}

		if (trimmedOld.length > 50 || trimmedNew.length > 50) {
			const diff: string[] = [];
			for (const line of trimmedNew) {
				if (diff.length >= maxDiffLines) break;
				diff.push(`+ ${line}`);
			}
			for (const line of trimmedOld) {
				if (diff.length >= maxDiffLines) break;
				diff.push(`- ${line}`);
			}
			return diff;
		}

		const m = trimmedOld.length;
		const n = trimmedNew.length;
		const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

		for (let i = m - 1; i >= 0; i--) {
			for (let j = n - 1; j >= 0; j--) {
				if (trimmedOld[i] === trimmedNew[j]) {
					dp[i][j] = dp[i + 1][j + 1] + 1;
				} else {
					dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
				}
			}
		}

		const diff: string[] = [];
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

	private handleEditorChange(editor: Editor, file: TFile) {
		if (this.shouldIgnore(file.path)) return;
		if (!document.hasFocus() || (Date.now() - this.lastHumanInputTime >= 1000)) return;

		try {
			const content = editor.getValue();
			const excerpt = content.length > 300 ? content.substring(0, 300) + '...' : content;
			this.extractIABlocks(file, content);

			let diff: string[] | undefined = undefined;
			if (this.fileSnapshots.has(file.path)) {
				const prevContent = this.fileSnapshots.get(file.path)!;
				diff = this.calculateMicroDiff(prevContent, content);
			}

			const changeItem: any = {
				op: 'modified',
				path: file.path,
				excerpt,
				ts: Math.floor(Date.now() / 1000),
				_latestContent: content
			};
			if (diff && diff.length > 0) {
				changeItem.diff = diff;
			}

			this.pendingChanges.set(file.path, changeItem);
			this.scheduleCrudUpdate();
		} catch (e) {
			console.error('Error handling editor change:', e);
		}
	}

	private async handleCrud(op: string, abstractFile: TAbstractFile) {
		if (this.shouldIgnore(abstractFile.path)) return;
		if (!(abstractFile instanceof TFile)) return;

		const file = abstractFile as TFile;
		let excerpt = '';

		if (op === 'created') {
			try {
				const content = await this.app.vault.cachedRead(file);
				excerpt = content.length > 300 ? content.substring(0, 300) + '...' : content;
				this.fileSnapshots.set(file.path, content);
			} catch(e) {}

			const isHuman = document.hasFocus() && (Date.now() - this.lastHumanInputTime < 2000);
			if (!isHuman) return;

			this.pendingChanges.set(file.path, {
				op,
				path: file.path,
				excerpt,
				ts: Math.floor(Date.now() / 1000)
			});
			this.scheduleCrudUpdate();
			return;
		}

		if (op === 'deleted') {
			this.fileSnapshots.delete(file.path);

			const isHuman = document.hasFocus() && (Date.now() - this.lastHumanInputTime < 2000);
			if (!isHuman) return;

			this.pendingChanges.set(file.path, {
				op,
				path: file.path,
				ts: Math.floor(Date.now() / 1000)
			});
			this.scheduleCrudUpdate();
			return;
		}
	}

	private extractIABlocks(file: TFile, content: string) {
		const lines = content.split('\n');
		const regex = /\/ia\(['"]([^'"]+)['"]\)/;
		let hasMatch = false;
		for (let i = 0; i < lines.length; i++) {
			let lineText = lines[i];
			let m = lineText.match(regex);
			while (m && m.length > 1) {
				this.pendingIABlocks.push({ file: file.path, line: i + 1, prompt: m[1] });
				hasMatch = true;
				lineText = lineText.replace(regex, '');
				m = lineText.match(regex);
			}
		}

		if (hasMatch) {
			this.app.vault.process(file, (data) => {
				const dataLines = data.split('\n');
				for (let i = 0; i < dataLines.length; i++) {
					let m = dataLines[i].match(regex);
					while (m && m.length > 1) {
						dataLines[i] = dataLines[i].replace(regex, '');
						m = dataLines[i].match(regex);
					}
				}
				return dataLines.join('\n');
			}).catch(e => console.error(e));

			const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
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

	private shouldIgnore(filePath: string): boolean {
		const parts = filePath.split('/');
		if (parts.includes('.obsidian') || parts.includes('.git') || parts.includes('.trash')) return true;
		const base = path.basename(filePath);
		if (base.startsWith('.') || base.endsWith('~') || base.endsWith('.tmp')) return true;
		if (!base.endsWith('.md')) return true;
		return false;
	}

	private scheduleFocusUpdate() {
		if (this.focusDebounceTimer) clearTimeout(this.focusDebounceTimer);
		this.focusDebounceTimer = setTimeout(() => this.flushFocus(), 100);
	}

	private scheduleCrudUpdate() {
		if (this.crudDebounceTimer) clearTimeout(this.crudDebounceTimer);
		this.crudDebounceTimer = setTimeout(() => this.flushCrud(), 500);
	}

	private flushFocus() {
		try {
			if (!this.activeFocus) return;
			
			const payload = {
				ts: new Date().toISOString(),
				vault: this.vaultName,
				vaultPath: (this.app.vault.adapter as any).basePath || '',
				focus: this.activeFocus
			};
			
			fs.mkdirSync(path.dirname(this.focusPath), { recursive: true });
			fs.writeFileSync(this.focusPath, JSON.stringify(payload, null, 2), 'utf8');

			// Canal reactivo → tmux: empuja el foco actual y fuerza recarga del widget de forma ASÍNCRONA
			const label = `📍 ${this.vaultName}/${this.activeFocus.file}`;
			try {
				exec(`tmux set -gq @obsitracer "${label}" && tmux refresh-client -S`, { timeout: 200 }, () => {});
			} catch (_) {
				// Silencioso
			}
		} catch (e) {
			console.error('Error actualizando focus:', e);
		}
	}

	public flushCrud() {
		try {
			if (this.crudDebounceTimer) {
				clearTimeout(this.crudDebounceTimer);
				this.crudDebounceTimer = null;
			}
			let data = { ts: new Date().toISOString(), vault: '', changes: [] as any[], ia_blocks: [] as any[] };
			
			if (fs.existsSync(this.crudMailboxPath)) {
				try {
					data = JSON.parse(fs.readFileSync(this.crudMailboxPath, 'utf8'));
				} catch (e) {}
			}

			// Merge changes
			let mergedChanges = [...(data.changes || [])];
			for (const change of this.pendingChanges.values()) {
				const { _latestContent, ...cleanChange } = change;
				if (_latestContent !== undefined) {
					this.fileSnapshots.set(change.path, _latestContent);
				}
				mergedChanges.push(cleanChange);
			}

			// Circular buffer: keep at most the last 30 events to prevent offline debt accumulation
			if (mergedChanges.length > 30) {
				mergedChanges = mergedChanges.slice(-30);
			}
			
			// Merge blocks
			const mergedBlocks = [...(data.ia_blocks || []), ...this.pendingIABlocks];

			const payload = {
				ts: new Date().toISOString(),
				vault: (this.app.vault.adapter as any).basePath || '',
				changes: mergedChanges,
				ia_blocks: mergedBlocks
			};

			fs.mkdirSync(path.dirname(this.crudMailboxPath), { recursive: true });
			fs.writeFileSync(this.crudMailboxPath, JSON.stringify(payload, null, 2), 'utf8');

			// Clear pending
			this.pendingChanges.clear();
			this.pendingIABlocks = [];
		} catch (err) {
			console.error('Error escribiendo al buzón CRUD:', err);
		}
	}

	private registerVaultToList() {
		try {
			const baseDir = path.join(os.homedir(), '.config', 'obsitracer');
			const listPath = path.join(baseDir, 'vaults.json');
			const vaultPath = (this.app.vault.adapter as any).basePath || '';
			
			let list: { name: string; path: string }[] = [];
			if (fs.existsSync(listPath)) {
				try {
					list = JSON.parse(fs.readFileSync(listPath, 'utf8'));
				} catch (e) {}
			}

			// 1. Limpiar vaults que ya no existen físicamente en disco (mantenimiento)
			list = list.filter(v => fs.existsSync(v.path));

			// 2. Buscar si este vault ya existe en la lista (por path o por nombre)
			const indexByPath = list.findIndex(v => v.path === vaultPath);
			const indexByName = list.findIndex(v => v.name === this.vaultName);

			let changed = false;

			if (indexByPath !== -1) {
				// Si el path coincide pero el nombre cambió (rename del vault), actualizamos el nombre
				if (list[indexByPath].name !== this.vaultName) {
					list[indexByPath].name = this.vaultName;
					changed = true;
				}
			} else if (indexByName !== -1) {
				// Si el nombre coincide pero la ruta cambió (se movió de carpeta), actualizamos la ruta
				if (list[indexByName].path !== vaultPath) {
					list[indexByName].path = vaultPath;
					changed = true;
				}
			} else {
				// Si es completamente nuevo, lo añadimos
				list.push({ name: this.vaultName, path: vaultPath });
				changed = true;
			}

			// Si hubo cambios o la lista se redujo por el filtro de existencia, guardamos
			fs.mkdirSync(baseDir, { recursive: true });
			fs.writeFileSync(listPath, JSON.stringify(list, null, 2), 'utf8');
		} catch (e) {
			console.error('Error registrando vault en la lista global:', e);
		}
	}

	public addIAWidgetToView(view: MarkdownView, pos: number, prompt: string) {
		const cm = (view.editor as any)?.cm as EditorView | undefined;
		if (cm) {
			cm.dispatch({
				effects: addIAWidgetEffect.of({ pos, prompt })
			});
			this.activeWidgetCount++;
			this.lastWidgetSentTime = Date.now();
			this.startCrudDrainWatcher();
		}
	}

	public clearAllWidgets() {
		this.app.workspace.iterateAllLeaves((leaf) => {
			if (leaf.view instanceof MarkdownView && leaf.view.editor) {
				const cm = (leaf.view.editor as any)?.cm as EditorView | undefined;
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

	private startCrudDrainWatcher() {
		if (this.crudWatcherTimer) return;
		this.crudWatcherTimer = setInterval(() => {
			this.checkCrudDrained();
		}, 800);
	}

	private stopCrudDrainWatcher() {
		if (this.crudWatcherTimer) {
			clearInterval(this.crudWatcherTimer);
			this.crudWatcherTimer = null;
		}
	}

	private checkCrudDrained() {
		if (this.activeWidgetCount <= 0) {
			this.stopCrudDrainWatcher();
			return;
		}

		try {
			if (!fs.existsSync(this.crudMailboxPath)) return;

			const raw = fs.readFileSync(this.crudMailboxPath, 'utf8');
			const data = JSON.parse(raw);

			// Cuando pendingIABlocks esté vacío (flusheado) Y crud.json en disco
			// tenga ia_blocks vacío, significa que el hook de Mizar ya consumió la petición
			if (this.pendingIABlocks.length === 0 && (!data.ia_blocks || data.ia_blocks.length === 0)) {
				this.clearAllWidgets();
				return;
			}

			// Timeout de seguridad: Si pasan más de 120 segundos sin drenar, desvanecer
			if (Date.now() - this.lastWidgetSentTime > 120000) {
				this.clearAllWidgets();
			}
		} catch (_) {
			// Silencioso ante concurrencia
		}
	}
}

