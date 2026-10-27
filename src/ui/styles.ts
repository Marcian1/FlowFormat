export const styles = `
:root { color-scheme: light; }
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; overflow-y: auto; }
#root { min-height: 100%; }
body { background: #f4f5f7; color: #1f2430; font: 13px/1.45 "Segoe UI", system-ui, sans-serif; }
.app { display: flex; flex-direction: column; gap: 12px; min-height: 100%; padding: 16px 20px; max-width: 1100px; margin: 0 auto; }
h1 { margin: 0 0 2px; font-size: 20px; font-weight: 600; }
.sub, .hint, .muted { margin: 0; color: #667085; }
.hint { font-size: 12px; }
.pad { padding: 8px 4px; }
.card { background: #fff; border: 1px solid #e3e6ec; border-radius: 8px; padding: 12px 14px; }
.options { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.spacer { flex: 1; }
.check { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
select, .search { font: inherit; padding: 5px 8px; border: 1px solid #cfd4dc; border-radius: 6px; background: #fff; color: inherit; }
.search { min-width: 160px; }
.seg { display: inline-flex; border: 1px solid #cfd4dc; border-radius: 6px; overflow: hidden; }
.seg-btn { font: inherit; padding: 5px 12px; border: none; background: #fff; cursor: pointer; border-right: 1px solid #cfd4dc; }
.seg-btn:last-child { border-right: none; }
.seg-btn.on { background: #2f5bea; color: #fff; }
.btn { font: inherit; padding: 6px 14px; border: 1px solid #cfd4dc; background: #fff; color: #1f2430; border-radius: 6px; cursor: pointer; }
.btn:hover:not(:disabled) { background: #f0f2f5; }
.btn:disabled { opacity: .5; cursor: default; }
.btn.primary { background: #2f5bea; border-color: #2f5bea; color: #fff; }
.btn.primary:hover:not(:disabled) { background: #2449c4; }
.progress-text { display: flex; justify-content: space-between; margin-bottom: 8px; }
.bar { height: 8px; background: #e8ebf0; border-radius: 4px; overflow: hidden; }
.bar-fill { height: 100%; background: #2f5bea; transition: width .15s; }
.banner { padding: 8px 12px; border-radius: 6px; border: 1px solid; }
.banner.ok { background: #ecfdf3; border-color: #abefc6; color: #067647; }
.banner.warn { background: #fffaeb; border-color: #fedf89; color: #93370d; }
.banner.error { background: #fef3f2; border-color: #fecdca; color: #b42318; }
.banner ul { margin: 4px 0 0; padding-left: 18px; }
.list { padding: 4px 8px; }
.row { display: flex; align-items: center; gap: 12px; padding: 6px 6px; border-bottom: 1px solid #f0f2f5; cursor: pointer; user-select: none; }
.row.head { cursor: default; font-weight: 600; color: #667085; }
.row.sel { background: #eef3ff; }
.row .name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.row .type { width: 90px; color: #667085; }
.row .res { width: 120px; text-align: right; color: #667085; }
.row .act { width: 56px; }
.confirm-actions { display: flex; gap: 8px; margin-top: 8px; }
.row .res.formatted { color: #067647; }
.row .res.error { color: #b42318; }
`;
