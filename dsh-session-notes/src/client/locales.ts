/** Bilingual copy for the session-notes surface. */

export const NS = 'session-notes'

export const zh = {
  'header.open': '📝 备注',
  'edit.title': '本会话备注',
  'edit.placeholder': '给这个会话写点备注：想记住的提示语、结论、待办…',
  'edit.save': '保存',
  'edit.saved': '已保存 ✓',
  'edit.copy': '复制',
  'edit.copied': '已复制 ✓',
  'edit.delete': '删除',
  'edit.empty': '（暂无备注）',
  'bar.toggle': '显示底部备注栏',
  'all.title': '全部备注',
  'all.empty': '还没有任何备注。写下第一条，之后从这里直达。',
  'all.filter': '筛选：标题 / 工作区 / 备注…',
  'all.noMatch': '没有匹配的备注',
  'edit.pin': '置顶',
  'edit.unpin': '取消置顶',
  'all.open': '打开',
  'bar.label': '备注',
  'bar.add': '＋ 给本会话加备注',
  'bar.empty': '本会话还没有备注 — 点这里写一条',
  'bar.list': '会话列表',
  'bar.list.empty': '还没有任何备注',
  'all.current': '本会话',
  'error.load': '备注加载失败',
  'error.save': '保存失败',
} as const

export type NotesKey = keyof typeof zh

export const en: Record<NotesKey, string> = {
  'header.open': '📝 Notes',
  'edit.title': 'Note for this session',
  'edit.placeholder': 'Write a note for this session: prompts, conclusions, todos…',
  'edit.save': 'Save',
  'edit.saved': 'Saved ✓',
  'edit.copy': 'Copy',
  'edit.copied': 'Copied ✓',
  'edit.delete': 'Delete',
  'edit.empty': '(no note yet)',
  'bar.toggle': 'Show bottom notes bar',
  'all.title': 'All notes',
  'all.empty': 'No notes yet. Write the first one, then jump back from here.',
  'all.filter': 'Filter: title / workspace / note…',
  'all.noMatch': 'No matching notes',
  'edit.pin': 'Pin',
  'edit.unpin': 'Unpin',
  'all.open': 'Open',
  'bar.label': 'Note',
  'bar.add': '＋ Add a note for this session',
  'bar.empty': 'No note for this session — click to write one',
  'bar.list': 'Session list',
  'bar.list.empty': 'No notes yet',
  'all.current': 'This one',
  'error.load': 'Failed to load notes',
  'error.save': 'Failed to save',
}

export const dictionaries = { zh, en }
