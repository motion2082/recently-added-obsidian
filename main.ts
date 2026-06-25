import {
  App,
  ItemView,
  Keymap,
  Menu,
  PaneType,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  WorkspaceLeaf,
  setTooltip,
} from 'obsidian';

interface RecentlyAddedData {
  omittedPaths: string[];
  maxLength: number;
  maxAgeDays: number;
}

const DEFAULT_DATA: RecentlyAddedData = {
  omittedPaths: [],
  maxLength: 50,
  maxAgeDays: 30,
};

const VIEW_TYPE = 'recently-added';

class RecentlyAddedView extends ItemView {
  private readonly plugin: RecentlyAddedPlugin;

  constructor(leaf: WorkspaceLeaf, plugin: RecentlyAddedPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  public async onOpen(): Promise<void> {
    this.redraw();
  }

  public getViewType(): string {
    return VIEW_TYPE;
  }

  public getDisplayText(): string {
    return 'Recently Added';
  }

  public getIcon(): string {
    return 'file-plus';
  }

  public onPaneMenu(menu: Menu): void {
    menu.addItem((item) => {
      item
        .setTitle('Close')
        .setIcon('cross')
        .onClick(() => {
          this.app.workspace.detachLeavesOfType(VIEW_TYPE);
        });
    });
  }

  public readonly redraw = (): void => {
    const openFile = this.app.workspace.getActiveFile();
    const { maxLength, maxAgeDays, omittedPaths } = this.plugin.data;

    const cutoff =
      maxAgeDays > 0 ? Date.now() - maxAgeDays * 24 * 60 * 60 * 1000 : 0;

    const patterns = omittedPaths.filter((p) => p.length > 0);
    const matchesOmit = (path: string): boolean =>
      patterns.some((pattern) => {
        try {
          return new RegExp(pattern).test(path);
        } catch {
          console.error('Recently Added: Invalid regex pattern: ' + pattern);
          return false;
        }
      });

    const files = this.app.vault
      .getFiles()
      .filter((f) => f.stat.ctime >= cutoff && !matchesOmit(f.path))
      .sort((a, b) => b.stat.ctime - a.stat.ctime)
      .slice(0, maxLength);

    const rootEl = createDiv({ cls: 'nav-folder mod-root' });
    const childrenEl = rootEl.createDiv({ cls: 'nav-folder-children' });

    files.forEach((tFile) => {
      const navFile = childrenEl.createDiv({
        cls: 'tree-item nav-file recently-added-file',
      });
      const navFileTitle = navFile.createDiv({
        cls: 'tree-item-self is-clickable nav-file-title recently-added-title',
      });
      const navFileTitleContent = navFileTitle.createDiv({
        cls: 'tree-item-inner nav-file-title-content',
      });

      navFileTitleContent.setText(tFile.basename);

      navFileTitle.createDiv({ cls: 'tree-item-spacer' });

      const navFileAge = navFileTitle.createDiv({
        cls: 'recently-added-age',
      });
      navFileAge.setText(this.formatAge(tFile.stat.ctime));

      if (tFile.extension !== 'md') {
        const navFileTag = navFileTitle.createDiv({ cls: 'nav-file-tag' });
        navFileTag.setText(tFile.extension);
      }

      setTooltip(navFile, tFile.path);

      if (openFile && tFile.path === openFile.path) {
        navFileTitle.addClass('is-active');
      }

      navFileTitle.setAttr('draggable', 'true');
      navFileTitle.addEventListener('dragstart', (event: DragEvent) => {
        const { dragManager } = this.app;
        const dragData = dragManager.dragFile(event, tFile);
        dragManager.onDragStart(event, dragData);
      });

      navFileTitle.addEventListener('mouseover', (event: MouseEvent) => {
        this.app.workspace.trigger('hover-link', {
          event,
          source: VIEW_TYPE,
          hoverParent: rootEl,
          targetEl: navFile,
          linktext: tFile.path,
        });
      });

      navFileTitle.addEventListener('contextmenu', (event: MouseEvent) => {
        const menu = new Menu();
        menu.addItem((item) =>
          item
            .setSection('action')
            .setTitle('Open in new tab')
            .setIcon('file-plus')
            .onClick(() => {
              this.focusFile(tFile, 'tab');
            }),
        );
        this.app.workspace.trigger(
          'file-menu',
          menu,
          tFile,
          'link-context-menu',
        );
        menu.showAtPosition({ x: event.clientX, y: event.clientY });
      });

      navFileTitle.addEventListener('click', (event: MouseEvent) => {
        const newLeaf = Keymap.isModEvent(event);
        this.focusFile(tFile, newLeaf);
      });

      navFileTitle.addEventListener('mousedown', (event: MouseEvent) => {
        if (event.button === 1) {
          event.preventDefault();
          this.focusFile(tFile, 'tab');
        }
      });
    });

    this.contentEl.setChildrenInPlace([rootEl]);
  };

  private formatAge(ctime: number): string {
    const ms = Date.now() - ctime;
    const minutes = Math.floor(ms / 60_000);
    const hours = Math.floor(ms / 3_600_000);
    const days = Math.floor(ms / 86_400_000);

    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m`;
    if (hours < 24) return `${hours}h`;
    return `${days}d`;
  }

  private readonly focusFile = (
    file: TFile,
    newLeaf: boolean | PaneType,
  ): void => {
    const leaf = this.app.workspace.getLeaf(newLeaf);
    void leaf.openFile(file);
  };
}

export default class RecentlyAddedPlugin extends Plugin {
  public data: RecentlyAddedData;

  public readonly redrawView = (): void => {
    const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE).first();
    if (leaf?.view instanceof RecentlyAddedView) {
      leaf.view.redraw();
    }
  };

  public async onload(): Promise<void> {
    console.debug('Recently Added: Loading plugin v' + this.manifest.version);

    await this.loadData();

    this.registerView(
      VIEW_TYPE,
      (leaf) => new RecentlyAddedView(leaf, this),
    );

    this.addCommand({
      id: 'recently-added-open',
      name: 'Open',
      callback: async () => {
        let leaf: WorkspaceLeaf | null;
        [leaf] = this.app.workspace.getLeavesOfType(VIEW_TYPE);
        if (!leaf) {
          leaf = this.app.workspace.getLeftLeaf(false);
          await leaf?.setViewState({ type: VIEW_TYPE });
        }
        if (leaf) {
          await this.app.workspace.revealLeaf(leaf);
        }
      },
    });

    this.registerHoverLinkSource(VIEW_TYPE, {
      display: 'Recently Added',
      defaultMod: true,
    });

    this.registerEvent(this.app.vault.on('create', this.redrawView));
    this.registerEvent(this.app.vault.on('delete', this.redrawView));
    this.registerEvent(this.app.vault.on('rename', this.redrawView));
    this.registerEvent(this.app.workspace.on('file-open', this.redrawView));

    this.addSettingTab(new RecentlyAddedSettingTab(this.app, this));
  }

  public async loadData(): Promise<void> {
    const saved =
      (await super.loadData()) as Partial<RecentlyAddedData> | null;
    this.data = { ...DEFAULT_DATA, ...saved };
  }

  public async saveData(): Promise<void> {
    await super.saveData(this.data);
  }

  public onUserEnable(): void {
    void this.app.workspace.ensureSideLeaf(VIEW_TYPE, 'left', {
      reveal: true,
    });
  }
}

class RecentlyAddedSettingTab extends PluginSettingTab {
  private readonly plugin: RecentlyAddedPlugin;

  constructor(app: App, plugin: RecentlyAddedPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  public display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName('Max files shown')
      .setDesc('Maximum number of recently added files to display.')
      .addText((text) =>
        text
          .setPlaceholder('50')
          .setValue(String(this.plugin.data.maxLength))
          .onChange(async (value) => {
            const num = parseInt(value, 10);
            if (!isNaN(num) && num > 0) {
              this.plugin.data.maxLength = num;
              await this.plugin.saveData();
              this.plugin.redrawView();
            }
          }),
      );

    new Setting(containerEl)
      .setName('Max age (days)')
      .setDesc(
        'Only show files created within this many days. Set to 0 for no limit.',
      )
      .addText((text) =>
        text
          .setPlaceholder('30')
          .setValue(String(this.plugin.data.maxAgeDays))
          .onChange(async (value) => {
            const num = parseInt(value, 10);
            if (!isNaN(num) && num >= 0) {
              this.plugin.data.maxAgeDays = num;
              await this.plugin.saveData();
              this.plugin.redrawView();
            }
          }),
      );

    new Setting(containerEl)
      .setName('Omitted path patterns')
      .setDesc('Paths matching these regex patterns will be excluded. One pattern per line.')
      .addTextArea((text) => {
        text
          .setPlaceholder('templates/\n\\.excalidraw$')
          .setValue(this.plugin.data.omittedPaths.join('\n'))
          .onChange(async (value) => {
            this.plugin.data.omittedPaths = value
              .split('\n')
              .map((p) => p.trim());
            await this.plugin.saveData();
            this.plugin.redrawView();
          });
        text.inputEl.rows = 6;
        text.inputEl.cols = 50;
      });
  }
}

// Augmentation for internal Obsidian dragManager API
declare module 'obsidian' {
  interface App {
    dragManager: {
      dragFile(event: DragEvent, file: TFile | null): unknown;
      onDragStart(event: DragEvent, dragData: unknown): void;
    };
  }
}
