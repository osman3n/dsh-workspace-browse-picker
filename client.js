/**
 * Client half of `@osman3n/dsh-workspace-browse-picker`.
 *
 * Two things live here.
 *
 * 1. A per-Workspace "add workspace" affordance. Every Workspace row in the
 *    sidebar gets a hover-only button immediately left of its "..." trigger,
 *    and the same action is also reachable from that row's "..." menu. Either
 *    one opens a folder dialog seeded at that Workspace's own folder, so
 *    pressing it on "Basic" starts at `...\Projects\Basic`.
 *
 * 2. The in-app Workspace folder picker itself. The three `directoryFlow`
 *    holes (`conversation.hero.workspace.directoryFlow`,
 *    `sidebar.workspaces.directoryFlow`, `workspace.picker.directoryFlow`) are
 *    `single` cells ranked by `priority`; the shipped occupant sits at 0, so
 *    registering at a negative priority replaces its presentation while the
 *    owner props and the Host-side `directoryPicker` composition stay exactly
 *    as they were. That is deliberate: disabling the shipped picker row would
 *    remove the only `directoryPicker` implementation, and
 *    `@deepseek-ai/dsh-api-workspace-controller` hard-depends on it
 *    (`static inject = ["directoryPicker"]`), which would take
 *    `directoryPickerController` and `uiWorkspace.pickDirectory()` down with
 *    it.
 *
 * Folder listing comes from this bundle's own Host routes (`index.js`) and a
 * plain same-origin `fetch`, never from the shared seam: the seam is composed
 * once per Host and a local Windows desktop composes it as the native chooser,
 * which cannot list. Our routes keep the shipped chooser working untouched.
 *
 * No primitives package is imported and no prop API of another plugin is
 * assumed: the dialog is plain `React.createElement` over `--dsw-alias-*`
 * tokens, following the shipped `DirectoryBrowser` design (two-pane Miller
 * layout, crate-style rows, footer bar).
 */
