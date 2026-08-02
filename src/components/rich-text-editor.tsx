import { useEffect, useRef } from "react";
import { Bold, Heading2, Heading3, Italic, Link2, List, ListOrdered, Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { sanitizeRichTextHtml } from "@/lib/rich-text";

type RichTextEditorProps = {
  value: string;
  onChange: (value: string) => void;
  direction?: "ltr" | "rtl";
  ariaLabel: string;
  placeholder?: string;
};

export function RichTextEditor({
  value,
  onChange,
  direction = "ltr",
  ariaLabel,
  placeholder,
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const editor = editorRef.current;
    const safeValue = sanitizeRichTextHtml(value);
    if (editor && editor.innerHTML !== safeValue) editor.innerHTML = safeValue;
  }, [value]);

  const run = (command: string, argument?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, argument);
    onChange(sanitizeRichTextHtml(editorRef.current?.innerHTML ?? ""));
  };

  const addLink = () => {
    const url = window.prompt(
      direction === "rtl" ? "أدخل رابطًا آمنًا" : "Enter a secure link URL",
      "https://",
    );
    if (!url) return;
    run("createLink", url);
  };

  const addTable = () => {
    const rowsInput = window.prompt(direction === "rtl" ? "عدد الصفوف" : "Number of rows", "3");
    if (rowsInput === null) return;
    const columnsInput = window.prompt(
      direction === "rtl" ? "عدد الأعمدة" : "Number of columns",
      "3",
    );
    if (columnsInput === null) return;
    const rows = Math.min(20, Math.max(1, Number.parseInt(rowsInput, 10) || 0));
    const columns = Math.min(10, Math.max(1, Number.parseInt(columnsInput, 10) || 0));
    if (!rows || !columns) return;
    const header = `<thead><tr>${Array.from({ length: columns }, (_, index) => `<th>${direction === "rtl" ? `عنوان ${index + 1}` : `Heading ${index + 1}`}</th>`).join("")}</tr></thead>`;
    const body = `<tbody>${Array.from({ length: rows }, () => `<tr>${Array.from({ length: columns }, () => "<td>&nbsp;</td>").join("")}</tr>`).join("")}</tbody>`;
    run("insertHTML", `<table>${header}${body}</table><p><br></p>`);
  };

  const tools = [
    { label: direction === "rtl" ? "عريض" : "Bold", icon: Bold, action: () => run("bold") },
    { label: direction === "rtl" ? "مائل" : "Italic", icon: Italic, action: () => run("italic") },
    {
      label: direction === "rtl" ? "عنوان رئيسي" : "Heading 2",
      icon: Heading2,
      action: () => run("formatBlock", "h2"),
    },
    {
      label: direction === "rtl" ? "عنوان فرعي" : "Heading 3",
      icon: Heading3,
      action: () => run("formatBlock", "h3"),
    },
    {
      label: direction === "rtl" ? "قائمة نقطية" : "Bullet list",
      icon: List,
      action: () => run("insertUnorderedList"),
    },
    {
      label: direction === "rtl" ? "قائمة مرقمة" : "Numbered list",
      icon: ListOrdered,
      action: () => run("insertOrderedList"),
    },
    { label: direction === "rtl" ? "إضافة رابط" : "Add link", icon: Link2, action: addLink },
    { label: direction === "rtl" ? "إضافة جدول" : "Insert table", icon: Table2, action: addTable },
  ];

  return (
    <div className="overflow-hidden rounded-xl border bg-background shadow-sm focus-within:ring-2 focus-within:ring-ring/30">
      <div className="flex flex-wrap gap-1 border-b bg-muted/40 p-2" dir={direction}>
        {tools.map(({ label, icon: Icon, action }) => (
          <Button
            key={label}
            type="button"
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            title={label}
            aria-label={label}
            onMouseDown={(event) => event.preventDefault()}
            onClick={action}
          >
            <Icon className="h-4 w-4" />
          </Button>
        ))}
      </div>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={ariaLabel}
        data-placeholder={placeholder}
        dir={direction}
        onInput={(event) => onChange(sanitizeRichTextHtml(event.currentTarget.innerHTML))}
        className={cn(
          "min-h-56 px-4 py-3 text-sm leading-7 outline-none",
          "empty:before:pointer-events-none empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)]",
          "[&_a]:text-primary [&_a]:underline [&_h2]:mb-3 [&_h2]:mt-4 [&_h2]:text-2xl [&_h2]:font-semibold",
          "[&_h3]:mb-2 [&_h3]:mt-3 [&_h3]:text-xl [&_h3]:font-semibold [&_li]:my-1",
          "[&_ol]:my-3 [&_ol]:list-decimal [&_ol]:ps-6 [&_p]:my-2 [&_ul]:my-3 [&_ul]:list-disc [&_ul]:ps-6",
          "[&_table]:my-4 [&_table]:w-full [&_table]:border-collapse [&_th]:border [&_th]:bg-muted [&_th]:p-2 [&_th]:font-semibold [&_td]:border [&_td]:p-2",
          direction === "rtl" ? "text-right" : "text-left",
        )}
      />
    </div>
  );
}
