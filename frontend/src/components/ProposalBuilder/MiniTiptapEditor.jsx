import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { TextStyle } from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'
import { useEffect } from 'react'

const COLOR_PRESETS = [
  { label: 'Red', value: '#ef4444' },
  { label: 'Green', value: '#22c55e' },
  { label: 'Orange', value: '#f97316' },
  { label: 'Grey', value: '#94a3b8' },
  { label: 'Yellow', value: '#eab308' },
]

// Compact Tiptap editor for list items, table cells, and headers
export default function MiniTiptapEditor({ value, onChange, placeholder = '...', style = {} }) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false }),
      Placeholder.configure({ placeholder }),
      TextStyle,
      Color,
    ],
    content: value || '',
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML())
    },
    editorProps: {
      attributes: {
        class: 'mini-tiptap-content',
        style: 'color: inherit; background: transparent; border: none; outline: none; font-size: inherit; width: 100%; min-height: 24px; padding: 2px 4px; line-height: 1.5;',
      },
    },
  })

  useEffect(() => {
    if (editor && value !== undefined && value !== editor.getHTML()) {
      editor.commands.setContent(value || '', false)
    }
  }, [value])

  if (!editor) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, ...style }}>
      <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center', padding: '2px 4px', background: '#1e293b', borderRadius: 4, marginBottom: 2 }}>
        <button type="button" onClick={() => editor.chain().focus().toggleBold().run()} title="Bold"
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: 11, color: editor.isActive('bold') ? '#7c3aed' : '#94a3b8', padding: '1px 3px' }}>B</button>
        <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()} title="Italic"
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontStyle: 'italic', fontSize: 11, color: editor.isActive('italic') ? '#7c3aed' : '#94a3b8', padding: '1px 3px' }}>I</button>
        <span style={{ width: 1, height: 10, background: '#334155', margin: '0 2px' }} />
        <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} title="H1"
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, fontWeight: 'bold', color: editor.isActive('heading', { level: 1 }) ? '#7c3aed' : '#94a3b8', padding: '1px 3px' }}>H1</button>
        <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="H2"
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, fontWeight: 'bold', color: editor.isActive('heading', { level: 2 }) ? '#7c3aed' : '#94a3b8', padding: '1px 3px' }}>H2</button>
        <span style={{ width: 1, height: 10, background: '#334155', margin: '0 2px' }} />
        {COLOR_PRESETS.map(color => (
          <button key={color.value} type="button" title={`Color: ${color.label}`}
            onClick={() => { if (editor.state.selection.from !== editor.state.selection.to) { editor.chain().focus().setColor(color.value).run() } else { editor.chain().setColor(color.value).run() } }}
            style={{ width: 12, height: 12, borderRadius: '50%', background: color.value, border: 'none', cursor: 'pointer', padding: 0, opacity: editor.isActive('textStyle', { color: color.value }) ? 1 : 0.6 }} />
        ))}
        <button type="button" title="Clear color"
          onClick={() => { if (editor.state.selection.from !== editor.state.selection.to) { editor.chain().focus().unsetColor().run() } else { editor.chain().unsetColor().run() } }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 8, color: '#94a3b8', padding: '1px 2px' }}>╳</button>
      </div>
      <div style={{ flex: 1, minHeight: 24, position: 'relative' }}>
        <EditorContent editor={editor} />
      </div>
      <style>{`
        .mini-tiptap-content .ProseMirror { padding: 2px 4px; min-height: 24px; outline: none; color: inherit; }
        .mini-tiptap-content .ProseMirror p.is-editor-empty:first-child::before { color: #475569; content: attr(data-placeholder); float: left; height: 0; pointer-events: none; }
        .mini-tiptap-content .ProseMirror h1 { font-size: 1rem; font-weight: bold; color: inherit; margin: 0; }
        .mini-tiptap-content .ProseMirror h2 { font-size: 0.9rem; font-weight: bold; color: inherit; margin: 0; }
        .mini-tiptap-content .ProseMirror p { margin: 0; }
      `}</style>
    </div>
  )
}