import { useState } from 'react'

const BLOCK_TYPES = [
  { type: 'cover', label: 'Cover Page', icon: '🎨', description: 'Logo, title, client, date' },
  { type: 'text', label: 'Text Block', icon: '📝', description: 'Rich text paragraph' },
  { type: 'pricing', label: 'Pricing Table', icon: '💰', description: 'Price breakdown' },
  { type: 'timeline', label: 'Timeline', icon: '📅', description: 'Phase/week timeline' },
  { type: 'features', label: 'Features List', icon: '✨', description: 'In/Out scope' },
  { type: 'payment', label: 'Payment Terms', icon: '💳', description: 'Payment schedule' },
  { type: 'terms', label: 'Terms & Conditions', icon: '📋', description: 'Legal terms' },
  { type: 'footer', label: 'Footer/Signature', icon: '✍️', description: 'Sign-off block' },
]

const STARTER_TEMPLATES = {
  executive: {
    name: 'Executive',
    blocks: [
      { id: 'c1', type: 'cover', content: { title: '', client: '', date: '', preparedBy: '' } },
      { id: 't1', type: 'text', content: { text: 'We are pleased to submit the following proposal for your review.' } },
      { id: 'pr1', type: 'pricing', content: { items: [{ label: 'Development', price: 0 }] } },
      { id: 'tm1', type: 'timeline', content: { phases: [] } },
      { id: 'py1', type: 'payment', content: { terms: [] } },
    ]
  },
  modern: {
    name: 'Modern Tech',
    blocks: [
      { id: 'c1', type: 'cover', content: { title: '', client: '', date: '', preparedBy: '' } },
      { id: 'f1', type: 'features', content: { inScope: [], outScope: [] } },
      { id: 't1', type: 'text', content: { text: '' } },
      { id: 'pr1', type: 'pricing', content: { items: [] } },
    ]
  },
  simple: {
    name: 'Simple',
    blocks: [
      { id: 'c1', type: 'cover', content: { title: '', client: '', date: '', preparedBy: '' } },
      { id: 'pr1', type: 'pricing', content: { items: [] } },
    ]
  }
}

export { BLOCK_TYPES, STARTER_TEMPLATES }
