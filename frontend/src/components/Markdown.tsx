import type { ReactNode } from 'react';

/** Lightweight markdown → JSX (bold, italic, bullets, headers). No library needed. */
export function Markdown({ text }: { text: string }) {
  const lines = text.split('\n');
  const elements: ReactNode[] = [];
  let listItems: ReactNode[] = [];

  const flushList = () => {
    if (listItems.length > 0) {
      elements.push(<ul key={`ul-${elements.length}`} className="chat-md-list">{listItems}</ul>);
      listItems = [];
    }
  };

  const inlineFormat = (s: string, key: string): ReactNode => {
    const parts: ReactNode[] = [];
    const regex = /\*\*(.+?)\*\*|\*(.+?)\*/g;
    let match;
    let lastEnd = 0;
    let idx = 0;
    while ((match = regex.exec(s)) !== null) {
      if (match.index > lastEnd) parts.push(s.slice(lastEnd, match.index));
      if (match[1]) parts.push(<strong key={`${key}-b${idx++}`}>{match[1]}</strong>);
      else if (match[2]) parts.push(<em key={`${key}-i${idx++}`}>{match[2]}</em>);
      lastEnd = match.index + match[0].length;
    }
    if (lastEnd < s.length) parts.push(s.slice(lastEnd));
    return parts.length === 1 && typeof parts[0] === 'string' ? parts[0] : <>{parts}</>;
  };

  lines.forEach((line, i) => {
    const trimmed = line.trim();

    if (/^[-*•]\s+/.test(trimmed)) {
      listItems.push(<li key={`li-${i}`}>{inlineFormat(trimmed.replace(/^[-*•]\s+/, ''), `li-${i}`)}</li>);
      return;
    }
    if (/^\d+\.\s+/.test(trimmed)) {
      listItems.push(<li key={`li-${i}`}>{inlineFormat(trimmed.replace(/^\d+\.\s+/, ''), `li-${i}`)}</li>);
      return;
    }

    flushList();

    if (trimmed.startsWith('### ')) {
      elements.push(<h4 key={`h-${i}`} className="chat-md-h">{inlineFormat(trimmed.slice(4), `h-${i}`)}</h4>);
    } else if (trimmed.startsWith('## ')) {
      elements.push(<h3 key={`h-${i}`} className="chat-md-h">{inlineFormat(trimmed.slice(3), `h-${i}`)}</h3>);
    } else if (trimmed.startsWith('# ')) {
      elements.push(<h3 key={`h-${i}`} className="chat-md-h">{inlineFormat(trimmed.slice(2), `h-${i}`)}</h3>);
    } else if (trimmed === '') {
      elements.push(<div key={`br-${i}`} className="chat-md-break" />);
    } else {
      elements.push(<p key={`p-${i}`}>{inlineFormat(trimmed, `p-${i}`)}</p>);
    }
  });

  flushList();
  return <>{elements}</>;
}
