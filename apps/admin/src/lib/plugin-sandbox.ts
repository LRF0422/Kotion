/**
 * Build a self-contained, origin-isolated HTML document that executes a plugin
 * artifact inside a sandboxed iframe. Console output and errors are forwarded to
 * the parent through postMessage; the document cannot touch the host page.
 */
export const buildSandboxDocument = (source: string): string => {
  // Prevent the artifact from prematurely closing the injected script element.
  const safeSource = source.replace(/<\/script/gi, '<\\/script')
  const harness = [
    '(function(){',
    'function emit(level,args){try{parent.postMessage({__pluginPreview:true,level:level,',
    'message:Array.prototype.map.call(args,function(a){try{return typeof a==="string"?a:JSON.stringify(a)}',
    'catch(e){return String(a)}}).join(" ")},"*")}catch(e){}}',
    '["log","info","warn","error"].forEach(function(k){var o=console[k]?console[k].bind(console):function(){};',
    'console[k]=function(){emit(k,arguments);o.apply(null,arguments)}});',
    'window.addEventListener("error",function(e){emit("error",[e.message])});',
    'window.addEventListener("unhandledrejection",function(e){emit("error",[e.reason&&e.reason.message||String(e.reason)])});',
    '})();',
  ].join('')
  return [
    '<!doctype html><html><head><meta charset="utf-8"/>',
    '<style>html,body{margin:0;padding:12px;background:#fff;color:#0f172a;',
    'font:13px/1.5 ui-monospace,Menlo,monospace}#log{color:#64748b;white-space:pre-wrap}</style>',
    '</head><body><div id="log">sandbox ready</div>',
    '<scr' + 'ipt>' + harness + '</scr' + 'ipt>',
    '<scr' + 'ipt type="module">' + safeSource + '</scr' + 'ipt>',
    '</body></html>',
  ].join('')
}