window.__ModuleLoader__.load({
  id: '@osman3n/dsh-workspace-browse-picker',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    /** Locale namespace owned by this bundle. */
    const NS = 'workspace-browse-picker';
    /** Attribute marking an injected row button. */
    const ATTR = 'data-wbp-add';
    /** Attribute marking the one stylesheet this bundle owns. */
    const STYLE_ATTR = 'data-wbp-style';
    /** `data-row-key` prefix of a Workspace row. */
    const ROW_PREFIX = 'workspace:';
    /** Selector of a Workspace row. Carries its own brackets. */
    const ROW_SELECTOR = '[data-row-key^="' + ROW_PREFIX + '"]';
    /** Selector of the "..." trigger inside a row's action strip. */
    const TRIGGER_SELECTOR = '[data-context-menu-trigger]';
    /** The sidebar region, used only to scope the DOM observer. */
    const SIDEBAR_SLOT = '[data-slot="sidebar.workspaces"]';
    /** Same-origin base of this bundle's Host routes. */
    const ROUTE_BASE = '/workspace-browse-picker';
    /**
     * Every request to this bundle's own Host routes carries this header. It is
     * not a secret — its whole job is that a browser refuses to attach a custom
     * header to a cross-origin request without a successful CORS preflight, and
     * the Host never grants one. That makes a cross-site `fetch` or form POST
     * impossible, which is what closes the CSRF hole on the folder routes.
     */
    const ROUTE_HEADERS = { 'x-workspace-browse-picker': '1' };
    /** The three `single` folder-flow holes this bundle replaces. */
    const FLOW_SLOTS = [
      'conversation.hero.workspace.directoryFlow',
      'sidebar.workspaces.directoryFlow',
      'workspace.picker.directoryFlow',
    ];
    /** One past every shipped priority, so this bundle renders first. */
    const FLOW_PRIORITY = -10;

    const EN = {
      'add.button': 'Add workspace here',
      'menu.addHere': 'Add workspace from this folder…',
      'dialog.title': 'Add a workspace',
      'dialog.pickerTitle': 'Select workspace directory',
      'dialog.close': 'Close',
      'dialog.cancel': 'Cancel',
      'dialog.addCurrent': 'Add this folder',
      'dialog.open': 'Open',
      'dialog.home': 'Home',
      'dialog.addEntry': 'Add this folder as a workspace',
      'dialog.newFolder': 'New folder',
      'dialog.folderName': 'Folder name',
      'dialog.create': 'Create',
      'dialog.creating': 'Creating…',
      'dialog.namePlaceholder': 'Folder name',
      'dialog.loading': 'Loading…',
      'dialog.empty': 'No folders here.',
      'dialog.retry': 'Retry',
      'dialog.busy': 'Adding…',
      'dialog.showHidden': 'Show hidden folders',
      'dialog.truncated': 'Too many folders to list; only the beginning is shown.',
      'dialog.unavailable': 'The folder service this bundle ships is not running, so the list cannot load. Restart DeepSeek Harness to load it, or choose a folder with the system dialog.',
      'dialog.pickSystem': 'Choose with system dialog…',
    };

    const ZH = {
      'add.button': '在此添加工作区',
      'menu.addHere': '从此文件夹添加工作区…',
      'dialog.title': '添加工作区',
      'dialog.pickerTitle': '选择工作区目录',
      'dialog.close': '关闭',
      'dialog.cancel': '取消',
      'dialog.addCurrent': '添加此文件夹',
      'dialog.open': '打开',
      'dialog.home': '主目录',
      'dialog.addEntry': '将此文件夹添加为工作区',
      'dialog.newFolder': '新建文件夹',
      'dialog.folderName': '文件夹名称',
      'dialog.create': '创建',
      'dialog.creating': '创建中…',
      'dialog.namePlaceholder': '文件夹名称',
      'dialog.loading': '正在加载…',
      'dialog.empty': '此处没有文件夹。',
      'dialog.retry': '重试',
      'dialog.busy': '正在添加…',
      'dialog.showHidden': '显示隐藏文件夹',
      'dialog.truncated': '文件夹过多，仅显示开头部分。',
      'dialog.unavailable': '本插件自带的文件夹服务没有运行，因此无法列出目录。重启 DeepSeek Harness 即可加载，或改用系统对话框选择文件夹。',
      'dialog.pickSystem': '用系统对话框选择…',
    };

    /**
     * Folder outline whose top-right corner is interrupted, with a plus
     * straddling that gap: the glyph the user asked for. Drawn with
     * `currentColor` so it follows the row's own hover colour, and on a 16-unit
     * grid so it lines up with the neighbouring "..." trigger.
     */
    const PLUS_SVG = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">'
      + '<path d="M2.6 4.15A1.15 1.15 0 0 1 3.75 3h3.4c.32 0 .62.13.84.36L9.1 4.65"'
      + ' fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>'
      + '<path d="M2.6 4.15v7.7A1.15 1.15 0 0 0 3.75 13h8.5a1.15 1.15 0 0 0 1.15-1.15V8.4"'
      + ' fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>'
      + '<path d="M12.2 2.1v4.2M10.1 4.2h4.2"'
      + ' fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>'
      + '</svg>';

    /** Closed folder, drawn in the shipped row-icon size. */
    const FOLDER_SVG = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">'
      + '<path d="M1.9 4.6A1.3 1.3 0 0 1 3.2 3.3h3.1c.35 0 .68.14.93.38l1 1.02h4.55a1.3 1.3 0 0 1 1.3 1.3v5.4a1.3 1.3 0 0 1-1.3 1.3H3.2a1.3 1.3 0 0 1-1.3-1.3z"'
      + ' fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>';

    /** Open folder, used for the row a user has highlighted. */
    const FOLDER_OPEN_SVG = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">'
      + '<path d="M1.9 4.6A1.3 1.3 0 0 1 3.2 3.3h3.1c.35 0 .68.14.93.38l1 1.02h4.55a1.3 1.3 0 0 1 1.3 1.3v.5"'
      + ' fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>'
      + '<path d="M2.15 12.2 3.8 7.6a1.3 1.3 0 0 1 1.22-.85h8.35a1 1 0 0 1 .95 1.32l-1.18 3.63a1.3 1.3 0 0 1-1.23.9H3.1a1 1 0 0 1-.95-1.4z"'
      + ' fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>';

    /** Chevron shown at the trailing edge of a row. */
    const CHEVRON_SVG = '<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" focusable="false">'
      + '<path d="M4.5 2.5 8 6l-3.5 3.5" fill="none" stroke="currentColor" stroke-width="1.3"'
      + ' stroke-linecap="round" stroke-linejoin="round"/></svg>';

    /**
     * The one stylesheet this bundle owns. Row-button rules first (including the
     * hover-only reveal), then the folder dialog, which follows the shipped
     * `DirectoryBrowser` design token for token under the `wbp-` prefix.
     */
    const BUTTON_CSS = [
      '[' + ATTR + ']{flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;',
      'width:28px;height:28px;padding:0;border:0;border-radius:var(--dsw-radius-sm,6px);',
      'background:transparent;color:var(--dsw-alias-label-secondary,#616a75);cursor:pointer;',
      'transition:background 120ms ease,color 120ms ease,opacity 120ms ease}',
      '[' + ATTR + ']:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.14));',
      'color:var(--dsw-alias-label-primary,#1f2328)}',
      '[' + ATTR + ']:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#2f6feb);outline-offset:-2px}',
      // Hover-only reveal, matching the shipped "..." trigger: the button keeps
      // its footprint (opacity, not display) so the row never shifts, and it
      // becomes reachable again on row hover or when focus lands inside it.
      // ROW_SELECTOR already carries its own brackets, so it is concatenated
      // bare — wrapping it again yields `[[data-row-key^=...]]`, which the
      // browser drops as an invalid selector and the button never reveals.
      ROW_SELECTOR + ' [' + ATTR + ']{opacity:0;pointer-events:none}',
      ROW_SELECTOR + ':hover [' + ATTR + '],',
      ROW_SELECTOR + ':focus-within [' + ATTR + '],',
      ROW_SELECTOR + '[data-wbp-open] [' + ATTR + ']{opacity:1;pointer-events:auto}',
      '@media (hover:none){' + ROW_SELECTOR + ' [' + ATTR + ']{opacity:1;pointer-events:auto}}',
      // ---- backdrop -------------------------------------------------------
      '.wbp-backdrop{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;',
      'padding:16px;background:rgba(15,18,24,.34);pointer-events:auto;z-index:2000}',
      // ---- dialog shell (shipped: min(680px,100%) x min(500px,100dvh-32px)) --
      '.wbp-panel{display:flex;flex-direction:column;box-sizing:border-box;',
      'width:min(680px,100%);height:min(500px,calc(100dvh - 32px));padding:0;gap:0;',
      'border-radius:12px;border:0.5px solid var(--dsw-alias-border-l3,rgba(0,0,0,.12));',
      'background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#1f2328);',
      'box-shadow:0 18px 48px rgba(0,0,0,.28);font-size:13px;line-height:1.5;text-align:left;',
      'overflow:hidden;--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2,rgba(0,0,0,.2));',
      '--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2,rgba(0,0,0,.3))}',
      // ---- header ---------------------------------------------------------
      '.wbp-head{display:flex;flex-direction:column;gap:8px;flex:none;',
      'padding:16px 14px 8px 24px;border-bottom:0.5px solid var(--dsw-alias-border-l3,rgba(0,0,0,.12))}',
      '.wbp-titleRow{display:flex;align-items:flex-end;gap:8px;min-height:28px}',
      '.wbp-title{flex:1 1 auto;margin:0;font-size:16px;line-height:24px;font-weight:510;',
      'color:var(--dsw-alias-label-primary,#1f2328)}',
      '.wbp-icon{flex:none;display:inline-flex;align-items:center;justify-content:center;',
      'width:24px;height:24px;padding:0;border:none;border-radius:var(--dsw-radius-sm,6px);',
      'background:transparent;color:var(--dsw-alias-label-tertiary,#8a919b);cursor:pointer;',
      'font-size:16px;line-height:1}',
      '.wbp-icon:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.14));',
      'color:var(--dsw-alias-label-primary,#1f2328)}',
      // ---- crumb bar ------------------------------------------------------
      '.wbp-crumbBar{display:flex;align-items:center;gap:4px;box-sizing:border-box;min-height:24px;',
      'margin-left:-9px;padding:0 8px;border:1px solid transparent;',
      'border-radius:var(--dsw-radius-sm,6px);overflow:hidden}',
      '.wbp-crumbTrail{display:flex;align-items:center;gap:4px;flex:0 1 auto;min-width:0;',
      'overflow-x:auto;scrollbar-width:none}',
      '.wbp-crumbTrail::-webkit-scrollbar{display:none}',
      '.wbp-crumb{display:inline-flex;align-items:center;max-width:160px;padding:0;border:none;',
      'background:transparent;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;',
      'font-size:13px;line-height:20px;font-weight:500;color:var(--dsw-alias-label-tertiary,#8a919b);',
      'cursor:pointer}',
      '.wbp-crumb:hover{color:var(--dsw-alias-label-primary,#1f2328)}',
      '.wbp-crumb[disabled]{cursor:default;color:var(--dsw-alias-label-primary,#1f2328)}',
      '.wbp-crumb:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#2f6feb);outline-offset:-2px}',
      '.wbp-crumbSep{display:inline-flex;align-items:center;flex:none;',
      'color:var(--dsw-alias-label-tertiary,#8a919b)}',
      // ---- body / Miller panes --------------------------------------------
      '.wbp-body{display:flex;flex-direction:column;flex:1 1 0;min-height:0;position:relative;',
      'padding:16px 16px 16px 24px;overflow:hidden}',
      '.wbp-miller{display:flex;align-items:stretch;flex:1 1 0;min-height:0;gap:12px;',
      'overflow-x:auto;scrollbar-width:none}',
      '.wbp-miller::-webkit-scrollbar{display:none}',
      '.wbp-column{display:flex;flex-direction:column;gap:2px;flex:1 1 0;min-width:256px;',
      'overflow-y:auto;padding-right:8px}',
      '.wbp-divider{flex:none;width:0.5px;background:var(--dsw-alias-border-l3,rgba(0,0,0,.12))}',
      '.wbp-row{display:flex;align-items:center;gap:4px;height:28px;flex:none;padding:4px;',
      'border:none;border-radius:var(--dsw-radius-sm,6px);background:transparent;',
      'text-align:left;color:var(--dsw-alias-label-primary,#1f2328)}',
      '.wbp-enter{flex:1 1 auto;display:flex;align-items:center;gap:4px;min-width:0;height:100%;',
      'padding:0;border:none;border-radius:var(--dsw-radius-sm,6px);background:transparent;',
      'text-align:left;cursor:pointer;color:inherit}',
      '.wbp-row:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.14))}',
      '.wbp-enter:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#2f6feb);outline-offset:-2px}',
      '.wbp-rowSelected,.wbp-rowSelected:hover{',
      'background:var(--dsw-alias-interactive-bg-active,var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.2)))}',
      '.wbp-rowIcon{flex:none;display:inline-flex;align-items:center;',
      'color:var(--dsw-alias-label-secondary,#616a75)}',
      '.wbp-rowIconSelected{flex:none;display:inline-flex;align-items:center;',
      'color:var(--dsw-alias-button-info-fill,var(--dsw-alias-brand-primary,#2f6feb))}',
      '.wbp-name{flex:1 1 0;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;',
      'font-size:13px;line-height:20px;font-weight:500;color:var(--dsw-alias-label-primary,#1f2328)}',
      '.wbp-rowChevron{flex:none;display:inline-flex;align-items:center;',
      'color:var(--dsw-alias-label-tertiary,#8a919b)}',
      '.wbp-addrow{flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;',
      'width:24px;height:24px;padding:0;border:none;border-radius:var(--dsw-radius-sm,6px);',
      'background:transparent;color:var(--dsw-alias-label-secondary,#616a75);',
      'cursor:pointer;font-size:15px;line-height:1;opacity:0}',
      '.wbp-row:hover .wbp-addrow,.wbp-addrow:focus-visible{opacity:1}',
      '.wbp-addrow:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.2));',
      'color:var(--dsw-alias-label-primary,#1f2328)}',
      '.wbp-addrow:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#2f6feb);outline-offset:-2px}',
      // ---- status text ----------------------------------------------------
      '.wbp-note{display:block;padding:4px;padding-right:120px;font-size:12px;line-height:18px;',
      'color:var(--dsw-alias-label-secondary,#616a75)}',
      '.wbp-error{padding:4px;padding-right:120px;font-size:12px;line-height:18px;',
      'color:var(--dsw-alias-state-error-primary,#d1242f)}',
      '.wbp-loadingFloat{position:absolute;right:16px;bottom:8px;padding:2px 8px;',
      'font-size:12px;line-height:18px;border-radius:var(--dsw-radius-sm,6px);',
      'color:var(--dsw-alias-label-secondary,#616a75);background:var(--dsw-alias-bg-layer-2,#f4f5f6)}',
      // ---- footer ---------------------------------------------------------
      '.wbp-foot{display:flex;align-items:center;flex-wrap:wrap;gap:8px;flex:none;',
      'padding:16px 24px;border-top:0.5px solid var(--dsw-alias-border-l3,rgba(0,0,0,.12))}',
      '.wbp-spacer{flex:1 1 0}',
      '.wbp-btn{display:inline-flex;align-items:center;justify-content:center;min-width:72px;',
      'box-sizing:border-box;padding:6px 14px;border:0.5px solid var(--dsw-alias-border-l2,rgba(0,0,0,.16));',
      'border-radius:var(--dsw-radius-md,8px);background:transparent;color:inherit;',
      'font:inherit;font-weight:500;cursor:pointer}',
      '.wbp-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.14))}',
      '.wbp-btn[disabled]{opacity:.55;cursor:default;background:transparent}',
      '.wbp-primary{border-color:transparent;background:var(--dsw-alias-brand-primary,#2f6feb);',
      'color:#fff}',
      '.wbp-primary:hover{background:var(--dsw-alias-brand-primary,#2f6feb);filter:brightness(1.06)}',
      '.wbp-primary[disabled]{opacity:.55}',
      // ---- inline "new folder" row ---------------------------------------
      '.wbp-createInput{flex:0 1 220px;box-sizing:border-box;height:32px;padding:5px 12px;',
      'border:0.5px solid var(--dsw-alias-border-l4,rgba(0,0,0,.2));',
      'border-radius:var(--dsw-radius-md,8px);background:transparent;color:inherit;',
      'font:inherit}',
      '.wbp-createInput::placeholder{color:var(--dsw-alias-label-caption,#9aa1ab)}',
      '.wbp-createInput:focus{outline:2px solid var(--dsw-alias-brand-primary,#2f6feb);outline-offset:-1px}',
      // ---- show-hidden toggle ---------------------------------------------
      '.wbp-toggle{display:inline-flex;align-items:center;gap:4px;padding:0;border:none;',
      'background:transparent;font-size:13px;line-height:20px;font-weight:500;',
      'color:var(--dsw-alias-label-secondary,#616a75);cursor:pointer}',
      '.wbp-toggle[disabled]{cursor:default;color:var(--dsw-alias-label-caption,#9aa1ab)}',
      '.wbp-toggleActive{color:var(--dsw-alias-label-primary,#1f2328)}',
    ].join('');

    // -----------------------------------------------------------------------
    // Small helpers
    // -----------------------------------------------------------------------

    /** Prefer a Host business message carried by a rejected Remote call. */
    function failureText(error) {
      if (error !== null && typeof error === 'object' && 'rpcError' in error) {
        const rpcError = error.rpcError;
        if (rpcError !== null && typeof rpcError === 'object'
          && 'message' in rpcError && typeof rpcError.message === 'string') return rpcError.message;
      }
      return error instanceof Error ? error.message : String(error);
    }

    /**
     * The dialog's own transport is gone (the Host web carrier is missing, or
     * this build did not load the bundle's host half). Every other failure —
     * a locked folder, a removed drive — is a real error worth showing raw.
     */
    function failureKind(error) {
      if (error === null || typeof error !== 'object') return null;
      const rpcError = 'rpcError' in error ? error.rpcError : error;
      if (rpcError === null || typeof rpcError !== 'object') return null;
      if ('code' in rpcError) {
        if (rpcError.code === 'workspace-browse-picker/unavailable') return 'unavailable';
        if (rpcError.code === 'directory-picker/unavailable') return 'unavailable';
      }
      const message = 'message' in rpcError && typeof rpcError.message === 'string' ? rpcError.message : '';
      return message.includes('capability') ? 'unavailable' : null;
    }

    /** Separator of a Host path. */
    function separatorOf(path) {
      return String(path).includes('\\') ? '\\' : '/';
    }

    /** Path segments of a Host path, root-first (used before a listing arrives). */
    function pathCrumbs(path) {
      const text = String(path || '');
      if (text === '') return [];
      const sep = separatorOf(text);
      const parts = text.split(sep).filter((part) => part !== '');
      const drive = sep === '\\' && parts.length > 0 && /^[A-Za-z]:$/.test(parts[0]);
      const root = sep === '\\' ? (drive ? parts[0] + sep : sep) : sep;
      const crumbs = [{ name: root, path: root }];
      let current = root;
      for (let index = drive ? 1 : 0; index < parts.length; index += 1) {
        current = current.endsWith(sep) ? current + parts[index] : current + sep + parts[index];
        crumbs.push({ name: parts[index], path: current });
      }
      return crumbs;
    }

    /** Crumbs for the current level: the Host's own chain when it is known. */
    function crumbTrail(listing, path) {
      if (listing !== null && Array.isArray(listing.crumbs) && listing.crumbs.length > 0) {
        return listing.crumbs.map((crumb) => ({ name: crumb.name, path: crumb.path }));
      }
      return pathCrumbs(path);
    }

    /** Entries of one listing, applying the hidden-folder filter. */
    function entriesOf(listing, showHidden) {
      if (listing === null || !Array.isArray(listing.entries)) return [];
      if (showHidden) return listing.entries;
      return listing.entries.filter((entry) => entry.hidden !== true);
    }

    /**
     * Build the one-instance request store shared by the row button, the menu
     * row and the dialog. A new object per open keeps React's snapshot
     * identity honest and remounts the dialog with its own seed path.
     */
    function createRequestStore() {
      let value = null;
      const listeners = new Set();
      return {
        getSnapshot() { return value; },
        subscribe(listener) {
          listeners.add(listener);
          return () => { listeners.delete(listener); };
        },
        set(next) {
          if (Object.is(next, value)) return;
          value = next;
          for (const listener of [...listeners]) {
            try { listener(); } catch (error) { console.warn('[workspace-browse-picker] request subscriber failed:', error); }
          }
        },
      };
    }

    // -----------------------------------------------------------------------
    // Row button (guarded DOM injection)
    // -----------------------------------------------------------------------

    /**
     * Keep one add button inside every Workspace row's action strip, left of
     * the "..." trigger. Returns `{ sync, dispose }`.
     * @param options - `readItems()` returns the live WorkspaceView list,
     *   `open(workspace)` opens the dialog, `readLabel()` the localized name.
     */
    function installRowButtons(options) {
      let frame = 0;
      let disposed = false;
      let sidebar = null;

      const ensureStyle = () => {
        const existing = document.head.querySelector('style[' + STYLE_ATTR + ']');
        if (existing !== null) {
          // A plugin reload keeps the old tag; stale text would otherwise win.
          if (existing.textContent !== BUTTON_CSS) existing.textContent = BUTTON_CSS;
          return;
        }
        const style = document.createElement('style');
        style.setAttribute(STYLE_ATTR, '');
        style.textContent = BUTTON_CSS;
        document.head.appendChild(style);
      };

      const sidebarOf = () => {
        if (sidebar !== null && sidebar.isConnected) return sidebar;
        sidebar = document.querySelector(SIDEBAR_SLOT);
        return sidebar;
      };

      const openFromRow = (key) => {
        const items = options.readItems() || [];
        const workspace = items.find((item) => item.workspaceId === key);
        if (workspace === undefined) return;
        options.open(workspace);
      };

      const makeButton = (key, label) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.setAttribute(ATTR, '');
        button.setAttribute('aria-label', label);
        button.title = label;
        button.draggable = false;
        button.innerHTML = PLUS_SVG;
        const stop = (event) => {
          event.preventDefault();
          event.stopPropagation();
        };
        button.addEventListener('pointerdown', (event) => { event.stopPropagation(); }, true);
        button.addEventListener('mousedown', (event) => { event.stopPropagation(); }, true);
        button.addEventListener('click', (event) => {
          stop(event);
          openFromRow(key);
        }, true);
        return button;
      };

      const sync = () => {
        try {
          ensureStyle();
          const items = options.readItems() || [];
          const byId = new Map();
          for (const item of items) byId.set(item.workspaceId, item);
          // An empty list means "not loaded yet", not "no Workspaces": pruning on
          // it would delete every button and none would ever come back.
          const pruning = byId.size > 0;
          const label = options.readLabel();
          for (const row of document.querySelectorAll(ROW_SELECTOR)) {
            const key = (row.getAttribute('data-row-key') || '').slice(ROW_PREFIX.length);
            if (key === '') continue;
            const workspace = byId.get(key);
            const existing = row.querySelector('[' + ATTR + ']');
            if (existing !== null) {
              if (existing.getAttribute('aria-label') !== label) {
                existing.setAttribute('aria-label', label);
                existing.title = label;
              }
              continue;
            }
            if (pruning && workspace === undefined) continue;
            const trigger = row.querySelector(TRIGGER_SELECTOR);
            if (trigger === null) continue;
            // A Session row nested inside a Workspace row has its own trigger;
            // only the Workspace anchor owns this button.
            if (trigger.closest('[data-row-key]') !== row) continue;
            const parent = trigger.parentElement;
            if (parent === null) continue;
            parent.insertBefore(makeButton(key, label), trigger);
          }
        } catch (error) {
          console.warn('[workspace-browse-picker] row button sync failed:', error);
        }
      };

      const schedule = () => {
        if (frame !== 0 || disposed) return;
        frame = requestAnimationFrame(() => {
          frame = 0;
          sync();
        });
      };

      ensureStyle();
      sync();

      const observer = new MutationObserver((records) => {
        const sidebar = sidebarOf();
        for (const record of records) {
          if (sidebar !== null && record.target !== null && record.target !== undefined) {
            if (record.target === sidebar || sidebar.contains(record.target)) {
              schedule();
              return;
            }
          }
          for (const node of record.addedNodes) {
            if (!(node instanceof Element)) continue;
            if (node.matches(ROW_SELECTOR) || node.querySelector(ROW_SELECTOR) !== null) {
              schedule();
              return;
            }
          }
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });

      return {
        // Synchronous on purpose: callers (the label-change effect and the
        // Workspace-list subscription) expect the rows to be updated before the
        // next paint. The observer stays debounced through `schedule`.
        sync,
        dispose() {
          if (disposed) return;
          disposed = true;
          if (frame !== 0) cancelAnimationFrame(frame);
          frame = 0;
          observer.disconnect();
          for (const button of document.querySelectorAll('[' + ATTR + ']')) button.remove();
          const style = document.head.querySelector('style[' + STYLE_ATTR + ']');
          if (style !== null) style.remove();
          sidebar = null;
        },
      };
    }

    // -----------------------------------------------------------------------
    // Folder dialog: two-pane Miller, following the shipped DirectoryBrowser
    // -----------------------------------------------------------------------

    const NEW_FOLDER_KEY = '__new-folder__';

    /**
     * Folder dialog seeded at `startPath`. It lists, descends, creates and
     * commits a folder, using the two-pane Miller layout and chrome of the
     * shipped Workspace folder picker.
     *
     * @param props.startPath - folder to open at ('' falls back to Host home)
     * @param props.mode - 'add' for the per-row flow, 'pick' for the slot flow
     * @param props.busy - owner-side busy flag (slot flow)
     * @param props.onAdopt - called with the committed folder path
     * @param props.onClose - called when the user dismisses the dialog
     */
    function FolderDialog(props) {
      const t = props.t;
      const listDirectory = props.listDirectory;
      const createDirectory = props.createDirectory;
      const onAdopt = props.onAdopt;
      const onClose = props.onClose;
      const pickDirectory = props.pickDirectory;
      const mode = props.mode === 'pick' ? 'pick' : 'add';

      const [path, setPath] = React.useState(typeof props.startPath === 'string' ? props.startPath : '');
      const [listing, setListing] = React.useState(null);
      const [loading, setLoading] = React.useState(true);
      const [failure, setFailure] = React.useState(null);
      const [failureKindState, setFailureKindState] = React.useState(null);
      const [selected, setSelected] = React.useState(null);
      const [childListing, setChildListing] = React.useState(null);
      const [busy, setBusy] = React.useState(false);
      const [draft, setDraft] = React.useState(null);
      const [creating, setCreating] = React.useState(false);
      const [createError, setCreateError] = React.useState(null);
      const [showHidden, setShowHidden] = React.useState(false);
      const [retryToken, setRetryToken] = React.useState(0);
      const generation = React.useRef(0);
      const childGeneration = React.useRef(0);
      const restoredDraft = React.useRef(null);
      /** `true` while the New-folder name field is open (`''` is a live empty draft). */
      const editing = draft !== null;

      // ---- the folder currently open ------------------------------------
      React.useEffect(() => {
        const seq = generation.current + 1;
        generation.current = seq;
        const controller = new AbortController();
        setLoading(true);
        setFailure(null);
        setFailureKindState(null);
        let request;
        try {
          request = listDirectory(path, controller.signal);
        } catch (error) {
          setLoading(false);
          setFailure(failureText(error));
          setFailureKindState(failureKind(error));
          return undefined;
        }
        Promise.resolve(request).then((result) => {
          if (seq !== generation.current) return;
          setListing(result);
          setLoading(false);
        }, (reason) => {
          if (seq !== generation.current) return;
          setListing(null);
          setLoading(false);
          setFailure(failureText(reason));
          setFailureKindState(failureKind(reason));
        });
        return () => { controller.abort(); };
      }, [path, listDirectory, retryToken]);

      // ---- the highlighted folder's own children (right pane) ------------
      React.useEffect(() => {
        if (selected === null) { setChildListing(null); return undefined; }
        const seq = childGeneration.current + 1;
        childGeneration.current = seq;
        const controller = new AbortController();
        let request;
        try {
          request = listDirectory(selected.path, controller.signal);
        } catch (error) {
          setChildListing(null);
          return undefined;
        }
        Promise.resolve(request).then((result) => {
          if (seq !== childGeneration.current) return;
          setChildListing(result);
        }, () => {
          if (seq !== childGeneration.current) return;
          setChildListing(null);
        });
        return () => { controller.abort(); };
      }, [selected, listDirectory]);

      const modalBusy = busy || props.busy === true;

      React.useEffect(() => {
        const onKeyDown = (event) => {
          if (event.key !== 'Escape') return;
          event.stopPropagation();
          if (draft !== null) { setDraft(null); return; }
          if (!modalBusy) onClose();
        };
        window.addEventListener('keydown', onKeyDown, true);
        return () => window.removeEventListener('keydown', onKeyDown, true);
      }, [modalBusy, draft, onClose]);

      // Focus and pre-select the name ONCE, when the field appears. Depending
      // on `draft` itself would re-run this on every keystroke, and the
      // `select()` would swallow the next character -- the field would only
      // ever hold one letter.
      React.useEffect(() => {
        if (!editing) return;
        const node = restoredDraft.current;
        if (node === null) return;
        node.focus();
        node.select();
      }, [editing]);

      const adopt = (target) => {
        if (modalBusy) return;
        setBusy(true);
        setFailure(null);
        Promise.resolve().then(() => onAdopt(target)).then(() => {
          setBusy(false);
          onClose();
        }, (reason) => {
          setBusy(false);
          setFailure(failureText(reason));
        });
      };

      const submitCreate = () => {
        if (draft === null || creating) return;
        const name = draft;
        if (name.trim() === '') return;
        setCreating(true);
        setCreateError(null);
        Promise.resolve().then(() => createDirectory(path, name)).then((created) => {
          setCreating(false);
          setDraft(null);
          const target = typeof created === 'string' && created !== '' ? created : path;
          if (target !== path) setPath(target);
          else setRetryToken((token) => token + 1);
        }, (reason) => {
          setCreating(false);
          setCreateError(failureText(reason));
        });
      };

      const crumbs = crumbTrail(listing, path);
      const entries = entriesOf(listing, showHidden);
      const children = entriesOf(childListing, showHidden);
      const inert = modalBusy || creating;
      const unavailable = failureKindState === 'unavailable';
      const home = listing !== null && typeof listing.home === 'string' ? listing.home : '';

      const head = h('div', { className: 'wbp-head' },
        h('div', { className: 'wbp-titleRow' },
          h('h2', { className: 'wbp-title' }, t(mode === 'pick' ? 'dialog.pickerTitle' : 'dialog.title')),
          h('button', {
            type: 'button',
            className: 'wbp-icon',
            'aria-label': t('dialog.close'),
            title: t('dialog.close'),
            disabled: modalBusy,
            onClick: () => { if (!modalBusy) onClose(); },
          }, '\u00d7')),
        h('div', { className: 'wbp-crumbBar' },
          h('div', { className: 'wbp-crumbTrail' }, crumbs.map((crumb, index) => {
            const last = index === crumbs.length - 1;
            const name = home !== '' && crumb.path === home ? t('dialog.home') : crumb.name;
            return h('span', {
              key: crumb.path,
              style: { display: 'inline-flex', alignItems: 'center', gap: 4, minWidth: 0 },
            },
            index > 0
              ? h('span', { className: 'wbp-crumbSep', 'aria-hidden': 'true' }, '\u203a')
              : null,
            h('button', {
              type: 'button',
              className: 'wbp-crumb',
              'aria-current': last ? 'true' : undefined,
              disabled: inert || last,
              title: crumb.path,
              onClick: () => {
                if (last) return;
                setSelected(null);
                setPath(crumb.path);
              },
            }, name));
          }))));

      // ---- left pane: the open folder's sub-folders ----------------------
      const leftRows = entries.map((entry) => {
        const isSelected = selected !== null && selected.path === entry.path;
        return h('div', {
          className: 'wbp-row' + (isSelected ? ' wbp-rowSelected' : ''),
          key: entry.path,
          onDoubleClick: () => { setSelected(null); setPath(entry.path); },
        },
        h('button', {
          type: 'button',
          className: 'wbp-enter',
          title: entry.path,
          disabled: inert,
          'aria-current': isSelected ? 'true' : undefined,
          onClick: () => setSelected(selected !== null && selected.path === entry.path ? null : entry),
        },
        h('span', {
          className: isSelected ? 'wbp-rowIconSelected' : 'wbp-rowIcon',
          'aria-hidden': 'true',
          dangerouslySetInnerHTML: { __html: isSelected ? FOLDER_OPEN_SVG : FOLDER_SVG },
        }),
        h('span', { className: 'wbp-name' }, entry.name)),
        h('span', { className: 'wbp-rowChevron', 'aria-hidden': 'true', dangerouslySetInnerHTML: { __html: CHEVRON_SVG } }),
        mode === 'add'
          ? h('button', {
            type: 'button',
            className: 'wbp-addrow',
            'aria-label': t('dialog.addEntry'),
            title: t('dialog.addEntry'),
            disabled: inert,
            onClick: () => adopt(entry.path),
          }, '+')
          : null);
      });

      // ---- right pane: children of the highlighted folder ----------------
      const rightRows = children.map((entry) => h('div', { className: 'wbp-row', key: entry.path },
        h('button', {
          type: 'button',
          className: 'wbp-enter',
          title: entry.path,
          disabled: inert,
          onClick: () => { setSelected(null); setPath(entry.path); },
        },
        h('span', { className: 'wbp-rowIcon', 'aria-hidden': 'true', dangerouslySetInnerHTML: { __html: FOLDER_SVG } }),
        h('span', { className: 'wbp-name' }, entry.name)),
        h('span', { className: 'wbp-rowChevron', 'aria-hidden': 'true', dangerouslySetInnerHTML: { __html: CHEVRON_SVG } })));

      let notice = null;
      if (unavailable) {
        notice = h('div', { className: 'wbp-note' }, t('dialog.unavailable'));
      } else if (entries.length === 0 && failure === null) {
        notice = h('div', { className: 'wbp-note' }, t('dialog.empty'));
      } else if (failure !== null) {
        notice = h('div', { className: 'wbp-error' }, failure);
      }

      const panes = unavailable
        ? h('div', { className: 'wbp-miller' }, h('div', { className: 'wbp-column' }, notice))
        : h('div', { className: 'wbp-miller' },
          h('div', { className: 'wbp-column', role: 'list' },
            notice === null ? null : notice,
            leftRows),
          selected === null ? null : h('div', { className: 'wbp-divider', 'aria-hidden': 'true' }),
          selected === null ? null : h('div', { className: 'wbp-column', role: 'list' }, rightRows));

      const body = h('div', { className: 'wbp-body' }, panes,
        loading
          ? h('div', { className: 'wbp-loadingFloat' }, t('dialog.loading'))
          : null);

      const createRow = draft === null
        ? null
        : h('div', { className: 'wbp-foot', style: { borderTop: 'none', paddingTop: 0 } },
          h('input', {
            className: 'wbp-createInput',
            ref: (node) => { restoredDraft.current = node; },
            value: draft,
            placeholder: t('dialog.namePlaceholder'),
            'aria-label': t('dialog.namePlaceholder'),
            disabled: creating,
            onChange: (event) => setDraft(event.target.value),
            onKeyDown: (event) => {
              if (event.key === 'Enter') { event.preventDefault(); submitCreate(); }
              if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setDraft(null); }
            },
          }),
          h('button', {
            type: 'button',
            className: 'wbp-btn',
            disabled: creating || draft.trim() === '',
            onClick: submitCreate,
          }, creating ? t('dialog.creating') : t('dialog.create')),
          createError === null ? null : h('span', { className: 'wbp-error' }, createError));

      // Which folder the primary acts on. This matches the shipped browser's
      // `selected?.path ?? parent?.path`: a highlighted row wins, otherwise the
      // folder currently open does.
      //
      // Two bugs lived here. (1) The primary used the open folder only, so
      // highlighting a child and pressing it added the PARENT -- usually an
      // existing Workspace, which `workspaces.create` resolves idempotently, so
      // all the user saw was a new session in the old Workspace. (2) `path` is
      // the request we sent, and it stays `''` when the dialog opens at the Host
      // home; the resolved folder only exists on `listing.path`, so adopting the
      // raw `path` would have sent an empty string.
      const openPath = listing !== null && typeof listing.path === 'string' && listing.path !== ''
        ? listing.path
        : path;
      const primaryTarget = selected !== null ? selected.path : openPath;

      const foot = h('div', { className: 'wbp-foot' },
        h('button', {
          type: 'button',
          className: 'wbp-btn',
          disabled: inert || unavailable,
          onClick: () => { setDraft(''); setCreateError(null); },
        }, t('dialog.newFolder')),
        h('button', {
          type: 'button',
          className: 'wbp-toggle' + (showHidden ? ' wbp-toggleActive' : ''),
          'aria-pressed': showHidden ? 'true' : 'false',
          disabled: inert || unavailable,
          onClick: () => setShowHidden((value) => !value),
        }, t('dialog.showHidden')),
        unavailable && pickDirectory !== null
          ? h('button', {
            type: 'button',
            className: 'wbp-btn',
            disabled: modalBusy,
            onClick: () => {
              setBusy(true);
              setFailure(null);
              Promise.resolve().then(() => pickDirectory()).then((chosen) => {
                if (chosen === null || chosen === undefined) { setBusy(false); return null; }
                return Promise.resolve(onAdopt(chosen)).then(() => { setBusy(false); onClose(); });
              }, (reason) => { setBusy(false); setFailure(failureText(reason)); });
            },
          }, t('dialog.pickSystem'))
          : null,
        failure !== null && !loading
          ? h('button', {
            type: 'button',
            className: 'wbp-btn',
            disabled: modalBusy,
            onClick: () => setRetryToken((token) => token + 1),
          }, t('dialog.retry'))
          : null,
        h('span', { className: 'wbp-spacer' }),
        h('button', {
          type: 'button',
          className: 'wbp-btn',
          disabled: modalBusy,
          onClick: onClose,
        }, t('dialog.cancel')),
        h('button', {
          type: 'button',
          className: 'wbp-btn wbp-primary',
          disabled: inert || unavailable,
          title: primaryTarget,
          onClick: () => adopt(primaryTarget),
        }, modalBusy ? t('dialog.busy') : t(mode === 'pick' ? 'dialog.open' : 'dialog.addCurrent')));

      return h('div', {
        className: 'wbp-backdrop',
        onMouseDown: (event) => {
          if (event.target !== event.currentTarget) return;
          if (!modalBusy) onClose();
        },
      }, h('div', {
        className: 'wbp-panel',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': t(mode === 'pick' ? 'dialog.pickerTitle' : 'dialog.title'),
      }, head, body, createRow, foot));
    }

    // -----------------------------------------------------------------------
    // Overlay entry: keeps the row buttons and hosts the seeded dialog
    // -----------------------------------------------------------------------

    const EMPTY_ITEMS = [];

    /**
     * Frame-wide overlay entry. It renders nothing until a request arrives,
     * and owns the row-button installation for the component's lifetime.
     */
    function AddWorkspaceOverlay(props) {
      const t = props.t;
      const useWorkspaces = props.useWorkspaces;
      const useAddRequest = props.useAddRequest;
      const listDirectory = props.listDirectory;
      const createDirectory = props.createDirectory;
      const adoptWorkspace = props.adoptWorkspace;
      const pickDirectory = props.pickDirectory;

      const items = typeof useWorkspaces === 'function'
        ? useWorkspaces((state) => state.items)
        : EMPTY_ITEMS;
      const request = useAddRequest((value) => value);
      const label = t('add.button');

      // Fall back to the live service snapshot: the standard prop can arrive
      // empty (or not at all) while the sidebar itself is showing Workspaces,
      // and an empty list makes the injector skip every row.
      const readItemsFallback = props.readWorkspaceItems;
      const subscribeItems = props.subscribeWorkspaceItems;
      const itemsRef = React.useRef(items);
      itemsRef.current = Array.isArray(items) && items.length > 0
        ? items
        : (typeof readItemsFallback === 'function' ? readItemsFallback() : items);
      const labelRef = React.useRef(label);
      labelRef.current = label;
      const syncRef = React.useRef(null);

      // Stable for the component's lifetime: a row button must open the dialog
      // even while this component renders `null`, so it may not depend on the
      // current request or on anything recreated per render.
      const requestAddWorkspace = props.requestAddWorkspace;
      const requestRef = React.useRef(requestAddWorkspace);
      requestRef.current = requestAddWorkspace;
      const openDialog = React.useCallback((workspace) => {
        const ask = requestRef.current;
        if (typeof ask !== 'function') return;
        ask({ path: workspace.path, workspaceId: workspace.workspaceId });
      }, []);

      React.useEffect(() => {
        const controller = installRowButtons({
          readItems: () => itemsRef.current,
          open: openDialog,
          readLabel: () => labelRef.current,
        });
        syncRef.current = controller.sync;
        return () => {
          syncRef.current = null;
          controller.dispose();
        };
      }, [openDialog]);

      React.useEffect(() => {
        if (syncRef.current !== null) syncRef.current();
      }, [label, items]);

      // The Workspace list can change without this component re-rendering (a
      // rename elsewhere, a delete from the "..." menu), and the row injector
      // must follow it or stale buttons outlive their rows.
      React.useEffect(() => {
        if (typeof subscribeItems !== 'function') return undefined;
        const dispose = subscribeItems(() => {
          itemsRef.current = typeof readItemsFallback === 'function'
            ? readItemsFallback()
            : itemsRef.current;
          if (syncRef.current !== null) syncRef.current();
        });
        return typeof dispose === 'function' ? dispose : undefined;
      }, [subscribeItems, readItemsFallback]);

      if (request === null) return null;

      return h(FolderDialog, {
        key: request.id,
        t,
        mode: 'add',
        startPath: request.path,
        listDirectory,
        createDirectory,
        pickDirectory,
        onAdopt: adoptWorkspace,
        onClose: props.clearAddRequest,
      });
    }

    // -----------------------------------------------------------------------
    // The Workspace folder-picker slot entry
    // -----------------------------------------------------------------------

    /**
     * Occupant of the three `directoryFlow` holes. The owner supplies only
     * `{ open, busy, onPicked, onCancel, onError }` — notably no seed path — so
     * this entry opens at the Host's home folder and reports the chosen one.
     */
    function WorkspaceFlowEntry(props) {
      if (props.open !== true) return null;
      const listDirectory = props.listDirectory;
      const createDirectory = props.createDirectory;
      const onPicked = props.onPicked;
      const onCancel = props.onCancel;
      const onError = props.onError;
      const pickDirectory = props.pickDirectory;

      return h(FolderDialog, {
        t: props.t,
        mode: 'pick',
        startPath: '',
        busy: props.busy === true,
        listDirectory,
        createDirectory,
        pickDirectory,
        onAdopt: (path) => onPicked(path),
        onClose: () => onCancel(),
        onFailure: (message) => { if (typeof onError === 'function') onError(message); },
      });
    }

    // -----------------------------------------------------------------------
    // Plugin
    // -----------------------------------------------------------------------

    function apply(ctx) {
      const read = (name) => {
        try {
          const value = ctx.get && ctx.get(name);
          return value === undefined ? null : value;
        } catch (error) {
          return null;
        }
      };

      const locale = read('locale');
      if (locale !== null) {
        try {
          locale.register(NS, 'en', EN);
          locale.register(NS, 'zh', ZH);
        } catch (error) {
          console.warn('[workspace-browse-picker] locale registration failed:', error);
        }
      }

      const uiWorkspace = read('uiWorkspace');
      const workspaces = read('workspaces');

      const boundLocale = locale !== null && typeof locale.bind === 'function'
        ? locale.bind(NS)
        : null;
      /**
       * The Client locale service refuses a second registration of the same
       * namespace (`locale namespace "x" already has locale "en"`), so a
       * hot-reloaded bundle whose first activation registered an older
       * dictionary would render raw keys forever. Resolve through the service
       * first, then fall back to this bundle's own dictionaries.
       */
      const activeLocale = () => {
        if (locale === null || typeof locale.getSnapshot !== 'function') return 'en';
        try {
          const snapshot = locale.getSnapshot();
          return snapshot !== null && snapshot !== undefined && typeof snapshot.active === 'string'
            ? snapshot.active
            : 'en';
        } catch (error) {
          return 'en';
        }
      };
      const label = (key) => {
        if (boundLocale !== null) {
          try {
            const resolved = boundLocale(key);
            if (typeof resolved === 'string' && resolved !== key) return resolved;
          } catch (error) {
            // fall through to the local dictionary
          }
        }
        const dictionary = activeLocale() === 'zh' ? ZH : EN;
        return dictionary[key] === undefined ? key : dictionary[key];
      };

      /**
       * Folder transport. These two routes belong to this bundle's own host
       * half (`index.js`), not to the shared `directoryPicker` seam: the seam is
       * composed once per Host and a local Windows desktop composes it as the
       * native chooser, which cannot list. Going through our own routes leaves
       * the shipped picker — and `directoryPickerController`, which hard-depends
       * on it — exactly as it was.
       */
      const unavailable = (message) => {
        const error = new Error(message);
        error.rpcError = { code: 'workspace-browse-picker/unavailable', message };
        return error;
      };

      /**
       * One same-origin round trip. The Host always answers 200 with an
       * `{ ok, value }` / `{ ok, message }` envelope so a business refusal stays
       * distinguishable from transport loss.
       */
      const callRoute = async (pathname, init, signal) => {
        let response;
        try {
          response = await fetch(ROUTE_BASE + pathname, {
            cache: 'no-store',
            credentials: 'same-origin',
            signal,
            ...init,
          });
        } catch (error) {
          if (error !== null && typeof error === 'object' && error.name === 'AbortError') throw error;
          throw unavailable('The folder service could not be reached. Restart DeepSeek Harness to load it.');
        }
        let payload = null;
        try {
          payload = await response.json();
        } catch (error) {
          throw unavailable('The folder service answered with something unreadable.');
        }
        if (payload === null || typeof payload !== 'object') {
          throw unavailable('The folder service answered with something unreadable.');
        }
        if (payload.ok !== true) {
          throw new Error(typeof payload.message === 'string' && payload.message !== ''
            ? payload.message
            : 'The folder could not be read.');
        }
        return payload.value;
      };

      const listDirectory = (path, signal) => callRoute(
        '/list' + (typeof path === 'string' && path !== ''
          ? '?path=' + encodeURIComponent(path)
          : ''),
        { method: 'GET', headers: ROUTE_HEADERS },
        signal,
      );

      const createDirectory = (path, name) => callRoute('/create', {
        method: 'POST',
        headers: { ...ROUTE_HEADERS, 'content-type': 'application/json' },
        body: JSON.stringify({ path, name }),
      });

      const pickDirectory = uiWorkspace !== null && typeof uiWorkspace.pickDirectory === 'function'
        ? () => uiWorkspace.pickDirectory()
        : null;

      // ---- the app-wide folder picker (slot override) ---------------------
      // `single` cells render the first entry in priority order, and the
      // shipped occupant sits at 0, so a negative priority replaces its
      // presentation without touching the Host composition underneath.
      // `t` is supplied through inject (the same way the shipped browse flow
      // does it) so the dialog uses this bundle's dictionary even when the
      // locale service refused a second registration after a hot reload.
      const flowInject = () => ({ listDirectory, createDirectory, pickDirectory, t: label });
      for (const name of FLOW_SLOTS) {
        ctx.slots.inject(name, () => ctx.slots.register({
          name,
          priority: FLOW_PRIORITY,
          locale: NS,
          inject: flowInject,
        }, WorkspaceFlowEntry));
      }

      if (uiWorkspace === null || workspaces === null) {
        console.warn('[workspace-browse-picker] uiWorkspace/workspaces client services are unavailable;'
          + ' the per-row add button and its dialog stay off.');
        return;
      }

      /**
       * The authoritative Workspace list. The `useWorkspaces` standard prop is
       * the preferred source, but it is only guaranteed inside a registered
       * slot's own render; the row injector also runs from the DOM observer,
       * where a missing or stale hook value would skip every row and no button
       * would ever appear. This snapshot is the same one the sidebar renders.
       */
      const readWorkspaceItems = () => {
        try {
          const snapshot = workspaces.list && workspaces.list.getSnapshot();
          if (snapshot !== null && typeof snapshot === 'object' && Array.isArray(snapshot.items)) {
            return snapshot.items;
          }
        } catch (error) {
          console.warn('[workspace-browse-picker] could not read the Workspace list:', error);
        }
        return EMPTY_ITEMS;
      };

      /** Re-run the row sync whenever the Workspace list changes. */
      const subscribeWorkspaceItems = (listener) => {
        try {
          if (workspaces.list && typeof workspaces.list.subscribe === 'function') {
            return workspaces.list.subscribe(() => { listener(); });
          }
        } catch (error) {
          console.warn('[workspace-browse-picker] could not subscribe to the Workspace list:', error);
        }
        return () => {};
      };

      /** Register the folder as a Workspace and open a Session in it, as the shipped add flow does. */
      const adoptWorkspace = async (path) => {
        const view = await workspaces.create({ path });
        if (view !== null && view !== undefined && typeof uiWorkspace.startSession === 'function') {
          try {
            await uiWorkspace.startSession(view.workspaceId, { clearPreviousDraft: false });
          } catch (error) {
            console.warn('[workspace-browse-picker] could not start a Session in the new Workspace:', error);
          }
        }
        return view;
      };

      const request = createRequestStore();
      let nextRequestId = 0;

      const requestAddWorkspace = (seed) => {
        nextRequestId += 1;
        request.set({ id: nextRequestId, path: seed.path, workspaceId: seed.workspaceId });
      };

      ctx.effect(() => {
        const menus = read('contextMenus');
        if (menus === null) return () => {};
        return menus.register({
          id: 'workspace-browse-picker.add-from-folder',
          target: 'workspace',
          order: 150,
          resolve: (target) => [{
            id: 'add-from-folder',
            label: label('menu.addHere'),
            run: () => { requestAddWorkspace({ path: target.path, workspaceId: target.workspaceId }); },
          }],
        });
      }, 'workspace-browse-picker: workspace menu row');

      ctx.slots.inject('shell.overlay', () => ctx.slots.register({
        name: 'shell.overlay',
        id: 'workspace-browse-picker.dialog',
        order: 60,
        locale: NS,
        inject: () => ({
          hooks: { addRequest: request },
          t: label,
          listDirectory,
          createDirectory,
          pickDirectory,
          adoptWorkspace,
          requestAddWorkspace,
          readWorkspaceItems,
          subscribeWorkspaceItems,
          clearAddRequest: () => { request.set(null); },
        }),
      }, AddWorkspaceOverlay));
    }

    return { inject: ['slots'], apply };
  },
});
