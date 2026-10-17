import { useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { EditorView } from "@codemirror/view";
import { markdown } from "@codemirror/lang-markdown";
import { javascript } from "@codemirror/lang-javascript";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

export type Lang = "markdown" | "javascript" | "html" | "css";

/* Light editor in the site's colours; syntax colours are the same as code blocks in posts (template/hljs.css). */
const studioTheme = EditorView.theme(
  {
    "&": { height: "100%", fontSize: "13px", backgroundColor: "var(--ed-bg)", color: "var(--fg)" },
    ".cm-scroller": { fontFamily: '"JetBrains Mono", ui-monospace, Menlo, Consolas, monospace', lineHeight: "1.75" },
    ".cm-gutters": { backgroundColor: "var(--bg)", borderRight: "1px solid var(--line)", color: "var(--faint)" },
    ".cm-activeLine": { backgroundColor: "rgba(0, 0, 205, 0.035)" },
    ".cm-activeLineGutter": { backgroundColor: "rgba(0, 0, 205, 0.06)", color: "var(--accent)" },
    ".cm-content": { padding: "14px 0 40vh", caretColor: "var(--accent)" },
    ".cm-line": { padding: "0 18px 0 10px" },
    "&.cm-focused": { outline: "none" },
    ".cm-cursor": { borderLeftColor: "var(--accent)", borderLeftWidth: "2px" },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": { backgroundColor: "rgba(0, 0, 205, 0.12) !important" },
    ".cm-matchingBracket": { backgroundColor: "rgba(0, 0, 205, 0.1)", outline: "1px solid rgba(0, 0, 205, 0.25)" },
    ".cm-foldPlaceholder": { backgroundColor: "var(--secondary)", border: "1px solid var(--line-2)", color: "var(--muted)" },
    ".cm-tooltip": { backgroundColor: "var(--panel)", border: "1px solid var(--line-2)" },
    ".cm-tooltip-autocomplete ul li[aria-selected]": { backgroundColor: "var(--accent-soft)", color: "var(--accent)" },
  },
  { dark: false },
);

const siteHighlight = syntaxHighlighting(HighlightStyle.define([
  { tag: [t.keyword, t.modifier, t.controlKeyword, t.operatorKeyword, t.bool, t.null], color: "#7c3aed" },
  { tag: [t.string, t.special(t.string), t.regexp], color: "#15803d" },
  { tag: [t.number, t.atom], color: "#b45309" },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.heading], color: "#2563eb" },
  { tag: t.heading, fontWeight: "600", color: "#0000cd" },
  { tag: [t.comment, t.lineComment, t.blockComment], color: "#9ca3af", fontStyle: "italic" },
  { tag: [t.typeName, t.className, t.tagName], color: "#0e7490" },
  { tag: [t.propertyName, t.attributeName, t.definition(t.variableName)], color: "#be185d" },
  { tag: [t.meta, t.processingInstruction], color: "#6b7280" },
  { tag: [t.link, t.url], color: "#0000cd", textDecoration: "underline" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strong, fontWeight: "700" },
  { tag: t.quote, color: "#71717a", fontStyle: "italic" },
]));

export function CodeEditor(props: {
  value: string;
  lang: Lang;
  onChange: (v: string) => void;
  onView?: (v: EditorView) => void;
  wrap?: boolean;
}) {
  const extensions = useMemo(() => {
    const l = { markdown: markdown(), javascript: javascript(), html: html(), css: css() }[props.lang];
    return [l, studioTheme, siteHighlight, ...(props.wrap ? [EditorView.lineWrapping] : [])];
  }, [props.lang, props.wrap]);

  return (
    <CodeMirror
      className="editor"
      value={props.value}
      height="100%"
      theme="light"
      extensions={extensions}
      onChange={props.onChange}
      onCreateEditor={(view) => props.onView?.(view)}
      basicSetup={{ foldGutter: true, highlightActiveLine: true, bracketMatching: true, autocompletion: true, tabSize: 2 }}
    />
  );
}
