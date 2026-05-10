import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { useEffect } from 'react'

export default function TiptapEditor({ content, onChange, placeholder = 'Start typing...' }) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Placeholder.configure({ placeholder }),
    ],
    content: content || '',
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML())
    },
    editorProps: {
      attributes: {
        class: 'prose prose-invert max-w-none text-gray-100 p-3 min-h-[80px] focus:outline-none text-sm',
      },
    },
  })

  useEffect(() => {
    if (editor && content !== undefined) {
      const currentHTML = editor.getHTML()
      if (content !== currentHTML) {
        editor.commands.setContent(content || '', false)
      }
    }
  }, [content])

  if (!editor) return null

  return (
    <div className="tiptap-wrapper">
      {/* Toolbar */}
      <div className="tiptap-toolbar flex flex-wrap gap-1 p-2 bg-slate-800 rounded-t-lg border border-slate-600">
        <button type="button" onClick={() => editor.chain().focus().toggleBold().run()}
          className={`px-2 py-1 rounded text-xs font-bold ${editor.isActive('bold') ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-200 hover:bg-slate-600'}`}>
          B
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()}
          className={`px-2 py-1 rounded text-xs italic ${editor.isActive('italic') ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-200 hover:bg-slate-600'}`}>
          I
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleStrike().run()}
          className={`px-2 py-1 rounded text-xs line-through ${editor.isActive('strike') ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-200 hover:bg-slate-600'}`}>
          S
        </button>
        <span className="w-px h-5 bg-slate-600 mx-1" />
        <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          className={`px-2 py-1 rounded text-xs ${editor.isActive('heading', { level: 1 }) ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-200 hover:bg-slate-600'}`}>
          H1
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className={`px-2 py-1 rounded text-xs ${editor.isActive('heading', { level: 2 }) ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-200 hover:bg-slate-600'}`}>
          H2
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          className={`px-2 py-1 rounded text-xs ${editor.isActive('heading', { level: 3 }) ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-200 hover:bg-slate-600'}`}>
          H3
        </button>
        <span className="w-px h-5 bg-slate-600 mx-1" />
        <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={`px-2 py-1 rounded text-xs ${editor.isActive('bulletList') ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-200 hover:bg-slate-600'}`}>
          •
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={`px-2 py-1 rounded text-xs ${editor.isActive('orderedList') ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-200 hover:bg-slate-600'}`}>
          1.
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleBlockquote().run()}
          className={`px-2 py-1 rounded text-xs ${editor.isActive('blockquote') ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-200 hover:bg-slate-600'}`}>
          ❝
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleCode().run()}
          className={`px-2 py-1 rounded text-xs ${editor.isActive('code') ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-200 hover:bg-slate-600'}`}>
          {'</>'}
        </button>
        <span className="w-px h-5 bg-slate-600 mx-1" />
        <button type="button" onClick={() => editor.chain().focus().setHorizontalRule().run()}
          className="px-2 py-1 rounded text-xs bg-slate-700 text-slate-200 hover:bg-slate-600">
          —
        </button>
      </div>
      {/* Editor */}
      <div className="bg-slate-900 rounded-b-lg border border-t-0 border-slate-600">
        <EditorContent editor={editor} />
      </div>
      <style>{`
        .tiptap-toolbar .tiptap-toolbar button { min-width: 28px; }
        .ProseMirror { min-height: 80px; }
        .ProseMirror p.is-editor-empty:first-child::before { color: #64748b; content: attr(data-placeholder); float: left; height: 0; pointer-events: none; }
        .ProseMirror h1 { font-size: 1.5rem; font-weight: bold; color: #f1f5f9; margin: 0.5rem 0; }
        .ProseMirror h2 { font-size: 1.25rem; font-weight: bold; color: #f1f5f9; margin: 0.5rem 0; }
        .ProseMirror h3 { font-size: 1.1rem; font-weight: bold; color: #f1f5f9; margin: 0.5rem 0; }
        .ProseMirror ul { list-style: disc; padding-left: 1.5rem; color: #e2e8f0; }
        .ProseMirror ol { list-style: decimal; padding-left: 1.5rem; color: #e2e8f0; }
        .ProseMirror blockquote { border-left: 3px solid #7c3aed; padding-left: 1rem; color: #94a3b8; font-style: italic; }
        .ProseMirror code { background: #334155; padding: 0.1rem 0.3rem; border-radius: 4px; font-size: 0.875rem; }
      `}</style>
    </div>
  )
}
